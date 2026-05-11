import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};
const mockApiIntegration = { importSRQTickets: jest.fn() };
const mockMaxplay = { importMaxplayTickets: jest.fn() };
const mockAdmin = { notifyPrewinnerSelected: jest.fn() };
const mockSocket = { emitToAll: jest.fn(), emitToGame: jest.fn() };
const mockSystemConfig = { default: { isEmergencyStop: jest.fn().mockResolvedValue(false) } };
const mockDrawPause = { default: { isGamePausedOnDate: jest.fn().mockResolvedValue(false) } };

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../lib/socket.js', () => mockSocket);
jest.unstable_mockModule('../services/api-integration.service.js', () => ({ default: mockApiIntegration }));
jest.unstable_mockModule('../services/maxplay.service.js', () => ({ default: mockMaxplay }));
jest.unstable_mockModule('../services/admin-notification.service.js', () => ({ default: mockAdmin }));
jest.unstable_mockModule('../services/system-config.service.js', () => mockSystemConfig);
jest.unstable_mockModule('../services/draw-pause.service.js', () => mockDrawPause);
jest.unstable_mockModule('../services/prewinner-selection.service.js', () => ({
  default: { selectPrewinner: jest.fn(), calculateTripletaRiskTop5: jest.fn().mockResolvedValue([]) },
}));

const baseGame = { id: 'g-1', name: 'TRIPLE PANTERA', slug: 'triple-pantera', type: 'TRIPLE' };
const baseDraw = (overrides = {}) => ({
  id: 'd-1',
  status: 'SCHEDULED',
  drawDate: new Date('2026-05-11T00:00:00Z'),
  drawTime: '10:00:00',
  gameId: 'g-1',
  game: { ...baseGame, items: [{ id: 'it-1', number: '50', name: 'Item50', isActive: true }] },
  preselectedItem: null,
  preselectedItemId: null,
  ...overrides,
});

describe('closeAndIngestWorker', () => {
  let closeAndIngestWorker;

  beforeAll(async () => {
    ({ closeAndIngestWorker } = await import('../queue/workers/close-and-ingest.worker.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiIntegration.importSRQTickets.mockResolvedValue({ imported: 5 });
    mockPrisma.draw.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockSystemConfig.default.isEmergencyStop.mockResolvedValue(false);
    mockDrawPause.default.isGamePausedOnDate.mockResolvedValue(false);
  });

  test('SCHEDULED + no preselect → closes atomically + 2 SRQ passes (no optimizer)', async () => {
    mockPrisma.draw.findUnique
      .mockResolvedValueOnce(baseDraw())                   // first read
      .mockResolvedValueOnce({ ...baseDraw(), status: 'CLOSED', preselectedItemId: null }); // after close
    const r = await closeAndIngestWorker({ data: { drawId: 'd-1' } });
    expect(mockPrisma.draw.updateMany).toHaveBeenCalledWith({
      where: { id: 'd-1', status: 'SCHEDULED' },
      data: expect.objectContaining({ status: 'CLOSED' }),
    });
    expect(mockApiIntegration.importSRQTickets).toHaveBeenCalledTimes(2);
    expect(mockApiIntegration.importSRQTickets).toHaveBeenCalledWith('d-1', { allowClosed: true });
    expect(mockSocket.emitToAll).toHaveBeenCalledWith('draw:closing', expect.any(Object));
    expect(r.closed).toBe(true);
    expect(r.method).toBe('awaiting_preselect');
  });

  test('admin preselect already set → no ingest, no optimizer, emit draw:closed', async () => {
    const adminItem = { id: 'it-9', number: '99', name: 'Item99' };
    mockPrisma.draw.findUnique
      .mockResolvedValueOnce(baseDraw({ preselectedItemId: 'it-9', preselectedItem: adminItem }))
      .mockResolvedValueOnce({ ...baseDraw({ preselectedItemId: 'it-9', preselectedItem: adminItem }), status: 'CLOSED' });
    const r = await closeAndIngestWorker({ data: { drawId: 'd-1' } });
    expect(mockApiIntegration.importSRQTickets).not.toHaveBeenCalled();
    expect(mockSocket.emitToAll).toHaveBeenCalledWith('draw:closed', expect.any(Object));
    expect(mockAdmin.notifyPrewinnerSelected).toHaveBeenCalled();
    expect(r.method).toBe('admin_preselect');
  });

  test('already CLOSED by other process (updateMany count=0) → skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValueOnce(baseDraw());
    mockPrisma.draw.updateMany.mockResolvedValue({ count: 0 });
    const r = await closeAndIngestWorker({ data: { drawId: 'd-1' } });
    expect(r.skipped).toMatch(/already/);
    expect(mockApiIntegration.importSRQTickets).not.toHaveBeenCalled();
  });

  test('TERMINAL game → terminal close path (SRQ ingest, no optimizer)', async () => {
    mockPrisma.draw.findUnique.mockResolvedValueOnce(baseDraw({ game: { ...baseGame, type: 'TERMINAL', items: [] } }));
    const r = await closeAndIngestWorker({ data: { drawId: 'd-1' } });
    expect(r.closed).toBe(true);
    expect(r.method).toBe('terminal');
  });

  test('draw not found → skip', async () => {
    mockPrisma.draw.findUnique.mockResolvedValueOnce(null);
    const r = await closeAndIngestWorker({ data: { drawId: 'd-nope' } });
    expect(r.skipped).toBe('draw_not_found');
  });
});
