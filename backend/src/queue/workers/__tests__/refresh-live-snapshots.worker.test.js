import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../lib/prisma.js', () => ({
  prisma: { draw: { findMany: jest.fn() } },
}));

const mockCompute = jest.fn();
jest.unstable_mockModule('../../../services/live-snapshot.service.js', () => ({
  computeDrawLiveSnapshot: mockCompute,
  computeDailyAggregateSnapshot: jest.fn(),
  __setLiveSnapResolver: jest.fn(),
}));

const mockInvalidate = jest.fn();
jest.unstable_mockModule('../../../lib/redis.js', () => ({
  invalidate: mockInvalidate,
  cacheOrCompute: jest.fn(),
  invalidatePattern: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

let workerModule;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../../lib/prisma.js');
  workerModule = await import('../refresh-live-snapshots.worker.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SNAPSHOT_WORKERS_ENABLED;
});

describe('refreshLiveSnapshotsWorker', () => {
  it('processes every SCHEDULED/CLOSED draw of today and invalidates each cache key', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd-1' },
      { id: 'd-2' },
      { id: 'd-3' },
    ]);

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(prismaLib.prisma.draw.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          drawDate: expect.any(Object),
          status: { in: ['SCHEDULED', 'CLOSED'] },
        }),
      }),
    );
    expect(mockCompute).toHaveBeenCalledTimes(3);
    expect(mockCompute).toHaveBeenCalledWith('d-1');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-1:snap');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-2:snap');
    expect(result.processed).toBe(3);
  });

  it('does not throw when a single draw compute fails — logs and continues', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd-ok-1' },
      { id: 'd-bad' },
      { id: 'd-ok-2' },
    ]);
    mockCompute
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-ok-1:snap');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-ok-2:snap');
    // Failed draw must NOT have its key invalidated (data wasn't refreshed)
    expect(mockInvalidate).not.toHaveBeenCalledWith('tote:v1:draw:d-bad:snap');
  });

  it('respects SNAPSHOT_WORKERS_ENABLED=false (no-ops)', async () => {
    process.env.SNAPSHOT_WORKERS_ENABLED = 'false';

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(result.skipped).toBe(true);
    expect(prismaLib.prisma.draw.findMany).not.toHaveBeenCalled();
  });
});
