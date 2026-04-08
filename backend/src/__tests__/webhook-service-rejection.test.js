/**
 * Tests for webhook.service.js — D-04 rejection wiring and D-01 drawId passthrough
 *
 * Covers:
 * - D-04: When normalize() returns { rejected: true, reason }, dispatchWebhook updates
 *   the WebhookLog to FAILED with the reason and does NOT call ticket.create
 * - D-01: When normalize() returns a valid normalized object with per-detail drawId,
 *   createWebhookTicket passes drawId to TicketDetail.create
 * - Test 3: Rejection check runs BEFORE createWebhookTicket (not caught by try/catch)
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────
const mockPrisma = {
  webhookLog: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  ticket: { findFirst: jest.fn(), create: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock the adapter by its slug — webhook.service.js does:
//   import(path.resolve(__dirname, '../webhooks/adapters/' + slug + '.adapter.js'))
// We need to mock that resolved path. Use the adapter slug "test-rejection" so we can
// mock a path we control. But since dynamic imports resolve to absolute paths on disk,
// the cleanest approach for testing both the rejection and success branches is to mock
// the adapter file that will be dynamically imported.
//
// We use slug = "virtuales" and mock the draft file (which exists on disk) so that
// jest.unstable_mockModule intercepts it at its absolute path.
//
// IMPORTANT: jest.unstable_mockModule must be called before the module under test is imported.
// We use dynamic imports (inside beforeAll) to ensure the mock is registered first.

const mockNormalize = jest.fn();

// The path that webhook.service.js will construct via path.resolve:
// __dirname is backend/src/services, so the adapter path will be:
// backend/src/webhooks/adapters/virtuales.adapter.js
// We mock this path so the dynamic import gets our mock.
jest.unstable_mockModule(
  '/Users/diazhh/Documents/GitHub/tote-web/backend/src/webhooks/adapters/virtuales.adapter.js',
  () => ({ normalize: mockNormalize }),
  { virtual: true },
);

// ── Shared test data ───────────────────────────────────────────────

const fakeApiSystem = {
  id: 'api-system-1',
  slug: 'virtuales',
  name: 'Virtuales Test',
};

const fakeRawPayload = JSON.stringify({
  ticketId: 't-001',
  game: 'lotoanimalito',
  plays: [{ drawSlotId: 5, amount: 100, animal: 'perro', number: '5' }],
  timestamp: '2026-04-08T10:00:00Z',
});

const fakeHeaders = { 'x-webhook-token': 'token-abc' };

// Valid normalized object — success path
const validNormalized = {
  drawId: 'draw-uuid-5',
  externalTicketId: 't-001',
  totalAmount: 100,
  providerData: { ticketId: 't-001' },
  details: [
    {
      gameItemId: 'gi-05',
      amount: 100,
      multiplier: 30,
      drawId: 'draw-uuid-5',
    },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────

describe('dispatchWebhook — D-04 rejection wiring', () => {
  let dispatchWebhook;

  beforeAll(async () => {
    ({ dispatchWebhook } = await import('../services/webhook.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: webhookLog.create returns a log entry
    mockPrisma.webhookLog.create.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
  });

  test('Test 1 — Rejection path: normalize() returns { rejected: true } → log updated to FAILED, ticket.create NOT called', async () => {
    // Arrange: adapter rejects the payload
    mockNormalize.mockResolvedValue({ rejected: true, reason: 'Draw is CLOSED — bets not accepted' });

    // Act
    const result = await dispatchWebhook(fakeApiSystem, fakeRawPayload, fakeHeaders);

    // Assert: WebhookLog updated to FAILED with the rejection reason
    expect(mockPrisma.webhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'FAILED', errorMessage: 'Draw is CLOSED — bets not accepted' },
    });

    // Assert: ticket.create was NOT called (rejection bypasses ticket creation)
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.findFirst).not.toHaveBeenCalled();

    // Assert: return value signals rejection
    expect(result).toEqual({
      status: 'rejected',
      logId: 'log-1',
      reason: 'Draw is CLOSED — bets not accepted',
    });
  });

  test('Test 2 — drawId passthrough: normalize() returns valid object with details[0].drawId → ticket.create receives drawId in details', async () => {
    // Arrange: adapter returns valid normalized object
    mockNormalize.mockResolvedValue(validNormalized);

    // No duplicate ticket
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    // ticket.create succeeds
    mockPrisma.ticket.create.mockResolvedValue({ id: 'ticket-1' });
    // webhookLog.findUnique for duplicate check
    mockPrisma.webhookLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'DISCOVERED' });
    // webhookLog.update for PROCESSED
    mockPrisma.webhookLog.update.mockResolvedValue({});

    // Act
    const result = await dispatchWebhook(fakeApiSystem, fakeRawPayload, fakeHeaders);

    // Assert: ticket.create was called with drawId in details
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

  test('Test 3 — Rejection check runs BEFORE createWebhookTicket: rejection is NOT swallowed by try/catch', async () => {
    // Arrange: adapter rejects — this should NOT cause an unhandled exception
    // The rejection is a return value (not a thrown error), so it bypasses try/catch
    mockNormalize.mockResolvedValue({ rejected: true, reason: 'No draw for slot 5 today' });

    // Act — if the rejection was mishandled (e.g., passed to createWebhookTicket which
    // crashes), the catch block would update log to FAILED with an error.message.
    // We verify that the update data contains 'No draw for slot 5 today' (the reason),
    // NOT an error.message about accessing .details of undefined.
    const result = await dispatchWebhook(fakeApiSystem, fakeRawPayload, fakeHeaders);

    // If rejection check is BEFORE createWebhookTicket, result is { status: 'rejected' }
    // If rejection check is missing, createWebhookTicket crashes on normalized.details.map,
    // and result would be { status: 'failed' }
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('No draw for slot 5 today');

    // Verify the FAILED update has the reason (not a JS error message)
    const updateCall = mockPrisma.webhookLog.update.mock.calls[0];
    expect(updateCall[0].data.status).toBe('FAILED');
    expect(updateCall[0].data.errorMessage).toBe('No draw for slot 5 today');
  });

  test('Test 4 — Rejection with undefined reason falls back to default message', async () => {
    // Edge case: adapter returns { rejected: true } without a reason string
    mockNormalize.mockResolvedValue({ rejected: true });

    const result = await dispatchWebhook(fakeApiSystem, fakeRawPayload, fakeHeaders);

    expect(result.status).toBe('rejected');
    // errorMessage should fallback to something (not crash on undefined)
    const updateCall = mockPrisma.webhookLog.update.mock.calls[0];
    expect(updateCall[0].data.status).toBe('FAILED');
    expect(updateCall[0].data.errorMessage).toBeTruthy();
  });
});
