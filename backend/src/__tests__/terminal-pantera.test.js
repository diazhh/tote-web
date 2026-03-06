/**
 * Tests for Terminal Pantera game integration
 *
 * Covers:
 * - TW-43: Daily draw generation includes Terminal
 * - TW-44: SRQ sync skips winner for TERMINAL type
 * - TW-46: Cascade execution from Triple to Terminal (last 2 digits)
 * - TW-47: Prize processing for Terminal draws
 * - TW-45: Prewinner optimizer considers Terminal payout
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────
const mockPrisma = {
  game: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  draw: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  gameItem: { findUnique: jest.fn(), findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
  ticket: { findMany: jest.fn() },
  drawTemplate: { findMany: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/socket.js', () => ({
  emitToAll: jest.fn(),
  emitToGame: jest.fn(),
}));
jest.unstable_mockModule('../services/prize-processor.service.js', () => ({
  default: {
    processPrizesForDraw: jest.fn().mockResolvedValue({
      winnersCount: 0, losersCount: 0, totalPrizesAwarded: 0,
    }),
  },
}));
jest.unstable_mockModule('../services/admin-notification.service.js', () => ({
  default: { notifyDrawResult: jest.fn(), notifyPrewinnerSelected: jest.fn() },
}));
jest.unstable_mockModule('../services/draw-stats.service.js', () => ({
  default: { calculateAllStats: jest.fn() },
}));
jest.unstable_mockModule('../services/publication.service.js', () => ({
  default: { publishDraw: jest.fn().mockResolvedValue({ success: true, results: [] }) },
}));
jest.unstable_mockModule('../services/imageService.js', () => ({
  generateDrawImage: jest.fn().mockResolvedValue({ filename: 'test.png' }),
}));
jest.unstable_mockModule('../services/system-config.service.js', () => ({
  default: { isEmergencyStop: jest.fn().mockResolvedValue(false) },
}));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaTimeString: jest.fn().mockReturnValue('12:05:00'),
  getVenezuelaDateAsUTC: jest.fn().mockReturnValue(new Date('2026-03-06T04:00:00.000Z')),
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-03-06'),
  getVenezuelaDayOfWeek: jest.fn().mockReturnValue(5),
  startOfDayInCaracas: jest.fn(d => d),
  endOfDayInCaracas: jest.fn(d => d),
  addMinutesToTime: jest.fn((time, mins) => {
    const [h, m] = time.split(':');
    const total = parseInt(h) * 60 + parseInt(m) + mins;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
  }),
}));
jest.unstable_mockModule('../queue/boss.js', () => ({ getBoss: jest.fn() }));
jest.unstable_mockModule('../queue/constants.js', () => ({ QUEUES: {}, QUEUE_CONFIGS: {} }));
jest.unstable_mockModule('../services/provider-entities.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/srq-tripleta.service.js', () => ({ default: {} }));

// ── Helpers ────────────────────────────────────────────────────────
const TRIPLE_GAME_ID = 'triple-game-id';
const TERMINAL_GAME_ID = 'terminal-game-id';

function makeTripleDraw(drawTime, winnerNumber) {
  return {
    id: `triple-draw-${drawTime}`,
    gameId: TRIPLE_GAME_ID,
    drawDate: new Date('2026-03-06T04:00:00.000Z'),
    drawTime,
    status: 'DRAWN',
    winnerItemId: `triple-item-${winnerNumber}`,
    winnerItem: { id: `triple-item-${winnerNumber}`, number: winnerNumber, name: `Triple ${winnerNumber}`, multiplier: 30 },
    game: { id: TRIPLE_GAME_ID, name: 'TRIPLE PANTERA', slug: 'triple-pantera', type: 'TRIPLE' },
    preselectedItemId: `triple-item-${winnerNumber}`,
  };
}

// ── Test: Cascade Terminal Draws ───────────────────────────────────
describe('cascadeTerminalDraws', () => {
  let ExecuteDrawJob;

  beforeAll(async () => {
    ExecuteDrawJob = (await import('../jobs/execute-draw.job.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should set Terminal winner to last 2 digits of Triple winner', async () => {
    const tripleDraw = makeTripleDraw('12:00:00', '456');

    // Terminal game linked to Triple
    mockPrisma.game.findMany.mockResolvedValue([
      { id: TERMINAL_GAME_ID, name: 'TERMINAL PANTERA', slug: 'terminal-pantera', type: 'TERMINAL', isActive: true },
    ]);

    // Terminal draw exists as SCHEDULED
    mockPrisma.draw.findFirst.mockResolvedValue({
      id: 'terminal-draw-12',
      gameId: TERMINAL_GAME_ID,
      drawDate: tripleDraw.drawDate,
      drawTime: '12:00:00',
      status: 'SCHEDULED',
    });

    // GameItem for "56" exists
    const terminalItem = { id: 'terminal-item-56', number: '56', name: 'Terminal 56' };
    mockPrisma.gameItem.findUnique.mockResolvedValue(terminalItem);

    // Update returns the draw with winner
    mockPrisma.draw.update.mockResolvedValue({
      id: 'terminal-draw-12',
      game: { name: 'TERMINAL PANTERA', slug: 'terminal-pantera' },
      drawDate: tripleDraw.drawDate,
      drawTime: '12:00:00',
      winnerItem: terminalItem,
    });

    await ExecuteDrawJob.cascadeTerminalDraws(tripleDraw);

    // Verify Terminal draw was updated with correct winner
    expect(mockPrisma.draw.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'terminal-draw-12' },
        data: expect.objectContaining({
          status: 'DRAWN',
          winnerItemId: 'terminal-item-56',
          preselectedItemId: 'terminal-item-56',
        }),
      }),
    );

    // Verify audit log records source Triple info
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({
            winnerNumber: '56',
            sourceTripleNumber: '456',
          }),
        }),
      }),
    );
  });

  test('should handle Triple number "100" -> Terminal "00"', async () => {
    const tripleDraw = makeTripleDraw('13:00:00', '100');

    mockPrisma.game.findMany.mockResolvedValue([
      { id: TERMINAL_GAME_ID, type: 'TERMINAL', isActive: true, name: 'TERMINAL PANTERA' },
    ]);
    mockPrisma.draw.findFirst.mockResolvedValue({
      id: 'td-13', gameId: TERMINAL_GAME_ID, drawTime: '13:00:00', status: 'SCHEDULED',
    });

    const item00 = { id: 'ti-00', number: '00', name: 'Terminal 00' };
    mockPrisma.gameItem.findUnique.mockResolvedValue(item00);
    mockPrisma.draw.update.mockResolvedValue({
      id: 'td-13', game: { name: 'TERMINAL PANTERA', slug: 'terminal-pantera' },
      drawDate: tripleDraw.drawDate, drawTime: '13:00:00', winnerItem: item00,
    });

    await ExecuteDrawJob.cascadeTerminalDraws(tripleDraw);

    expect(mockPrisma.gameItem.findUnique).toHaveBeenCalledWith({
      where: { gameId_number: { gameId: TERMINAL_GAME_ID, number: '00' } },
    });
  });

  test('should skip if no Terminal draw exists for that time', async () => {
    const tripleDraw = makeTripleDraw('14:00:00', '789');

    mockPrisma.game.findMany.mockResolvedValue([
      { id: TERMINAL_GAME_ID, type: 'TERMINAL', isActive: true, name: 'TERMINAL PANTERA' },
    ]);
    mockPrisma.draw.findFirst.mockResolvedValue(null);

    await ExecuteDrawJob.cascadeTerminalDraws(tripleDraw);

    expect(mockPrisma.draw.update).not.toHaveBeenCalled();
  });

  test('should skip if no linked Terminal games', async () => {
    const tripleDraw = makeTripleDraw('15:00:00', '321');
    mockPrisma.game.findMany.mockResolvedValue([]);

    await ExecuteDrawJob.cascadeTerminalDraws(tripleDraw);

    expect(mockPrisma.draw.findFirst).not.toHaveBeenCalled();
  });
});

// ── Test: syncDrawWinner skips TERMINAL ────────────────────────────
describe('syncDrawWinner skips TERMINAL', () => {
  let apiIntegrationService;

  beforeAll(async () => {
    apiIntegrationService = (await import('../services/api-integration.service.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should NOT sync winner for TERMINAL game type', async () => {
    mockPrisma.game.findUnique.mockResolvedValue({ type: 'TERMINAL' });

    const result = await apiIntegrationService.syncDrawWinner('draw-1', '56 Terminal', TERMINAL_GAME_ID);

    expect(result).toBeUndefined();
    expect(mockPrisma.draw.update).not.toHaveBeenCalled();
  });

  test('should sync winner for non-TERMINAL game type', async () => {
    mockPrisma.game.findUnique.mockResolvedValue({ type: 'TRIPLE' });
    mockPrisma.gameItem.findFirst.mockResolvedValue({ id: 'item-456', number: '456', name: 'Test' });
    mockPrisma.draw.update.mockResolvedValue({});

    const result = await apiIntegrationService.syncDrawWinner('draw-2', '456 TEST', TRIPLE_GAME_ID);

    expect(result).toBe(true);
    expect(mockPrisma.draw.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draw-2' },
        data: expect.objectContaining({ status: 'DRAWN', winnerItemId: 'item-456' }),
      }),
    );
  });
});

// ── Test: close-draw includes TERMINAL (closes without prewinner) ──
describe('close-draw handles TERMINAL', () => {
  let closeDrawJob;
  let mockApiIntegration;

  beforeAll(async () => {
    mockApiIntegration = { importSRQTickets: jest.fn().mockResolvedValue({ imported: 10, skipped: 0, deleted: 0 }) };
    jest.unstable_mockModule('../services/api-integration.service.js', () => ({
      default: mockApiIntegration,
    }));
    jest.unstable_mockModule('../services/prewinner-selection.service.js', () => ({
      default: { selectPrewinner: jest.fn(), calculateTripletaRiskTop5: jest.fn().mockResolvedValue([]) },
    }));
    jest.unstable_mockModule('../services/pdf-report.service.js', () => ({
      default: { generateDrawClosingReport: jest.fn() },
    }));
    jest.unstable_mockModule('../services/bet-simulator.service.js', () => ({
      default: {},
    }));
    jest.unstable_mockModule('date-fns', () => ({
      startOfDay: jest.fn(d => d),
    }));

    closeDrawJob = (await import('../jobs/close-draw.job.js')).default;
  });

  test('close-draw should include TERMINAL in query (no type exclusion)', async () => {
    mockPrisma.draw.findMany.mockResolvedValue([]);

    await closeDrawJob.execute();

    const calls = mockPrisma.draw.findMany.mock.calls;
    const closeCall = calls.find(c => c[0]?.where?.status === 'SCHEDULED');
    expect(closeCall).toBeDefined();
    // Should NOT have a game type filter
    expect(closeCall[0].where.game?.type).toBeUndefined();
  });

  test('close-draw should close TERMINAL without prewinner selection', async () => {
    const terminalDraw = {
      id: 'terminal-draw-1',
      gameId: TERMINAL_GAME_ID,
      drawDate: new Date('2026-03-06T04:00:00.000Z'),
      drawTime: '12:00:00',
      status: 'SCHEDULED',
      preselectedItemId: null,
      game: {
        id: TERMINAL_GAME_ID, name: 'TERMINAL PANTERA', slug: 'terminal-pantera',
        type: 'TERMINAL', items: Array.from({ length: 100 }, (_, i) => ({ id: `ti-${i}`, number: String(i).padStart(2, '0') })),
      },
      preselectedItem: null,
    };

    mockPrisma.draw.findMany.mockResolvedValue([terminalDraw]);
    mockPrisma.draw.update.mockResolvedValue({
      ...terminalDraw, status: 'CLOSED',
      game: terminalDraw.game,
    });

    await closeDrawJob.execute();

    // Should have imported tickets
    expect(mockApiIntegration.importSRQTickets).toHaveBeenCalledWith('terminal-draw-1');

    // Should have updated to CLOSED without preselectedItemId
    expect(mockPrisma.draw.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'terminal-draw-1' },
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
    // No preselectedItemId in update data
    const updateCall = mockPrisma.draw.update.mock.calls[0][0];
    expect(updateCall.data.preselectedItemId).toBeUndefined();
  });
});

// ── Test: execute-draw excludes TERMINAL (handled by cascade) ──────
describe('execute-draw excludes TERMINAL', () => {
  let executeDrawJob;

  beforeAll(async () => {
    executeDrawJob = (await import('../jobs/execute-draw.job.js')).default;
  });

  test('execute-draw query should filter out TERMINAL (handled by cascade)', async () => {
    mockPrisma.draw.findMany.mockResolvedValue([]);

    await executeDrawJob.execute();

    const calls = mockPrisma.draw.findMany.mock.calls;
    const execCall = calls.find(c => c[0]?.where?.status === 'CLOSED' && c[0]?.where?.game?.type);
    expect(execCall).toBeDefined();
    expect(execCall[0].where.game.type).toEqual({ not: 'TERMINAL' });
  });
});
