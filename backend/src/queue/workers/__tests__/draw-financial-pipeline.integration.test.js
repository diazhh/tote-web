/**
 * Phase 11 Plan 11-03 — End-to-end integration test for the DrawFinancial pipeline.
 *
 * Hits the LIVE local Docker postgres (tote_postgres @ localhost:5433). Seeds a Game,
 * Draw, Ticket(s), TicketDetail(s); invokes the worker directly with synthetic
 * {data: {drawId, phase}} jobs (faster than pg-boss polling, same pattern other
 * worker tests use); then asserts the resulting DrawFinancial + DrawFinancialProvider
 * rows match the expected aggregates.
 *
 * The plan permits direct worker invocation as a substitute for full pg-boss
 * harness for Tests 1-5. Test 6 verifies the close-and-ingest trigger via static
 * grep — the actual `boss.send` insertion in close-and-ingest.worker.js is
 * covered by Task 1's acceptance grep.
 *
 * Cleanup: afterEach deletes by the unique test-prefix Game.name so concurrent
 * test runs don't collide and the dev DB is not polluted.
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { prisma } from '../../../lib/prisma.js';
import { calculateDrawFinancialsWorker } from '../calculate-draw-financials.worker.js';
import { PrizesNotProcessedError } from '../../../services/draw-financial.service.js';

const TEST_PREFIX = `__test-df-${Date.now()}-${process.pid}`;

// ── Helpers ───────────────────────────────────────────────────────────

/** Convert a Prisma Decimal | string | number to a string trimmed to 2 decimals. */
function dec(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toFixed === 'function') return v.toFixed(2);
  return Number(v).toFixed(2);
}

async function createGame(suffix = '') {
  return prisma.game.create({
    data: {
      name: `${TEST_PREFIX}${suffix}`,
      type: 'ANIMALITOS',
      slug: `${TEST_PREFIX}${suffix}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      totalNumbers: 38,
      isActive: false,
    },
  });
}

async function createGameItem(gameId, number, name, multiplier = 30.0) {
  return prisma.gameItem.create({
    data: {
      gameId,
      number,
      name,
      displayOrder: parseInt(number, 10) || 0,
      multiplier,
    },
  });
}

async function createDraw(gameId, { status = 'CLOSED', closedAt = new Date(), drawnAt = null, prizesProcessed = false } = {}) {
  return prisma.draw.create({
    data: {
      gameId,
      drawDate: new Date(),
      drawTime: '12:00:00',
      status,
      closedAt,
      drawnAt,
      prizesProcessed,
    },
  });
}

async function createTicket(drawId, gameItemId, amount, { apiSystemId = null, status = 'ACTIVE', prize = 0 } = {}) {
  const ticket = await prisma.ticket.create({
    data: {
      drawId,
      apiSystemId,
      status,
      totalAmount: amount,
      source: apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE',
      details: {
        create: [{
          gameItemId,
          drawId,
          amount,
          multiplier: 30.0,
          prize,
        }],
      },
    },
    include: { details: true },
  });
  return ticket;
}

async function cleanupTestData() {
  // Order: TicketDetail → Ticket → DrawFinancialProvider → DrawFinancial → Draw → GameItem → Game → ApiSystem
  // (TicketDetail + DrawFinancialProvider + DrawFinancial + GameItem cascade on Game/Draw delete, but
  // we explicitly nuke in correct order for clarity and to handle ApiSystem cleanup separately.)
  const testGames = await prisma.game.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const gameIds = testGames.map((g) => g.id);
  if (gameIds.length === 0) return;

  const draws = await prisma.draw.findMany({
    where: { gameId: { in: gameIds } },
    select: { id: true },
  });
  const drawIds = draws.map((d) => d.id);

  if (drawIds.length > 0) {
    // Delete TicketDetail first (FK to Ticket)
    await prisma.ticketDetail.deleteMany({ where: { drawId: { in: drawIds } } });
    await prisma.ticket.deleteMany({ where: { drawId: { in: drawIds } } });
    await prisma.drawFinancialProvider.deleteMany({ where: { drawId: { in: drawIds } } });
    await prisma.drawFinancial.deleteMany({ where: { drawId: { in: drawIds } } });
  }
  await prisma.draw.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.gameItem.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.game.deleteMany({ where: { id: { in: gameIds } } });

  // Clean up any test ApiSystem rows
  await prisma.apiSystem.deleteMany({ where: { slug: { startsWith: TEST_PREFIX.toLowerCase() } } });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('DrawFinancial pipeline (integration, live DB)', () => {
  beforeAll(async () => {
    // Sanity — fail fast if the test process can't reach the DB
    await prisma.$queryRaw`SELECT 1`;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Test 1 — phase SALES aggregates non-CANCELLED TicketDetails and writes DrawFinancial', async () => {
    const game = await createGame('-t1');
    const item = await createGameItem(game.id, '01', 'CARNERO');
    const draw = await createDraw(game.id, { closedAt: new Date('2026-05-15T12:00:00Z') });

    // Two ACTIVE TicketDetails on the same ticket: amounts 100.00 + 50.50.
    await createTicket(draw.id, item.id, 100.0);
    await prisma.ticketDetail.create({
      data: {
        ticketId: (await prisma.ticket.findFirst({ where: { drawId: draw.id, status: 'ACTIVE' } })).id,
        gameItemId: item.id,
        drawId: draw.id,
        amount: 50.5,
        multiplier: 30.0,
      },
    });

    // CANCELLED ticket carrying 999.99 — must NOT count (D-17).
    await createTicket(draw.id, item.id, 999.99, { status: 'CANCELLED' });

    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'SALES' } });

    const rows = await prisma.drawFinancial.findMany({ where: { drawId: draw.id } });
    expect(rows).toHaveLength(1);
    expect(dec(rows[0].totalSales)).toBe('150.50');
    expect(rows[0].ticketCount).toBe(1); // 1 distinct non-cancelled ticket
    expect(rows[0].totalizedAt).toBeNull(); // Still in SALES window
    expect(rows[0].closedAt).toEqual(new Date('2026-05-15T12:00:00Z'));
  });

  test('Test 2 — phase PRIZES with prizesProcessed=false throws and does NOT touch DrawFinancial', async () => {
    const game = await createGame('-t2');
    const item = await createGameItem(game.id, '02', 'BURRA');
    const draw = await createDraw(game.id, {
      prizesProcessed: false,
      closedAt: new Date(),
    });
    await createTicket(draw.id, item.id, 10.0);

    // Pre-state: ensure DrawFinancial doesn't exist yet for this draw.
    const before = await prisma.drawFinancial.findUnique({ where: { drawId: draw.id } });
    expect(before).toBeNull();

    await expect(
      calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'PRIZES' } }),
    ).rejects.toBeInstanceOf(PrizesNotProcessedError);

    // No row written — FIN-AGG-07 enforced.
    const after = await prisma.drawFinancial.findUnique({ where: { drawId: draw.id } });
    expect(after).toBeNull();
  });

  test('Test 3 — phase PRIZES with prizesProcessed=true writes totalPrize, utility, and totalizedAt = drawnAt', async () => {
    const game = await createGame('-t3');
    const item = await createGameItem(game.id, '03', 'TIGRE');
    const drawnAt = new Date('2026-05-15T13:00:00Z');
    const draw = await createDraw(game.id, {
      closedAt: new Date('2026-05-15T12:55:00Z'),
      drawnAt,
      prizesProcessed: true,
    });
    // Ticket with prize=50.00 on a detail of amount 100.00.
    await createTicket(draw.id, item.id, 100.0, { prize: 50.0 });

    // First run SALES so DrawFinancial exists.
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'SALES' } });
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'PRIZES' } });

    const row = await prisma.drawFinancial.findUnique({ where: { drawId: draw.id } });
    expect(row).not.toBeNull();
    expect(dec(row.totalSales)).toBe('100.00');
    expect(dec(row.totalPrize)).toBe('50.00');
    expect(dec(row.utility)).toBe('50.00'); // 100.00 - 50.00
    expect(row.totalizedAt).toEqual(drawnAt); // D-05: totalizedAt = Draw.drawnAt, NOT now()
  });

  test('Test 4 — end-to-end idempotency: re-running SALES then PRIZES leaves exactly 1 row', async () => {
    const game = await createGame('-t4');
    const item = await createGameItem(game.id, '04', 'CABALLO');
    const drawnAt = new Date('2026-05-15T14:00:00Z');
    const draw = await createDraw(game.id, {
      closedAt: new Date('2026-05-15T13:55:00Z'),
      drawnAt,
      prizesProcessed: true,
    });
    await createTicket(draw.id, item.id, 25.0, { prize: 10.0 });

    // Run the full sequence twice.
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'SALES' } });
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'PRIZES' } });
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'SALES' } });
    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'PRIZES' } });

    const rows = await prisma.drawFinancial.findMany({ where: { drawId: draw.id } });
    expect(rows).toHaveLength(1);
    expect(dec(rows[0].totalSales)).toBe('25.00');
    expect(dec(rows[0].totalPrize)).toBe('10.00');

    // DrawFinancialProvider: NULL apiSystemId row only (no provider seeded).
    const providers = await prisma.drawFinancialProvider.findMany({ where: { drawId: draw.id } });
    expect(providers).toHaveLength(1);
    expect(providers[0].apiSystemId).toBeNull();
  });

  test('Test 5 — per-provider breakdown: NULL bucket + a real ApiSystem sum to DrawFinancial.totalSales', async () => {
    const game = await createGame('-t5');
    const item = await createGameItem(game.id, '05', 'LEON');
    const draw = await createDraw(game.id, { closedAt: new Date('2026-05-15T15:00:00Z') });

    // Seed a test ApiSystem (slug prefixed so cleanup catches it).
    const apiSystem = await prisma.apiSystem.create({
      data: {
        name: `${TEST_PREFIX}-srq`,
        slug: `${TEST_PREFIX.toLowerCase()}-srq`,
        mode: 'PULL',
      },
    });

    // House ticket (apiSystemId NULL) — 60.00
    await createTicket(draw.id, item.id, 60.0);
    // Provider ticket — 40.00
    await createTicket(draw.id, item.id, 40.0, { apiSystemId: apiSystem.id });

    await calculateDrawFinancialsWorker({ data: { drawId: draw.id, phase: 'SALES' } });

    const df = await prisma.drawFinancial.findUnique({ where: { drawId: draw.id } });
    expect(dec(df.totalSales)).toBe('100.00');

    const providers = await prisma.drawFinancialProvider.findMany({
      where: { drawId: draw.id },
      orderBy: { apiSystemId: 'asc' },
    });
    expect(providers).toHaveLength(2);

    const nullRow = providers.find((p) => p.apiSystemId === null);
    const srqRow = providers.find((p) => p.apiSystemId === apiSystem.id);
    expect(nullRow).toBeDefined();
    expect(srqRow).toBeDefined();
    expect(dec(nullRow.totalSales)).toBe('60.00');
    expect(dec(srqRow.totalSales)).toBe('40.00');

    // Invariant: SUM(DrawFinancialProvider.totalSales) === DrawFinancial.totalSales
    const sumProviders = providers.reduce((acc, p) => acc + Number(p.totalSales.toString()), 0);
    expect(sumProviders.toFixed(2)).toBe(dec(df.totalSales));
  });

  test('Test 6 — close-and-ingest trigger wiring (static verification + grep-based assertion)', async () => {
    // The runtime trigger from close-and-ingest is best verified via the static grep
    // in the Task 1 acceptance criteria. This test reasserts that the boss.send call
    // is present in the worker source — protects against accidental future removal.
    const __filename = fileURLToPath(import.meta.url);
    const workerPath = path.resolve(
      path.dirname(__filename),
      '..',
      'close-and-ingest.worker.js',
    );
    const src = await fs.readFile(workerPath, 'utf8');

    // 3 SALES triggers (one per close return path)
    const salesMatches = src.match(/phase: 'SALES'/g) || [];
    expect(salesMatches).toHaveLength(3);

    // Each trigger is preceded by the D-10 marker comment
    const d10Matches = src.match(/Phase 11 \(D-10\)/g) || [];
    expect(d10Matches).toHaveLength(3);

    // Each insertion is inside a try/catch (warn log)
    const warnMatches = src.match(/df-sales trigger falló/g) || [];
    expect(warnMatches).toHaveLength(3);

    // Each uses CALCULATE_DRAW_FINANCIALS queue
    expect(src).toMatch(/QUEUES\.CALCULATE_DRAW_FINANCIALS/);
  });
});
