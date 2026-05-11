import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  draw: { findUnique: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  ticket: { upsert: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/drawLock.js', () => ({
  default: jest.fn((id, fn) => fn()),
  withDrawLock: jest.fn((id, fn) => fn()),
}));

global.fetch = jest.fn();

const openDraw = {
  id: 'draw-1',
  status: 'SCHEDULED',
  closedAt: null,
  drawTime: '10:00:00',
  drawDate: new Date('2026-05-11T00:00:00Z'),
  gameId: 'g-1',
  game: { slug: 'triple-pantera' },
  scheduledAt: new Date('2026-05-11T14:00:00Z'),
};

describe('importMaxplayTickets — diff-based + allowClosed', () => {
  let maxplayService;

  beforeAll(async () => {
    maxplayService = (await import('../services/maxplay.service.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'mx-1', isActive: true, mode: 'SCRAPE' });
    mockPrisma.draw.findUnique.mockResolvedValue(openDraw);
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'item-123', multiplier: 1 });
    mockPrisma.ticket.upsert.mockResolvedValue({ id: 'tk-1' });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        duration_ms: 6000,
        rows: [
          { product: 'TRIPLE', jugada: '123', venta: 500, tickets: 5, taquillas: 2 },
        ],
        totales: {},
        fetched_at: '2026-05-11T14:00:00Z',
      }),
    });
  });

  test('does NOT call deleteMany', async () => {
    await maxplayService.importMaxplayTickets('draw-1');
    expect(mockPrisma.ticket.deleteMany).not.toHaveBeenCalled();
  });

  test('uses upsert keyed on drawId_externalTicketId_source', async () => {
    await maxplayService.importMaxplayTickets('draw-1');
    expect(mockPrisma.ticket.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          drawId_externalTicketId_source: expect.objectContaining({
            drawId: 'draw-1',
            externalTicketId: 'maxplay-draw-1-123',
            source: 'EXTERNAL_SCRAPE',
          }),
        }),
      })
    );
  });

  test('CLOSED + allowClosed=false → bypass', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      ...openDraw, status: 'CLOSED', closedAt: new Date(),
    });
    const r = await maxplayService.importMaxplayTickets('draw-1');
    expect(r.imported).toBe(0);
    expect(r.reason).toMatch(/draw_frozen/);
    expect(mockPrisma.ticket.upsert).not.toHaveBeenCalled();
  });

  test('CLOSED + allowClosed=true + closedAt < 2min → processes', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      ...openDraw, status: 'CLOSED', closedAt: new Date(Date.now() - 30_000),
    });
    const r = await maxplayService.importMaxplayTickets('draw-1', { allowClosed: true });
    expect(r.imported).toBe(1);
    expect(mockPrisma.ticket.upsert).toHaveBeenCalled();
  });

  test('CLOSED + allowClosed=true + closedAt > 2min → bypass', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      ...openDraw, status: 'CLOSED', closedAt: new Date(Date.now() - 180_000),
    });
    const r = await maxplayService.importMaxplayTickets('draw-1', { allowClosed: true });
    expect(r.imported).toBe(0);
    expect(r.reason).toMatch(/draw_frozen/);
  });

  test('DRAWN → bypass regardless of allowClosed', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      ...openDraw, status: 'DRAWN', closedAt: new Date(),
    });
    const r = await maxplayService.importMaxplayTickets('draw-1', { allowClosed: true });
    expect(r.imported).toBe(0);
    expect(r.reason).toMatch(/draw_frozen/);
  });
});
