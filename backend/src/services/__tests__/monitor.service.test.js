// backend/src/services/__tests__/monitor.service.test.js
import { jest } from '@jest/globals';

// Mock prisma
const mockPrisma = {
  draw: {
    findMany: jest.fn(),
  },
  apiDrawMapping: {
    findMany: jest.fn(),
  }
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));

// Mock logger
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

// Import AFTER mocks
const { default: monitorService } = await import('../monitor.service.js');

function makeDraw(overrides = {}) {
  return {
    id: 'draw-1',
    gameId: 'game-a',
    drawDate: new Date('2026-03-01T00:00:00.000Z'),
    drawTime: '10:00',
    status: 'DRAWN',
    game: { name: 'LOTOANIMALITO' },
    winnerItemId: null,
    winnerItem: null,
    tickets: [
      { totalAmount: '100.00', source: 'TAQUILLA_ONLINE', details: [] },
      { totalAmount: '50.00',  source: 'EXTERNAL_API',    details: [] },
    ],
    ...overrides
  };
}

// ============================================================
// BACK-01 — date range
// ============================================================
describe('getDailyReport — date range (BACK-01)', () => {
  beforeEach(() => {
    mockPrisma.draw.findMany.mockResolvedValue([]);
    mockPrisma.apiDrawMapping.findMany.mockResolvedValue([]);
  });

  test('passes gte/lte when dateFrom and dateTo provided', async () => {
    await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-03' });
    const [call] = mockPrisma.draw.findMany.mock.calls;
    expect(call[0].where.drawDate).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lte: new Date('2026-03-03T00:00:00.000Z')
    });
  });

  test('legacy single-date still works when only date provided', async () => {
    await monitorService.getDailyReport({ date: '2026-03-01' });
    const [call] = mockPrisma.draw.findMany.mock.calls;
    expect(call[0].where.drawDate).toEqual(new Date('2026-03-01T00:00:00.000Z'));
  });
});

// ============================================================
// BACK-02 — source filter
// ============================================================
describe('getDailyReport — source filter (BACK-02)', () => {
  beforeEach(() => {
    mockPrisma.draw.findMany.mockResolvedValue([]);
    mockPrisma.apiDrawMapping.findMany.mockResolvedValue([]);
  });

  test('passes source as tickets.where when source provided', async () => {
    await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01', source: 'TAQUILLA_ONLINE' });
    const [call] = mockPrisma.draw.findMany.mock.calls;
    expect(call[0].include.tickets.where).toEqual({ source: 'TAQUILLA_ONLINE' });
  });

  test('no tickets.where when source not provided', async () => {
    await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    const [call] = mockPrisma.draw.findMany.mock.calls;
    // tickets.where should be undefined or absent
    expect(call[0].include.tickets.where).toBeUndefined();
  });
});

// ============================================================
// BACK-02 — apiSystemId filter
// ============================================================
describe('getDailyReport — apiSystemId filter (BACK-02)', () => {
  beforeEach(() => {
    mockPrisma.draw.findMany.mockReset();
    mockPrisma.apiDrawMapping.findMany.mockReset();
  });

  test('returns empty report immediately when no mappings found', async () => {
    mockPrisma.apiDrawMapping.findMany.mockResolvedValue([]);
    const result = await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01', apiSystemId: 'sys-1' });
    expect(mockPrisma.draw.findMany).not.toHaveBeenCalled();
    expect(result.draws).toEqual([]);
    expect(result.byGame).toEqual([]);
    expect(result.bySource).toEqual([]);
  });

  test('restricts draw query to mapped draw IDs', async () => {
    mockPrisma.apiDrawMapping.findMany.mockResolvedValue([{ drawId: 'draw-1' }, { drawId: 'draw-2' }]);
    mockPrisma.draw.findMany.mockResolvedValue([]);
    await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01', apiSystemId: 'sys-1' });
    const [call] = mockPrisma.draw.findMany.mock.calls;
    expect(call[0].where.id).toEqual({ in: ['draw-1', 'draw-2'] });
  });
});

// ============================================================
// BACK-03 — aggregations
// ============================================================
describe('getDailyReport — aggregations (BACK-03)', () => {
  const draw1 = makeDraw({ id: 'draw-1', gameId: 'game-a', game: { name: 'LOTOANIMALITO' } });
  const draw2 = makeDraw({ id: 'draw-2', gameId: 'game-a', game: { name: 'LOTOANIMALITO' } });
  const draw3 = makeDraw({
    id: 'draw-3',
    gameId: 'game-b',
    game: { name: 'LOTTOPANTERA' },
    tickets: [{ totalAmount: '200.00', source: 'WEBHOOK_PUSH', details: [] }]
  });

  beforeEach(() => {
    mockPrisma.draw.findMany.mockResolvedValue([draw1, draw2, draw3]);
    mockPrisma.apiDrawMapping.findMany.mockResolvedValue([]);
  });

  test('byGame has one entry per game with aggregated totals', async () => {
    const result = await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    expect(result.byGame).toHaveLength(2);
    const gameA = result.byGame.find(g => g.gameId === 'game-a');
    expect(gameA.drawCount).toBe(2);
    expect(gameA.totalSales).toBeCloseTo(300); // 150 per draw (100+50), 2 draws
  });

  test('bySource has one entry per source with correct totals', async () => {
    const result = await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    const online = result.bySource.find(s => s.source === 'TAQUILLA_ONLINE');
    expect(online.ticketCount).toBe(2); // draw1 + draw2 each have one TAQUILLA_ONLINE ticket
    expect(online.totalSales).toBeCloseTo(200);
  });

  test('totals.drawCount equals total draws returned', async () => {
    const result = await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    expect(result.totals.drawCount).toBe(3);
  });

  test('response includes byGame and bySource arrays', async () => {
    const result = await monitorService.getDailyReport({ dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    expect(Array.isArray(result.byGame)).toBe(true);
    expect(Array.isArray(result.bySource)).toBe(true);
  });
});
