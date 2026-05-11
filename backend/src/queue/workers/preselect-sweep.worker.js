/**
 * preselect-sweep worker — runs every minute via boss.schedule.
 * Finds CLOSED draws WITHOUT preselectedItemId in [now+3min, now+5min)
 * window (TERMINAL excluded — their winner cascades from Triple) and
 * enqueues one `preselect` job per draw with singletonKey=`preselect-${drawId}`.
 */
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import systemConfigService from '../../services/system-config.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import { getVenezuelaTimeString, getVenezuelaDateAsUTC, addMinutesToTime } from '../../lib/dateUtils.js';

export async function preselectSweepWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  void job;

  if (await systemConfigService.isEmergencyStop()) {
    return { skipped: 'emergency_stop' };
  }

  const venezuelaTime = getVenezuelaTimeString();
  const venezuelaDate = getVenezuelaDateAsUTC();
  const normalized = venezuelaTime.substring(0, 5) + ':00';
  // Catch-up window: 10 min hacia atrás. Si preselect-sweep no corrió a tiempo,
  // el siguiente tick recupera el draw aunque ya haya pasado T-3. La red final
  // es `recoverPreselectIfMissing` en execute-draw.job.js (inline a xx:00).
  const targetEarliest = addMinutesToTime(normalized, -10);
  const targetLatest   = addMinutesToTime(normalized, 5);

  const draws = await prisma.draw.findMany({
    where: {
      status: 'CLOSED',
      preselectedItemId: null,
      drawDate: venezuelaDate,
      drawTime: { gte: targetEarliest, lt: targetLatest },
      game: { type: { not: 'TERMINAL' } },
    },
    select: { id: true, drawTime: true, game: { select: { name: true } } },
  });

  if (draws.length === 0) {
    return { enqueued: 0 };
  }

  const boss = getBoss();
  let enqueued = 0;
  for (const draw of draws) {
    const sent = await boss.send(QUEUES.PRESELECT, { drawId: draw.id }, {
      singletonKey: `preselect-${draw.id}`,
      ...QUEUE_CONFIGS[QUEUES.PRESELECT],
    });
    if (sent) {
      enqueued++;
      logger.info(`[preselect-sweep] encolado draw ${draw.id} (${draw.game.name} ${draw.drawTime})`);
    }
  }
  return { enqueued, total: draws.length };
}
