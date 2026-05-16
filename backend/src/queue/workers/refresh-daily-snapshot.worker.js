import logger from '../../lib/logger.js';
import { computeDailyAggregateSnapshot } from '../../services/live-snapshot.service.js';
import { invalidatePattern } from '../../lib/redis.js';

export async function refreshDailySnapshotWorker(jobs) {
  if (process.env.SNAPSHOT_WORKERS_ENABLED === 'false') {
    logger.info('[refresh-daily-snapshot] disabled via SNAPSHOT_WORKERS_ENABLED=false');
    return { skipped: true };
  }

  // pg-boss v10 always invokes handler with an array of jobs
  Array.isArray(jobs) ? jobs[0] : jobs;

  const startedAt = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await computeDailyAggregateSnapshot(today);
  await invalidatePattern('tote:v1:report:daily:*');

  const durationMs = Date.now() - startedAt;
  logger.info(`[refresh-daily-snapshot] bucketsWritten=${result.bucketsWritten} durationMs=${durationMs}`);
  return { bucketsWritten: result.bucketsWritten, durationMs };
}
