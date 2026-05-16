import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { getStats } from '../lib/redis.js';

const router = express.Router();

/**
 * GET /api/admin/cache/stats — Redis cache layer observability (v1.4).
 *
 * Returns:
 *   - enabled:   REDIS_ENABLED flag
 *   - connected: ioredis client status === 'ready'
 *   - keyCount:  Redis DBSIZE (null if disconnected)
 *   - hitRate:   per-prefix hit ratio (hits / (hits+misses))
 *   - counters:  raw hits/misses/fallbacks/timeouts (process-lifetime)
 */
router.get('/stats', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), async (_req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
