import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../lib/redis.js', () => ({
  isHealthy: jest.fn(),
  cacheOrCompute: jest.fn(),
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  shutdown: jest.fn(),
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

let healthRoutes;
let redisLib;
let prismaLib;

beforeAll(async () => {
  redisLib = await import('../lib/redis.js');
  prismaLib = await import('../lib/prisma.js');
  healthRoutes = (await import('../routes/health.routes.js')).default;
});

function buildApp() {
  const app = express();
  app.use('/health', healthRoutes);
  return app;
}

describe('GET /health', () => {
  it('returns 200 with redis=up and postgres=up when both healthy', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(true);
    prismaLib.prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.redis).toBe('up');
    expect(res.body.postgres).toBe('up');
  });

  it('returns 200 with redis=down (degraded) when Redis is unreachable', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(false);
    prismaLib.prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.redis).toBe('down');
    expect(res.body.postgres).toBe('up');
    expect(res.body.status).toBe('degraded');
  });

  it('returns 503 when Postgres fails', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(true);
    prismaLib.prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.postgres).toBe('down');
  });
});
