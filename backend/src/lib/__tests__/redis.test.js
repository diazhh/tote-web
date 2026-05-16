import { jest } from '@jest/globals';

// Mock ioredis BEFORE importing the module under test
const mockGet = jest.fn();
const mockSetex = jest.fn();
const mockDel = jest.fn();
const mockUnlink = jest.fn();
const mockSmembers = jest.fn();
const mockSadd = jest.fn();
const mockOn = jest.fn();
const mockQuit = jest.fn();

const RedisMock = jest.fn().mockImplementation(() => ({
  get: mockGet,
  setex: mockSetex,
  del: mockDel,
  unlink: mockUnlink,
  smembers: mockSmembers,
  sadd: mockSadd,
  on: mockOn,
  quit: mockQuit,
  status: 'ready',
}));

jest.unstable_mockModule('ioredis', () => ({ default: RedisMock }));

let redisLib;

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.REDIS_ENABLED = 'true';
  process.env.REDIS_URL = 'redis://localhost:6379';
  // Re-import to pick up env changes
  jest.resetModules();
  redisLib = await import('../redis.js');
});

afterEach(() => {
  delete process.env.REDIS_ENABLED;
});

describe('cacheOrCompute', () => {
  it('returns parsed cached value on hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ x: 1 }));
    const fn = jest.fn().mockResolvedValue({ x: 2 });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ x: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('computes and SETEX on miss', async () => {
    mockGet.mockResolvedValueOnce(null);
    const fn = jest.fn().mockResolvedValue({ y: 42 });

    const result = await redisLib.cacheOrCompute('test:key', 60, fn);

    expect(result).toEqual({ y: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockSetex).toHaveBeenCalledWith('test:key', 60, JSON.stringify({ y: 42 }));
  });

  it('falls back to fn when Redis GET throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const fn = jest.fn().mockResolvedValue({ z: 'fallback' });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ z: 'fallback' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to fn when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');

    const fn = jest.fn().mockResolvedValue({ disabled: true });
    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ disabled: true });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('times out on slow Redis (>200ms) and falls to fn', async () => {
    mockGet.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve('cached'), 500)));
    const fn = jest.fn().mockResolvedValue({ ok: true });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalled();
  }, 1000);

  it('returns computed value even when SETEX fails', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockSetex.mockRejectedValueOnce(new Error('redis_down'));
    const fn = jest.fn().mockResolvedValue({ ok: 1 });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ ok: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns cached falsy values (0, false, null) without recomputing', async () => {
    mockGet.mockResolvedValueOnce('0');
    const fn = jest.fn();
    expect(await redisLib.cacheOrCompute('k', 30, fn)).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it('registers key in tracking set on miss when opts.trackingSet is provided', async () => {
    mockGet.mockResolvedValueOnce(null);
    const fn = jest.fn().mockResolvedValue({ ok: true });

    await redisLib.cacheOrCompute('tote:v1:report:abc', 60, fn, { trackingSet: 'tote:v1:report:*' });

    expect(mockSadd).toHaveBeenCalledWith('tote:v1:idx:tote:v1:report:*', 'tote:v1:report:abc');
  });
});

describe('invalidate', () => {
  it('DELs the exact key', async () => {
    mockDel.mockResolvedValueOnce(1);
    await redisLib.invalidate('test:key');
    expect(mockDel).toHaveBeenCalledWith('test:key');
  });

  it('does nothing when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');
    await redisLib.invalidate('test:key');
    expect(mockDel).not.toHaveBeenCalled();
  });
});

describe('invalidatePattern (via tracking Set)', () => {
  it('reads members from tracking set and UNLINKs them', async () => {
    mockSmembers.mockResolvedValueOnce(['tote:v1:report:a', 'tote:v1:report:b']);
    mockUnlink.mockResolvedValueOnce(2);

    await redisLib.invalidatePattern('tote:v1:report:*');

    expect(mockSmembers).toHaveBeenCalledWith('tote:v1:idx:tote:v1:report:*');
    expect(mockUnlink).toHaveBeenCalledWith('tote:v1:report:a', 'tote:v1:report:b');
  });

  it('no-ops on empty set', async () => {
    mockSmembers.mockResolvedValueOnce([]);
    await redisLib.invalidatePattern('tote:v1:report:*');
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});

describe('isHealthy', () => {
  it('returns true when client status=ready', async () => {
    expect(await redisLib.isHealthy()).toBe(true);
  });

  it('returns false when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');
    expect(await redisLib.isHealthy()).toBe(false);
  });

  it('returns false when client status is not ready', async () => {
    // Override the RedisMock for this one test to return a non-ready client
    RedisMock.mockImplementationOnce(() => ({
      get: mockGet, setex: mockSetex, del: mockDel, unlink: mockUnlink,
      smembers: mockSmembers, sadd: mockSadd, on: mockOn, quit: mockQuit,
      status: 'connecting',
    }));
    jest.resetModules();
    redisLib = await import('../redis.js');

    expect(await redisLib.isHealthy()).toBe(false);
  });
});
