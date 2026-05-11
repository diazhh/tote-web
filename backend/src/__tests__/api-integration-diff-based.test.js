/**
 * Unit tests for diff-based SRQ ticket import.
 *   - no deleteMany
 *   - existing ACTIVE ticket stays untouched (createdAt preserved)
 *   - anulado ticket on existing ACTIVE → status flips to CANCELLED
 *   - anulado ticket on existing WON → log warning, no flip
 *   - allowClosed gate respects closedAt 2-min window
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn() },
  apiDrawMapping: { findFirst: jest.fn() },
  apiConfiguration: { findFirst: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  game: { findUnique: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/drawLock.js', () => ({
  withDrawLock: jest.fn((id, fn) => fn()),
  default: jest.fn((id, fn) => fn()),
}));
jest.unstable_mockModule('../services/provider-entities.service.js', () => ({
  default: { ensureEntitiesExist: jest.fn().mockResolvedValue({}) },
}));
jest.unstable_mockModule('../services/srq-tripleta.service.js', () => ({
  default: { processTripletaTicketsWithMapping: jest.fn().mockResolvedValue(0) },
}));

global.fetch = jest.fn();

describe('importSRQTickets — diff-based', () => {
  let apiIntegrationService;

  beforeAll(async () => {
    apiIntegrationService = (await import('../services/api-integration.service.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.draw.findUnique.mockResolvedValue({ status: 'SCHEDULED', closedAt: null });
    mockPrisma.apiDrawMapping.findFirst.mockResolvedValue({
      externalDrawId: 'ext-1',
      apiConfig: {
        gameId: 'game-1',
        apiSystemId: 'api-1',
        game: { name: 'LOTOANIMALITO' },
      },
      draw: {},
    });
    mockPrisma.apiConfiguration.findFirst.mockResolvedValue({
      apiSystemId: 'api-1',
      baseUrl: 'https://srq.test/tickets/',
      token: 'tok',
    });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'item-30', multiplier: 30 });
    mockPrisma.game.findUnique.mockResolvedValue({ config: {}, name: 'LOTOANIMALITO' });
    mockPrisma.ticket.create.mockResolvedValue({ id: 'tk-new' });
    mockPrisma.ticket.update.mockResolvedValue({ id: 'tk-up' });
    global.fetch.mockResolvedValue({ json: async () => ([]) });
  });

  test('does NOT call deleteMany', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: false }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.deleteMany).not.toHaveBeenCalled();
  });

  test('new ticket → INSERT', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: false }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue(null); // not existing
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.create).toHaveBeenCalled();
    expect(r.imported).toBe(1);
  });

  test('existing ACTIVE ticket → NO-OP, createdAt preserved', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: false }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk-existing', status: 'ACTIVE' });
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
  });

  test('anulado on existing ACTIVE → status CANCELLED', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: true }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk-existing', status: 'ACTIVE' });
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: 'tk-existing' },
      data: { status: 'CANCELLED' },
    });
    expect(r.cancelled).toBe(1);
  });

  test('anulado on existing WON → no flip, warn', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: true }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk-existing', status: 'WON' });
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(r.cancelled).toBe(0);
  });

  test('anulado on existing CANCELLED → no-op', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: true }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk-existing', status: 'CANCELLED' });
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  test('allowClosed=false + draw CLOSED → ignored', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ status: 'CLOSED', closedAt: new Date() });
    const r = await apiIntegrationService.importSRQTickets('draw-1');
    expect(r.ignored).toBe(true);
    expect(r.imported).toBe(0);
  });

  test('allowClosed=true + CLOSED recent → processes', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'CLOSED',
      closedAt: new Date(Date.now() - 30_000),
    });
    global.fetch.mockResolvedValue({
      json: async () => ([{ ticketID: 't1', numero: '30', monto: '100', anulado: false }]),
    });
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    const r = await apiIntegrationService.importSRQTickets('draw-1', { allowClosed: true });
    expect(r.imported).toBe(1);
  });

  test('allowClosed=true + CLOSED stale (>2min) → ignored', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      status: 'CLOSED',
      closedAt: new Date(Date.now() - 180_000),
    });
    const r = await apiIntegrationService.importSRQTickets('draw-1', { allowClosed: true });
    expect(r.ignored).toBe(true);
  });
});
