/**
 * Tests for Virtuales Webhook Adapter
 *
 * Covers:
 * - ADAPT-01: drawSlotId resolution to Draw UUID
 * - ADAPT-02: GameItem lookup by number field
 * - ADAPT-03: multi-play ticket normalization
 * - ADAPT-04: string drawSlotId coercion via parseInt
 * - VALID-01: rejects DRAWN and CANCELLED draws
 * - VALID-02: rejects CLOSED draws
 * - VALID-03: rejects invalid drawSlotId (0, 49, NaN)
 * - VALID-04: rejects unknown number not in game
 * - D-01: per-detail drawId for multi-draw plays
 * - D-02/D-06: all-or-nothing — partial plays never create ticket
 * - D-05: animal field ignored in GameItem lookup
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ── Mocks (must be before any imports) ──────────────────────────────
const mockPrisma = {
  draw: { findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-04-07'),
}));

// ── Lazy import (after mocks are registered) ─────────────────────────
let normalize;
beforeAll(async () => {
  const adapter = await import('../webhooks/adapters/virtuales.adapter.draft.js');
  normalize = adapter.normalize;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────
const LOTOANIMALITO_ID = 'd953f80c-4335-4bc9-9f78-9b56193286fe';
const LOTTOPANTERA_ID = '61580ccf-5a2d-4d10-877e-4883515135e4';

function makePayload(overrides = {}) {
  return {
    ticketId: 't-001',
    game: 'lotoanimalito',
    plays: [{ drawSlotId: '5', amount: 100, animal: 'LEON', number: '05' }],
    timestamp: '2026-04-07T10:00:00Z',
    ...overrides,
  };
}

function mockHappyPath() {
  mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'SCHEDULED' });
  mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });
}

// ── ADAPT-01: drawSlotId resolution ─────────────────────────────────
describe('ADAPT-01: drawSlotId resolution', () => {
  test('resolves slot 5 to LOTOANIMALITO 12:00:00 draw', async () => {
    mockHappyPath();
    const result = await normalize(makePayload());

    expect(result.drawId).toBe('draw-uuid-5');
    expect(result.externalTicketId).toBe('t-001');

    expect(mockPrisma.draw.findFirst).toHaveBeenCalledWith({
      where: {
        gameId: LOTOANIMALITO_ID,
        drawDate: new Date('2026-04-07'),
        drawTime: '12:00:00',
      },
      select: { id: true, status: true },
    });
  });

  test('rejects when no draw found for today', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue(null);
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const result = await normalize(makePayload());

    expect(result.rejected).toBe(true);
    expect(result.reason).toBeDefined();
  });
});

// ── ADAPT-02: GameItem lookup by number ──────────────────────────────
describe('ADAPT-02: GameItem lookup by number', () => {
  test('looks up gameItem using number field, not animal name', async () => {
    mockHappyPath();
    const result = await normalize(makePayload());

    expect(mockPrisma.gameItem.findFirst).toHaveBeenCalledWith({
      where: { gameId: LOTOANIMALITO_ID, number: '05' },
      select: { id: true, multiplier: true },
    });
    expect(result.details[0].gameItemId).toBe('gi-05');
  });
});

// ── ADAPT-03: multi-play ticket ──────────────────────────────────────
describe('ADAPT-03: multi-play ticket', () => {
  test('normalizes 2-play payload with totalAmount and 2 details', async () => {
    mockPrisma.draw.findFirst
      .mockResolvedValueOnce({ id: 'draw-uuid-5', status: 'SCHEDULED' })
      .mockResolvedValueOnce({ id: 'draw-uuid-5', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst
      .mockResolvedValueOnce({ id: 'gi-05', multiplier: 30 })
      .mockResolvedValueOnce({ id: 'gi-10', multiplier: 30 });

    const payload = makePayload({
      plays: [
        { drawSlotId: '5', amount: 100, animal: 'LEON', number: '05' },
        { drawSlotId: '5', amount: 200, animal: 'TORO', number: '10' },
      ],
    });

    const result = await normalize(payload);

    expect(result.details.length).toBe(2);
    expect(result.totalAmount).toBe(300);
    expect(result.details[0].gameItemId).toBe('gi-05');
    expect(result.details[1].gameItemId).toBe('gi-10');
    expect(result.details[0].amount).toBe(100);
    expect(result.details[1].amount).toBe(200);
  });
});

// ── ADAPT-04: string drawSlotId coercion ─────────────────────────────
describe('ADAPT-04: string drawSlotId coercion', () => {
  test('string "12" and integer 12 both resolve to LOTOANIMALITO 19:00:00', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-12', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const payload = makePayload({
      plays: [{ drawSlotId: '12', amount: 100, animal: 'LEON', number: '05' }],
    });

    const result = await normalize(payload);

    expect(result.drawId).toBe('draw-uuid-12');
    expect(mockPrisma.draw.findFirst).toHaveBeenCalledWith({
      where: {
        gameId: LOTOANIMALITO_ID,
        drawDate: new Date('2026-04-07'),
        drawTime: '19:00:00',
      },
      select: { id: true, status: true },
    });
  });

  test('integer 12 resolves identically to string "12"', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-12', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const payload = makePayload({
      plays: [{ drawSlotId: 12, amount: 100, animal: 'LEON', number: '05' }],
    });

    const result = await normalize(payload);

    expect(result.drawId).toBe('draw-uuid-12');
    expect(mockPrisma.draw.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ drawTime: '19:00:00' }) })
    );
  });
});

// ── VALID-01: rejects DRAWN and CANCELLED draws ──────────────────────
describe('VALID-01: rejects non-SCHEDULED/non-accepting draws', () => {
  test('rejects DRAWN draw with reason containing "DRAWN"', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-x', status: 'DRAWN' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const result = await normalize(makePayload());

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/DRAWN/);
  });

  test('rejects CANCELLED draw with reason containing "CANCELLED"', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-x', status: 'CANCELLED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const result = await normalize(makePayload());

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/CANCELLED/);
  });
});

// ── VALID-02: rejects CLOSED draws ───────────────────────────────────
describe('VALID-02: rejects CLOSED draws', () => {
  test('rejects CLOSED draw with reason containing "CLOSED"', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-x', status: 'CLOSED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'gi-05', multiplier: 30 });

    const result = await normalize(makePayload());

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/CLOSED/);
  });
});

// ── VALID-03: rejects invalid drawSlotId ─────────────────────────────
describe('VALID-03: rejects invalid drawSlotId', () => {
  test('rejects drawSlotId 0 with invalid message', async () => {
    const payload = makePayload({
      plays: [{ drawSlotId: '0', amount: 100, animal: 'LEON', number: '05' }],
    });

    const result = await normalize(payload);

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/[Ii]nvalid/);
  });

  test('rejects drawSlotId 49 with invalid message', async () => {
    const payload = makePayload({
      plays: [{ drawSlotId: '49', amount: 100, animal: 'LEON', number: '05' }],
    });

    const result = await normalize(payload);

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/[Ii]nvalid/);
  });

  test('rejects non-numeric drawSlotId "abc"', async () => {
    const payload = makePayload({
      plays: [{ drawSlotId: 'abc', amount: 100, animal: 'LEON', number: '05' }],
    });

    const result = await normalize(payload);

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/[Ii]nvalid/);
  });
});

// ── VALID-04: rejects unknown number ─────────────────────────────────
describe('VALID-04: rejects unknown number not in game', () => {
  test('rejects number "99" when gameItem not found, reason contains "99"', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst.mockResolvedValue(null);

    const payload = makePayload({
      plays: [{ drawSlotId: '5', amount: 100, animal: 'UNKNOWN', number: '99' }],
    });

    const result = await normalize(payload);

    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/99/);
  });
});

// ── D-02/D-06: all-or-nothing validation ─────────────────────────────
describe('D-02/D-06: all-or-nothing — invalid play rejects entire ticket', () => {
  test('2 plays where second has unknown number rejects entire ticket', async () => {
    mockPrisma.draw.findFirst.mockResolvedValue({ id: 'draw-uuid-5', status: 'SCHEDULED' });
    // First play: valid gameItem; second play: null (not found)
    mockPrisma.gameItem.findFirst
      .mockResolvedValueOnce({ id: 'gi-05', multiplier: 30 })
      .mockResolvedValueOnce(null);

    const payload = makePayload({
      plays: [
        { drawSlotId: '5', amount: 100, animal: 'LEON', number: '05' },
        { drawSlotId: '5', amount: 200, animal: 'UNKNOWN', number: '99' },
      ],
    });

    const result = await normalize(payload);

    expect(result.rejected).toBe(true);
    // No partial details
    expect(result.details).toBeUndefined();
  });
});

// ── D-05: animal field ignored for lookup ────────────────────────────
describe('D-05: animal field ignored in GameItem lookup', () => {
  test('gameItem.findFirst called with number only, not animal/name', async () => {
    mockHappyPath();

    const payload = makePayload({
      plays: [{ drawSlotId: '5', amount: 100, animal: 'WRONGANIMAL', number: '05' }],
    });

    const result = await normalize(payload);

    // Assert gameItem.findFirst was NOT called with name/animal
    const callArg = mockPrisma.gameItem.findFirst.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('name');
    expect(callArg.where).not.toHaveProperty('animal');
    expect(callArg.where).toHaveProperty('number', '05');
    expect(result.rejected).toBeUndefined();
  });
});

// ── D-01: per-detail drawId for multi-draw plays ─────────────────────
describe('D-01: per-detail drawId', () => {
  test('each detail has its own drawId; top-level drawId is first play draw', async () => {
    // Two plays targeting different slots (slot 5 = LOTOANIMALITO, slot 13 = LOTTOPANTERA)
    mockPrisma.draw.findFirst
      .mockResolvedValueOnce({ id: 'draw-uuid-loto-5', status: 'SCHEDULED' })
      .mockResolvedValueOnce({ id: 'draw-uuid-pantera-13', status: 'SCHEDULED' });
    mockPrisma.gameItem.findFirst
      .mockResolvedValueOnce({ id: 'gi-loto-05', multiplier: 30 })
      .mockResolvedValueOnce({ id: 'gi-pantera-05', multiplier: 30 });

    const payload = makePayload({
      plays: [
        { drawSlotId: '5', amount: 100, animal: 'LEON', number: '05' },
        { drawSlotId: '13', amount: 200, animal: 'TORO', number: '05' },
      ],
    });

    const result = await normalize(payload);

    expect(result.drawId).toBe('draw-uuid-loto-5');
    expect(result.details[0].drawId).toBe('draw-uuid-loto-5');
    expect(result.details[1].drawId).toBe('draw-uuid-pantera-13');
  });
});

// ── Output contract shape ─────────────────────────────────────────────
describe('Output contract', () => {
  test('happy-path result has correct shape with all required fields', async () => {
    mockHappyPath();
    const result = await normalize(makePayload());

    expect(result).toMatchObject({
      drawId: 'draw-uuid-5',
      externalTicketId: 't-001',
      totalAmount: 100,
      providerData: expect.objectContaining({ ticketId: 't-001' }),
      details: [
        {
          gameItemId: 'gi-05',
          amount: 100,
          multiplier: 30,
          drawId: 'draw-uuid-5',
        },
      ],
    });
  });

  test('multiplier is numeric (not Decimal string)', async () => {
    mockHappyPath();
    const result = await normalize(makePayload());

    expect(typeof result.details[0].multiplier).toBe('number');
    expect(result.details[0].multiplier).toBe(30);
  });
});
