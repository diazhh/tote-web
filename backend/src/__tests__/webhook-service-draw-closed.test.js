/**
 * Integration test: webhook rejects pushes once draw is CLOSED.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockTx = {
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  webhookLog: { update: jest.fn() },
  draw: { findUnique: jest.fn() },
};

const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  draw: { findUnique: jest.fn(), findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};

const mockQuota = {
  checkTicketQuotas: jest.fn().mockResolvedValue({ ok: true }),
  partitionByQuota: jest.fn().mockResolvedValue({ accepted: [], rejected: [], capped: [] }),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-05-11'),
}));
jest.unstable_mockModule('../services/quota.service.js', () => mockQuota);

const apiSystem = { id: 'api-1', slug: 'virtuales', name: 'Virtuales' };
const headers = { 'x-webhook-token': 'tok' };

function payload() {
  return JSON.stringify({
    ticketId: 't-closed-1',
    game: 'lotoanimalito',
    plays: [{ drawSlotId: 5, amount: 1000, animal: 'perro', number: '30' }],
    timestamp: '2026-05-11T10:00:00Z',
  });
}

describe('dispatchWebhook — draw state validation', () => {
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
    mockTx.ticket.findFirst.mockResolvedValue(null);
    mockTx.ticket.create.mockResolvedValue({ id: 'ticket-1', ticketNumber: 999 });
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
  });

  test('draw SCHEDULED → ticket created', async () => {
    mockTx.draw.findUnique.mockResolvedValue({ id: 'draw-1', status: 'SCHEDULED', drawTime: '10:00:00' });
    const result = await dispatchWebhook(apiSystem, payload(), headers);
    expect(result.status).toBe('processed');
    expect(mockTx.ticket.create).toHaveBeenCalled();
  });

  test('draw CLOSED → rejected with WebhookLog FAILED', async () => {
    mockTx.draw.findUnique.mockResolvedValue({ id: 'draw-1', status: 'CLOSED', drawTime: '10:00:00' });
    const result = await dispatchWebhook(apiSystem, payload(), headers);
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/closed for new bets|CLOSED/i);
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  test('draw DRAWN → rejected', async () => {
    mockTx.draw.findUnique.mockResolvedValue({ id: 'draw-1', status: 'DRAWN', drawTime: '10:00:00' });
    const result = await dispatchWebhook(apiSystem, payload(), headers);
    expect(result.status).toBe('rejected');
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
  });

  test('draw not found → rejected', async () => {
    mockTx.draw.findUnique.mockResolvedValue(null);
    const result = await dispatchWebhook(apiSystem, payload(), headers);
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/not found/i);
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
  });
});
