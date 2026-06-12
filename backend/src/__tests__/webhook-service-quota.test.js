/**
 * Integration test: quota check inside webhook dispatch.
 * Mocks prisma + quota.service to verify dispatch wiring.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockTx = {
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  webhookLog: { update: jest.fn() },
  // checkDrawIsOpen runs first inside $transaction and reads tx.draw.findUnique.
  draw: { findUnique: jest.fn() },
};

const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  draw: { findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};

const mockQuota = { checkTicketQuotas: jest.fn(), partitionByQuota: jest.fn() };

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
    mockTx.draw.findUnique.mockResolvedValue({ status: 'SCHEDULED' });
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

describe('dispatchWebhook — partialMode (columna) + fallback legacy', () => {
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
    mockTx.draw.findUnique.mockResolvedValue({ status: 'SCHEDULED' });
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
    mockQuota.checkTicketQuotas.mockResolvedValue({ ok: true });
    mockQuota.partitionByQuota.mockResolvedValue({
      accepted: [{ gameItemId: 'item-30', amount: 1000, multiplier: 30, drawId: 'draw-1', drawSlotId: '5', number: '30' }],
      rejected: [],
      capped: [],
    });
  });

  test('partialMode SPLIT → partitionByQuota({split:true})', async () => {
    const sys = { id: 'api-1', slug: 'virtuales', name: 'V', partialMode: 'SPLIT' };
    await dispatchWebhook(sys, payload(), headers);
    expect(mockQuota.partitionByQuota).toHaveBeenCalledWith(expect.anything(), expect.anything(), { split: true });
    expect(mockQuota.checkTicketQuotas).not.toHaveBeenCalled();
  });

  test('partialMode DROP → partitionByQuota({split:false})', async () => {
    const sys = { id: 'api-1', slug: 'virtuales', name: 'V', partialMode: 'DROP' };
    await dispatchWebhook(sys, payload(), headers);
    expect(mockQuota.partitionByQuota).toHaveBeenCalledWith(expect.anything(), expect.anything(), { split: false });
  });

  test('partialMode NONE → checkTicketQuotas (estricto)', async () => {
    const sys = { id: 'api-1', slug: 'virtuales', name: 'V', partialMode: 'NONE' };
    await dispatchWebhook(sys, payload(), headers);
    expect(mockQuota.checkTicketQuotas).toHaveBeenCalled();
    expect(mockQuota.partitionByQuota).not.toHaveBeenCalled();
  });

  test('fallback legacy: slug paganarplay sin columna → DROP', async () => {
    const sys = { id: 'api-1', slug: 'paganarplay', name: 'P' };
    await dispatchWebhook(sys, payload(), headers);
    expect(mockQuota.partitionByQuota).toHaveBeenCalledWith(expect.anything(), expect.anything(), { split: false });
  });

  test('fallback legacy: slug premier sin columna → SPLIT', async () => {
    const sys = { id: 'api-1', slug: 'premier', name: 'Pr' };
    await dispatchWebhook(sys, payload(), headers);
    expect(mockQuota.partitionByQuota).toHaveBeenCalledWith(expect.anything(), expect.anything(), { split: true });
  });
});

describe('dispatchWebhook — resolución de adapter (custom / genérico / discovery)', () => {
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
    mockTx.draw.findUnique.mockResolvedValue({ status: 'SCHEDULED' });
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
    mockQuota.checkTicketQuotas.mockResolvedValue({ ok: true });
  });

  test('slug sin archivo custom + useGenericAdapter=true → procesa vía genérico', async () => {
    const sys = { id: 'api-1', slug: 'nuevoprov', name: 'Nuevo', useGenericAdapter: true, partialMode: 'NONE' };
    const result = await dispatchWebhook(sys, payload(), headers);
    expect(result.status).toBe('processed');
    expect(mockTx.ticket.create).toHaveBeenCalled();
  });

  test('slug sin archivo custom + useGenericAdapter=false → discovery (solo log)', async () => {
    const sys = { id: 'api-1', slug: 'nuevoprov2', name: 'Nuevo2', useGenericAdapter: false };
    const result = await dispatchWebhook(sys, payload(), headers);
    expect(result.status).toBe('discovery');
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
  });
});
