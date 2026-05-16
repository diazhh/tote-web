import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { computeDrawLiveSnapshot } from '../../services/live-snapshot.service.js';
import { invalidate } from '../../lib/redis.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Cron-triggered every minute via /etc/cron.d/tote-triggers.
 * Refreshes DrawLiveSnapshot for every SCHEDULED/CLOSED draw of today,
 * then invalidates the matching Redis cache key so the next read pulls fresh.
 *
 * Defensive: a single bad draw must not poison the batch. Errors are logged
 * and the worker returns counts but never throws.
 */
export async function refreshLiveSnapshotsWorker(jobs) {
  if (process.env.SNAPSHOT_WORKERS_ENABLED === 'false') {
    logger.info('[refresh-live-snapshots] disabled via SNAPSHOT_WORKERS_ENABLED=false');
    return { skipped: true };
  }

  // pg-boss v10 always invokes handler with an array of jobs
  Array.isArray(jobs) ? jobs[0] : jobs;

  const startedAt = Date.now();
  const draws = await prisma.draw.findMany({
    where: {
      drawDate: startOfToday(),
      status: { in: ['SCHEDULED', 'CLOSED'] },
    },
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;

  for (const d of draws) {
    try {
      await computeDrawLiveSnapshot(d.id);
      await invalidate(`tote:v1:draw:${d.id}:snap`);
      processed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`[refresh-live-snapshots] drawId=${d.id} failed: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    `[refresh-live-snapshots] processed=${processed} failed=${failed} totalCandidates=${draws.length} durationMs=${durationMs}`,
  );
  if (durationMs > 30000) {
    logger.warn(`[refresh-live-snapshots] SLOW: ${durationMs}ms — approaching next cron tick`);
  }

  return { processed, failed, durationMs };
}
