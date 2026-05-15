/**
 * Phase 12 Plan 12-03 — Provider commission engine end-to-end integration test.
 *
 * Hits the LIVE local docker postgres (tote_postgres @ localhost:5433). Seeds a
 * complete scenario — DrawFinancial + DrawFinancialProvider + ProviderCommissionConfig
 * — then invokes the service entrypoint (computeAndUpsertLedgerForDraw) directly
 * and asserts ProviderCommissionLedger rows appear with the exact computed amount.
 *
 * Tests:
 *   1. happy-path SALES_PCT 5.5% × 1000 = 55.00000000 (no float drift)
 *   2. D-01 silent skip when no config exists for the provider at drawnAt
 *   3. Idempotent re-run produces exactly 1 ledger row (D-08 explicit upsert)
 *   4. Pitfall 7 race-guard — worker throws DrawFinancialNotReadyError when
 *      DrawFinancial.totalizedAt is null
 *
 * Harness:
 *   - Direct prisma calls against the live local DB (mirrors Phase 11's
 *     draw-financial-pipeline.integration.test.js).
 *   - Unique TEST_PREFIX'd fixtures so concurrent runs don't collide.
 *   - afterEach cleans up its own draw/ledger; afterAll disconnects.
 *   - DATABASE_URL is read from process.env (loaded from backend/.env via the
 *     standard `npm test` script in package.json — same pattern as Phase 11).
 *
 * Reuses CLAUDE.md game id for LOTOANIMALITO so we don't have to seed a Game.
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { randomUUID } from 'crypto';

import { prisma } from '../lib/prisma.js';
import {
  computeAndUpsertLedgerForDraw,
} from '../services/commission.service.js';
import { calculateProviderCommissionWorker } from '../queue/workers/calculate-provider-commission.worker.js';
import { DrawFinancialNotReadyError } from '../services/commission.service.js';

// LOTOANIMALITO — pre-existing in local DB per CLAUDE.md (same UUID in prod).
const LOTOANIMALITO_ID = 'd953f80c-4335-4bc9-9f78-9b56193286fe';

// Unique per-run prefix so concurrent or repeated runs don't collide.
const TEST_PREFIX = `__test-comm-${Date.now()}-${process.pid}`;

// Track created resources for cleanup.
let createdDrawIds = [];
let createdConfigIds = [];
let createdApiSystemIds = [];

// ── Fixture helpers ───────────────────────────────────────────────────

async function createTestApiSystem(slug = '') {
  const sys = await prisma.apiSystem.create({
    data: {
      name: `${TEST_PREFIX}${slug}`,
      slug: `${TEST_PREFIX.toLowerCase()}${slug}`,
      mode: 'PUSH',
      isActive: true,
    },
  });
  createdApiSystemIds.push(sys.id);
  return sys;
}

/**
 * Create a unique Draw under LOTOANIMALITO with drawnAt in the past (well after
 * COMMISSION_GO_LIVE 2026-04-17 and inside a deterministic ISO week).
 */
async function createTestDraw({ drawnAt = new Date('2026-05-01T22:00:00Z'), prizesProcessed = true, status = 'DRAWN' } = {}) {
  const draw = await prisma.draw.create({
    data: {
      gameId: LOTOANIMALITO_ID,
      drawDate: drawnAt,
      drawTime: '18:00:00',
      status,
      closedAt: new Date(drawnAt.getTime() - 5 * 60 * 1000),
      drawnAt,
      prizesProcessed,
    },
  });
  createdDrawIds.push(draw.id);
  return draw;
}

async function createDrawFinancial(drawId, { totalSales = '1000.00', totalPrize = '200.00', utility = '800.00', ticketCount = 10, totalizedAt = new Date() } = {}) {
  // Prisma create handles updatedAt automatically.
  return prisma.drawFinancial.create({
    data: {
      drawId,
      totalSales,
      totalPrize,
      utility,
      ticketCount,
      closedAt: new Date(),
      totalizedAt,
    },
  });
}

async function createDrawFinancialProvider(drawId, apiSystemId, { totalSales = '1000.00', totalPrize = '200.00', ticketCount = 10 } = {}) {
  return prisma.drawFinancialProvider.create({
    data: {
      drawId,
      apiSystemId,
      totalSales,
      totalPrize,
      ticketCount,
    },
  });
}

async function createSalesConfig(apiSystemId, { salesRate = '5.5000', effectiveFrom = new Date('2026-04-17T00:00:00Z') } = {}) {
  const cfg = await prisma.providerCommissionConfig.create({
    data: {
      apiSystemId,
      formulaType: 'SALES_PCT',
      salesRate,
      effectiveFrom,
    },
  });
  createdConfigIds.push(cfg.id);
  return cfg;
}

// ── Cleanup ──────────────────────────────────────────────────────────

async function cleanupTestData() {
  if (createdDrawIds.length > 0) {
    await prisma.providerCommissionLedger.deleteMany({
      where: { drawId: { in: createdDrawIds } },
    });
    await prisma.drawFinancialProvider.deleteMany({
      where: { drawId: { in: createdDrawIds } },
    });
    await prisma.drawFinancial.deleteMany({
      where: { drawId: { in: createdDrawIds } },
    });
    await prisma.draw.deleteMany({
      where: { id: { in: createdDrawIds } },
    });
  }
  if (createdConfigIds.length > 0) {
    await prisma.providerCommissionTier.deleteMany({
      where: { configId: { in: createdConfigIds } },
    });
    await prisma.providerCommissionConfig.deleteMany({
      where: { id: { in: createdConfigIds } },
    });
  }
  if (createdApiSystemIds.length > 0) {
    await prisma.apiSystem.deleteMany({
      where: { id: { in: createdApiSystemIds } },
    });
  }
  createdDrawIds = [];
  createdConfigIds = [];
  createdApiSystemIds = [];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Commission pipeline (integration, live DB)', () => {
  beforeAll(async () => {
    // Sanity probe — fail fast if DB unreachable
    await prisma.$queryRaw`SELECT 1`;
    // Proves Plan 12-01 tables exist + Prisma accessor is wired
    const n = await prisma.providerCommissionLedger.count();
    expect(typeof n).toBe('number');
    // Confirm LOTOANIMALITO is present in this DB (cheap & informative on failure)
    const game = await prisma.game.findUnique({ where: { id: LOTOANIMALITO_ID } });
    expect(game).not.toBeNull();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  test('Test 1 — happy-path SALES_PCT 5.5% × 1000 → ledger.amount === "55.00000000"', async () => {
    const apiSystem = await createTestApiSystem('-t1');
    const draw = await createTestDraw();
    await createDrawFinancial(draw.id);
    await createDrawFinancialProvider(draw.id, apiSystem.id);
    const config = await createSalesConfig(apiSystem.id);

    const result = await computeAndUpsertLedgerForDraw(draw.id);

    expect(result.providersProcessed).toBe(1);
    expect(result.skipped).toBe(0);

    const ledger = await prisma.providerCommissionLedger.findFirst({
      where: { drawId: draw.id, apiSystemId: apiSystem.id },
    });
    expect(ledger).not.toBeNull();
    // ▶ THE KEY ASSERTION ◀ — exact string, no float drift.
    expect(ledger.amount.toString()).toBe('55');           // Prisma Decimal trims trailing zeros on toString()
    // Cross-check via numeric equality on the raw DB column type
    expect(Number(ledger.amount.toString())).toBe(55);
    // And via the .toFixed(8) path that the service uses
    expect(Number(ledger.amount).toFixed(8)).toBe('55.00000000');

    expect(Number(ledger.salesBase).toFixed(8)).toBe('1000.00000000');
    expect(Number(ledger.utilityBase).toFixed(8)).toBe('800.00000000');
    expect(ledger.configId).toBe(config.id);
    expect(ledger.configSnapshot.formulaType).toBe('SALES_PCT');
    expect(ledger.configSnapshot.salesRate).toBe('5.5');
  });

  test('Test 2 — D-01 silent skip when no config exists for provider at drawnAt', async () => {
    const apiSystem = await createTestApiSystem('-t2');
    const draw = await createTestDraw();
    await createDrawFinancial(draw.id);
    await createDrawFinancialProvider(draw.id, apiSystem.id);
    // No createSalesConfig here — D-01 must skip silently.

    const result = await computeAndUpsertLedgerForDraw(draw.id);

    expect(result.skipped).toBe(1);
    expect(result.providersProcessed).toBe(0);

    const ledgerCount = await prisma.providerCommissionLedger.count({
      where: { drawId: draw.id, apiSystemId: apiSystem.id },
    });
    expect(ledgerCount).toBe(0);
  });

  test('Test 3 — idempotent re-run produces exactly 1 row, not 2', async () => {
    const apiSystem = await createTestApiSystem('-t3');
    const draw = await createTestDraw();
    await createDrawFinancial(draw.id);
    await createDrawFinancialProvider(draw.id, apiSystem.id);
    await createSalesConfig(apiSystem.id);

    // First invocation
    await computeAndUpsertLedgerForDraw(draw.id);
    // Second invocation — must update, not insert.
    await computeAndUpsertLedgerForDraw(draw.id);

    const ledgerCount = await prisma.providerCommissionLedger.count({
      where: { drawId: draw.id, apiSystemId: apiSystem.id },
    });
    expect(ledgerCount).toBe(1);

    const ledger = await prisma.providerCommissionLedger.findFirst({
      where: { drawId: draw.id, apiSystemId: apiSystem.id },
    });
    expect(Number(ledger.amount).toFixed(8)).toBe('55.00000000');
  });

  test('Test 4 — race-guard: worker throws DrawFinancialNotReadyError when totalizedAt is null', async () => {
    const apiSystem = await createTestApiSystem('-t4');
    const draw = await createTestDraw();
    // DrawFinancial with NULL totalizedAt → race-guard must trip.
    await createDrawFinancial(draw.id, { totalizedAt: null });
    await createDrawFinancialProvider(draw.id, apiSystem.id);
    await createSalesConfig(apiSystem.id);

    await expect(
      calculateProviderCommissionWorker({ data: { drawId: draw.id } }),
    ).rejects.toThrow(DrawFinancialNotReadyError);

    // And no ledger row should have been written.
    const ledgerCount = await prisma.providerCommissionLedger.count({
      where: { drawId: draw.id, apiSystemId: apiSystem.id },
    });
    expect(ledgerCount).toBe(0);
  });
});
