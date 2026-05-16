import { jest } from '@jest/globals';

const mockComputeDaily = jest.fn();
jest.unstable_mockModule('../../../services/live-snapshot.service.js', () => ({
  computeDailyAggregateSnapshot: mockComputeDaily,
  computeDrawLiveSnapshot: jest.fn(),
  __setLiveSnapResolver: jest.fn(),
}));

const mockInvalidatePattern = jest.fn();
jest.unstable_mockModule('../../../lib/redis.js', () => ({
  invalidatePattern: mockInvalidatePattern,
  invalidate: jest.fn(),
  cacheOrCompute: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

let workerModule;

beforeAll(async () => {
  workerModule = await import('../refresh-daily-snapshot.worker.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SNAPSHOT_WORKERS_ENABLED;
});

describe('refreshDailySnapshotWorker', () => {
  it('calls computeDailyAggregateSnapshot for TODAY and invalidates report pattern', async () => {
    mockComputeDaily.mockResolvedValueOnce({ bucketsWritten: 5 });

    const result = await workerModule.refreshDailySnapshotWorker([{ data: {} }]);

    expect(mockComputeDaily).toHaveBeenCalledTimes(1);
    expect(mockComputeDaily.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(mockInvalidatePattern).toHaveBeenCalledWith('tote:v1:report:daily:*');
    expect(result.bucketsWritten).toBe(5);
  });

  it('respects SNAPSHOT_WORKERS_ENABLED=false', async () => {
    process.env.SNAPSHOT_WORKERS_ENABLED = 'false';

    const result = await workerModule.refreshDailySnapshotWorker([{ data: {} }]);

    expect(result.skipped).toBe(true);
    expect(mockComputeDaily).not.toHaveBeenCalled();
  });

  it('passes a date normalized to midnight (start of day)', async () => {
    mockComputeDaily.mockResolvedValueOnce({ bucketsWritten: 0 });

    await workerModule.refreshDailySnapshotWorker([{ data: {} }]);

    const dateArg = mockComputeDaily.mock.calls[0][0];
    expect(dateArg.getHours()).toBe(0);
    expect(dateArg.getMinutes()).toBe(0);
    expect(dateArg.getSeconds()).toBe(0);
    expect(dateArg.getMilliseconds()).toBe(0);
  });
});
