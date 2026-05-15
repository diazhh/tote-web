/**
 * Phase 13 Plan 13-03 — Contabilidad end-to-end integration test.
 *
 * Hits the LIVE local docker postgres (tote_postgres @ localhost:5433) via an
 * INLINE express app — mirrors Phase 11's `draw-financial-pipeline.integration.test.js`
 * + Phase 12's `commission-pipeline.integration.test.js` harness style. No supertest
 * dependency; uses native fetch against the ephemeral port the test owns.
 *
 * Inline-app shape: builds a minimal express() that registers
 *   - app.set('trust proxy', 1)   // matches index.js:24 (P-8 mitigation)
 *   - express.json()
 *   - staticStorageGuard mounted BEFORE express.static('/storage')   // P-1
 *   - express.static('/storage', ...)                                 // P-1 second half
 *   - /api/contabilidad → contabilidad.routes.js
 * then `app.listen(0)` on a random port. This isolates the test from the
 * production index.js bootstrap (which spins up sockets, queues, telegram bots,
 * etc. — none of which Phase 13 needs).
 *
 * Tests (6 assertions per the plan's Task 4 <behavior>):
 *   1. happy path: POST rate → POST USD entry → assert amountBsF=2000 and exchangeRateId locked (F-7)
 *   2. F-6 backend block: USD entry without rate → 400 with explicit message
 *   3. F-14 MIME spoof: HTML buffer renamed evil.pdf → 422 + no file on disk
 *   4. F-14 happy upload: real PDF magic bytes → 201 + file exists at YYYY/MM bucket
 *   5. P-1 guard: GET /storage/receipts/* → 401
 *   6. D-06 reversal + D-07 AuditLog count = 4 with non-null ipAddress + userAgent
 *
 * Cleanup: TEST_PREFIX-scoped DELETEs in afterAll (no afterEach because all 6
 * tests build on the same scenario — the prior test's row is the next test's
 * fixture).
 *
 * Run with: cd backend && npm test -- contabilidad.integration
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load backend/.env so DATABASE_URL + JWT_SECRET are present in process.env
// before importing modules that read them at import-time.
dotenv.config({ path: path.join(process.cwd(), '.env') });

const { prisma } = await import('../lib/prisma.js');
const { staticStorageGuard } = await import('../middlewares/static-storage-guard.middleware.js');
const contabilidadRoutes = (await import('../routes/contabilidad.routes.js')).default;

const TEST_PREFIX = `TEST-13-${Date.now()}-${process.pid}`;
const ENTRY_DATE = '2026-05-15';                              // unique-ish date inside the test window
const RATE_BS_PER_USD = '200.00000000';                       // pretty exact rate to dodge float drift

let app;
let server;
let baseUrl;
let adminToken;
let adminUser;
let categoryId;
let rateId;
let entryId;
let attachmentId;
let reversalId;
let createdEntryDate;                                          // string from API response

// Minimal valid PDF: header + EOF marker. file-type recognises it as application/pdf.
const VALID_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'utf8',
);
// HTML masquerading as PDF — should be rejected at 422 (F-14).
const HTML_BYTES = Buffer.from('<!DOCTYPE html><html><body>evil</body></html>', 'utf8');

// ── Helpers ─────────────────────────────────────────────────────────────

async function api(method, p, { token = adminToken, body, contentType = 'application/json' } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
    if (contentType === 'application/json') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    } else {
      payload = body;                                          // already prepared (e.g. FormData)
    }
  }
  const res = await fetch(`${baseUrl}${p}`, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: res.status, data };
}

async function uploadAttachment(entryIdLocal, buffer, filename) {
  // multipart/form-data — handcraft a minimal body so we don't add a test-only dep.
  const boundary = `----jest-${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, buffer, tail]);
  const res = await fetch(`${baseUrl}/api/contabilidad/asientos/${entryIdLocal}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: res.status, data };
}

// ── Setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Pick the seeded admin@tote.com if it exists, else any admin user.
  adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true, email: 'admin@tote.com' },
  });
  if (!adminUser) {
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
  }
  if (!adminUser) throw new Error('No active ADMIN user in local DB — seed before running this test');

  // Sign a JWT directly using the same secret the middleware verifies against
  // (avoids needing the seeded user's password).
  adminToken = jwt.sign(
    {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role,
      apiSystemId: adminUser.apiSystemId ?? null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  // Resolve an EXPENSE category (seed: Sueldos / Internet / Alquiler / ...)
  const category = await prisma.category.findFirst({
    where: { appliesTo: 'EXPENSE', isActive: true },
  });
  if (!category) throw new Error('No active EXPENSE category in local DB — seed before running this test');
  categoryId = category.id;

  // Build inline express app — same critical wiring as index.js for Phase 13 paths.
  app = express();
  app.set('trust proxy', 1);                                   // P-8 — make req.ip work as in prod
  app.use(express.json());
  // P-1: guard BEFORE static. Static mount points at backend/storage so the
  // happy-path PDF lands at the same path the static handler would otherwise serve.
  app.use('/storage', staticStorageGuard);
  app.use('/storage', express.static(path.join(process.cwd(), 'storage')));
  app.use('/api/contabilidad', contabilidadRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  // Cleanup — TEST_PREFIX-scoped so concurrent / repeated runs don't collide.
  try {
    if (attachmentId) {
      await prisma.accountingEntryAttachment.deleteMany({ where: { id: attachmentId } }).catch(() => {});
    }
    if (reversalId) {
      await prisma.accountingEntry.deleteMany({ where: { id: reversalId } }).catch(() => {});
    }
    if (entryId) {
      await prisma.accountingEntry.deleteMany({ where: { id: entryId } }).catch(() => {});
    }
    if (rateId) {
      await prisma.exchangeRate.deleteMany({ where: { id: rateId } }).catch(() => {});
    }
    // Drop AuditLog rows for the entities we created.
    const ids = [rateId, entryId, reversalId, attachmentId].filter(Boolean);
    if (ids.length) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
    }
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await prisma.$disconnect().catch(() => {});
  }
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('Phase 13 — contabilidad integration', () => {
  test('1. happy path: rate + USD entry locks amountBsF=2000 and exchangeRateId (F-7)', async () => {
    // Create rate
    const rateRes = await api('POST', '/api/contabilidad/tasas', {
      body: {
        date: ENTRY_DATE,
        rateBsPerUsd: RATE_BS_PER_USD,
        rateType: 'BCV',
        notes: `${TEST_PREFIX}-rate`,
      },
    });
    expect(rateRes.status).toBe(201);
    expect(rateRes.data.success).toBe(true);
    rateId = rateRes.data.data.id;

    // Create USD entry on the same date → amountBsF computed = 10 * 200 = 2000
    const entryRes = await api('POST', '/api/contabilidad/asientos', {
      body: {
        type: 'EXPENSE',
        entryDate: ENTRY_DATE,
        categoryId,
        currency: 'USD',
        amount: '10',
        description: `${TEST_PREFIX}-expense`,
      },
    });
    expect(entryRes.status).toBe(201);
    expect(entryRes.data.success).toBe(true);
    entryId = entryRes.data.data.id;
    createdEntryDate = entryRes.data.data.entryDate;
    // amountBsF is Decimal(18,8). The JSON round-trip strips trailing zeros
    // (Prisma's Decimal → JSON renders the canonical decimal form), so compare
    // numerically. Full 8-decimal precision is preserved in the DB column —
    // re-fetch via Prisma to verify the on-disk representation.
    expect(Number(entryRes.data.data.amountBsF)).toBeCloseTo(2000, 8);
    expect(entryRes.data.data.exchangeRateId).toBe(rateId);     // F-7 lock

    // Authoritative precision check: read the row back via prisma — the
    // raw value carries the @db.Decimal(18,8) shape end-to-end.
    const row = await prisma.accountingEntry.findUnique({ where: { id: entryId } });
    expect(row.amountBsF.toFixed(8)).toBe('2000.00000000');
    expect(row.exchangeRateId).toBe(rateId);
  });

  test('2. F-6 backend block: USD entry without rate for entryDate → 400', async () => {
    const res = await api('POST', '/api/contabilidad/asientos', {
      body: {
        type: 'EXPENSE',
        entryDate: '2026-04-01',                                // no rate seeded for this date in this test
        categoryId,
        currency: 'USD',
        amount: '5',
        description: `${TEST_PREFIX}-no-rate`,
      },
    });
    expect(res.status).toBe(400);
    // Service throws NoRateForDateError → controller maps to 400. Message contains "tasa de cambio" or "rate".
    const msg = String(res.data?.error || res.data?.message || '').toLowerCase();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.includes('tasa') || msg.includes('rate')).toBe(true);
  });

  test('3. F-14 MIME spoof: HTML renamed evil.pdf → 422 and NO file lands on disk', async () => {
    // Snapshot the receipts dir before the upload so we can verify nothing
    // matching this test's window appears after.
    const yyyymm = ENTRY_DATE.slice(0, 7).replace('-', '/');
    const targetDir = path.join(process.cwd(), 'storage', 'receipts', yyyymm);
    const before = existsSync(targetDir) ? await fs.readdir(targetDir) : [];

    const res = await uploadAttachment(entryId, HTML_BYTES, 'evil.pdf');
    expect(res.status).toBe(422);
    expect(String(res.data?.error || '').toLowerCase()).toContain('tipo de archivo');

    const after = existsSync(targetDir) ? await fs.readdir(targetDir) : [];
    // No new files appeared in the entry's YYYY/MM bucket as a result of the rejected upload.
    expect(after.length).toBe(before.length);
  });

  test('4. F-14 happy upload: valid PDF → 201 and file exists at YYYY/MM bucket', async () => {
    const res = await uploadAttachment(entryId, VALID_PDF_BYTES, 'receipt.pdf');
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.mimeType).toBe('application/pdf');
    attachmentId = res.data.data.id;

    // entryDate from API may be ISO with time — slice the date part.
    const datePart = String(createdEntryDate).slice(0, 10);
    const [yyyy, mm] = datePart.split('-');
    const expectedPath = path.join(
      process.cwd(),
      'storage',
      'receipts',
      yyyy,
      mm,
      res.data.data.filename,
    );
    expect(existsSync(expectedPath)).toBe(true);
  });

  test('5. P-1 guard: GET /storage/receipts/* without auth → 401', async () => {
    const res = await fetch(`${baseUrl}/storage/receipts/2026/05/anything.pdf`);
    expect(res.status).toBe(401);
  });

  test('6. D-06 reversal + D-07 AuditLog count = 4 with non-null ipAddress + userAgent', async () => {
    const res = await api('POST', `/api/contabilidad/asientos/${entryId}/reverse`, {
      body: { reversalReason: `${TEST_PREFIX}-reverse` },
    });
    // Service returns 201 (new entry created). The controller's success path uses res.status(201).json(...)
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    reversalId = res.data.data.id;
    // Same JSON-strips-trailing-zeros story as test 1 — verify the magnitude
    // on the wire, then assert full 8-decimal precision on the DB row.
    expect(Number(res.data.data.amountBsF)).toBeCloseTo(-2000, 8);
    const reversalRow = await prisma.accountingEntry.findUnique({ where: { id: reversalId } });
    expect(reversalRow.amountBsF.toFixed(8)).toBe('-2000.00000000');

    // Now count AuditLog rows touching our entities: rateId + entryId + attachmentId + reversalId
    // Expected: 4 rows total
    //   1. CREATE ExchangeRate    (rateId)        — written by exchange-rate.controller.create
    //   2. CREATE AccountingEntry (entryId)       — written by accounting-entry.controller.create
    //   3. UPLOAD AccountingEntryAttachment (attachmentId) — written by attachment.controller.upload
    //   4. REVERSE AccountingEntry (entryId)      — written by accounting-entry.controller.reverse
    const rows = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'ExchangeRate', entityId: rateId },
          { entity: 'AccountingEntry', entityId: entryId },
          { entity: 'AccountingEntryAttachment', entityId: attachmentId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.length).toBe(4);

    // P-4: every row carries the full diagnostic triple
    for (const row of rows) {
      expect(row.userId).toBe(adminUser.id);
      expect(row.ipAddress).toBeTruthy();                       // app.set('trust proxy', 1) populates req.ip
      expect(row.userAgent).toBeTruthy();                       // node fetch sets a UA header
    }

    // Sanity: the 4 actions are the expected mix
    const actions = rows.map((r) => `${r.entity}:${r.action}`).sort();
    expect(actions).toEqual(
      [
        'AccountingEntry:CREATE',
        'AccountingEntry:REVERSE',
        'AccountingEntryAttachment:UPLOAD',
        'ExchangeRate:CREATE',
      ].sort(),
    );
  });
});
