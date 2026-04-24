/**
 * Integration test: quota check inside webhook dispatch.
 * Mocks prisma + quota.service to verify dispatch wiring.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockTx = {
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  webhookLog: { update: jest.fn() },
};

const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  draw: { findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};

const mockQuota = { checkTicketQuotas: jest.fn() };

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-04-24'),
}));
jest.unstable_mockModule('../services/quota.service.js', () => mockQuota);

const apiSystem = { id: 'api-1', slug: 'virtuales', name: 'Virtuales' };
const headers = { 'x-webhook-token': 'tok' };

function payload() {
  return JSON.stringify({
    ticketId: 't-quota-1',
    game: 'lotoanimalito',
    plays: [{ drawSlotId: 5, amount: 1000, animal: 'perro', number: '30' }],
    timestamp: '2026-04-24T10:00:00Z',
  });
}

describe('dispatchWebhook — quota enforcement', () => {
  let dispatchWebhook;

  beforeAll(async () => {
    ({ dispatchWebhook } = await import('../services/webhook.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.webhookLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.webhookLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'item-30', multiplier: 30 });
    mockTx.ticket.findFirst.mockResolvedValue(null); // no duplicate
    mockTx.ticket.create.mockResolvedValue({ id: 'ticket-1', ticketNumber: 999 });
    // default: $transaction runs the callback with mockTx
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
  });

  test('quota OK → ticket is created and log PROCESSED', async () => {
    mockQuota.checkTicketQuotas.mockResolvedValue({ ok: true });

    const result = await dispatchWebhook(apiSystem, payload(), headers);

    expect(mockQuota.checkTicketQuotas).toHaveBeenCalled();
    expect(mockTx.ticket.create).toHaveBeenCalled();
    expect(result.status).toBe('processed');
    expect(result.ticketNumber).toBe(999);
  });

  test('quota rejects → ticket NOT created, log FAILED, rejected status returned', async () => {
    mockQuota.checkTicketQuotas.mockResolvedValue({
      ok: false,
      reason: 'Cupo excedido para item 30 (CARNERO) en sorteo 10:00: vendido 19500 + intento 1000 = 20500 > cupo 20000',
    });

    const result = await dispatchWebhook(apiSystem, payload(), headers);

    expect(mockTx.ticket.create).not.toHaveBeenCalled();
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: {
        status: 'FAILED',
        errorMessage: expect.stringMatching(/Cupo excedido/),
      },
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/Cupo excedido/);
  });
});
