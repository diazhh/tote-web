import logger from '../../lib/logger.js';
import { computeDailyAggregateSnapshot } from '../../services/live-snapshot.service.js';
import { invalidatePattern } from '../../lib/redis.js';
import { getVenezuelaDateAsUTC } from '../../lib/dateUtils.js';

export async function refreshDailySnapshotWorker(_jobs) {
  if (process.env.SNAPSHOT_WORKERS_ENABLED === 'false') {
    logger.info('[refresh-daily-snapshot] disabled via SNAPSHOT_WORKERS_ENABLED=false');
    return { skipped: true };
  }

  const startedAt = Date.now();
  const today = getVenezuelaDateAsUTC();

  const result = await computeDailyAggregateSnapshot(today);
  await invalidatePattern('tote:v1:report:daily:*');

  const durationMs = Date.now() - startedAt;
  logger.info(`[refresh-daily-snapshot] bucketsWritten=${result.bucketsWritten} durationMs=${durationMs}`);
  return { bucketsWritten: result.bucketsWritten, durationMs };
}
