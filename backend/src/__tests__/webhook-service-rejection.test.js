/**
 * Tests for webhook.service.js — D-04 rejection wiring and D-01 drawId passthrough
 *
 * Covers:
 * - D-04: When normalize() returns { rejected: true, reason }, dispatchWebhook updates
 *   the WebhookLog to FAILED with the reason and does NOT call ticket.create
 * - D-01: When normalize() returns a valid normalized object with per-detail drawId,
 *   createWebhookTicket passes drawId to TicketDetail.create
 * - Test 3: Rejection check runs BEFORE createWebhookTicket (not caught by try/catch)
 *
 * Strategy: Integration-style tests using the real adapter pipeline with mocked prisma.
 * Prisma is mocked so the adapter's resolveDrawId() and gameItem lookups return
 * controlled results, producing either rejection or success normalized objects.
 *
 * Payload used: Virtuales format with drawSlotId=5 (slot 5 = LOTOANIMALITO 12:00:00)
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ── Mocks (must be before any imports) ──────────────────────────────
const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
  // draw.findUnique added for checkDrawIsOpen (close-draw rearchitecture).
  // Default is set per-test below; if a test doesn't set it, dispatchWebhook
  // will short-circuit at the rejected-by-adapter branch before this runs.
  draw: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue({ status: 'SCHEDULED' }) },
  gameItem: { findFirst: jest.fn() },
  // Required by the quota-transaction wrapper introduced in Task 5.
  // Pass mockPrisma itself as tx so existing assertions on mockPrisma.ticket.create still work.
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-04-08'),
}));
// Required by the quota-transaction wrapper introduced in Task 5.
// Always returns ok:true so the success-path test (Test 2) reaches ticket.create.
jest.unstable_mockModule('../services/quota.service.js', () => ({
  checkTicketQuotas: jest.fn().mockResolvedValue({ ok: true }),
}));

// ── Shared test data ───────────────────────────────────────────────

const fakeApiSystem = {
  id: 'api-system-1',
  slug: 'virtuales',
  name: 'Virtuales Test',
};

const fakeHeaders = { 'x-webhook-token': 'token-abc' };

// Virtuales payload with a single play (drawSlotId=5 = LOTOANIMALITO 12:00:00)
function makePayload(drawSlotId = 5, number = '5') {
  return JSON.stringify({
    ticketId: 't-001',
    game: 'lotoanimalito',
    plays: [{ drawSlotId, amount: 100, animal: 'perro', number }],
    timestamp: '2026-04-08T10:00:00Z',
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('dispatchWebhook — D-04 rejection wiring', () => {
  let dispatchWebhook;

  beforeAll(async () => {
    ({ dispatchWebhook } = await import('../services/webhook.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: webhookLog.create always returns a log entry
    mockPrisma.webhookLog.create.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
  });

  test('Test 1 — Rejection path: DRAWN draw → normalize() rejects → log updated to FAILED, ticket.create NOT called', async () => {
    // Arrange: prisma returns a DRAWN draw — adapter will reject with VALID-01
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'DRAWN' });

    // Act
    const result = await dispatchWebhook(fakeApiSystem, makePayload(5, '5'), fakeHeaders);

    // Assert: WebhookLog updated to FAILED with the rejection reason from adapter
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: {
        status: 'FAILED',
        errorMessage: expect.stringContaining('DRAWN'),
      },
    });

    // Assert: ticket.create was NOT called (rejection bypasses ticket creation)
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.findFirst).not.toHaveBeenCalled();

    // Assert: return value signals rejection
    expect(result.status).toBe('rejected');
    expect(result.logId).toBe('log-1');
    expect(result.reason).toEqual(expect.stringContaining('DRAWN'));
  });

  test('Test 2 — drawId passthrough: SCHEDULED draw + valid number → ticket.create receives drawId in details', async () => {
    // Arrange: prisma returns a SCHEDULED draw (valid) and a gameItem
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({
      id: 'gi-05',
      multiplier: 30,
    });

    // No duplicate ticket
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    // ticket.create succeeds
    mockPrisma.ticket.create.mockResolvedValue({ id: 'ticket-1' });
    // webhookLog.findUnique for duplicate check — returns non-DUPLICATE status
    mockPrisma.webhookLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
    // webhookLog.update for PROCESSED
    mockPrisma.webhookLog.update.mockResolvedValue({});

    // Act
    const result = await dispatchWebhook(fakeApiSystem, makePayload(5, '5'), fakeHeaders);

    // Assert: ticket.create was called with drawId in details (D-01)
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          drawId: 'draw-uuid-5',
          details: {
            create: expect.arrayContaining([
              expect.objectContaining({
                gameItemId: 'gi-05',
                amount: 100,
                multiplier: 30,
                drawId: 'draw-uuid-5',
              }),
            ]),
          },
        }),
      }),
    );

    // Assert: returned status is 'processed'
    expect(result.status).toBe('processed');
  });

  test('Test 3 — Rejection check runs BEFORE createWebhookTicket: CANCELLED draw rejects correctly', async () => {
    // Arrange: prisma returns a CANCELLED draw — adapter will reject
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'CANCELLED' });

    // Act — if rejection check is BEFORE createWebhookTicket, result is { status: 'rejected' }
    // If check is missing, createWebhookTicket would crash on normalized.details.map (rejected object
    // has no .details), and result would be { status: 'failed' } with a JS error message
    const result = await dispatchWebhook(fakeApiSystem, makePayload(5, '5'), fakeHeaders);

    // Rejection check must fire BEFORE createWebhookTicket, so status is 'rejected' not 'failed'
    expect(result.status).toBe('rejected');
    expect(result.reason).toEqual(expect.stringContaining('CANCELLED'));

    // Verify the FAILED update contains the adapter reason (not a JS TypeError message)
    const updateCall = mockPrisma.webhookLog.update.mock.calls[0];
    expect(updateCall[0].data.status).toBe('FAILED');
    expect(updateCall[0].data.errorMessage).toEqual(expect.stringContaining('CANCELLED'));
    // Must NOT contain JavaScript error signatures
    expect(updateCall[0].data.errorMessage).not.toContain('TypeError');
    expect(updateCall[0].data.errorMessage).not.toContain('Cannot read');
  });

  test('Test 4 — No draw found → rejection with meaningful reason', async () => {
    // Arrange: prisma returns null (no draw exists for this slot today)
    mockPrisma.draw.findFirst.mockResolvedValue(null);

    const result = await dispatchWebhook(fakeApiSystem, makePayload(5, '5'), fakeHeaders);

    // Should reject, not fail with an unhandled error
    expect(result.status).toBe('rejected');
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe('string');

    // WebhookLog should be updated to FAILED
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
