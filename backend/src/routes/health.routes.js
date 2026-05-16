import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { isHealthy as redisHealthy } from '../lib/redis.js';

const router = Router();

router.get('/', async (_req, res) => {
  const redis = (await redisHealthy()) ? 'up' : 'down';

  let postgres = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    postgres = 'down';
  }

  const allUp = redis === 'up' && postgres === 'up';
  const code = postgres === 'down' ? 503 : 200;
  res.status(code).json({
    status: allUp ? 'ok' : postgres === 'down' ? 'down' : 'degraded',
    postgres,
    redis,
    timestamp: new Date().toISOString(),
  });
});

export default router;
