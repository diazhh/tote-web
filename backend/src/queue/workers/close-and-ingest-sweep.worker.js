/**
 * close-and-ingest-sweep worker — runs every minute via boss.schedule.
 * Finds SCHEDULED draws in the [now+5min, now+6min) window and enqueues
 * one `close-and-ingest` job per draw (singletonKey=`close-${drawId}`).
 *
 * Does NO heavy work — just discovery + enqueue. The per-draw worker does
 * the close + ingest. This keeps the sweep tick under 100ms.
 */
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import systemConfigService from '../../services/system-config.service.js';
import drawPauseService from '../../services/draw-pause.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import { getVenezuelaTimeString, getVenezuelaDateAsUTC, addMinutesToTime } from '../../lib/dateUtils.js';

export async function closeAndIngestSweepWorker(jobs) {
  // pg-boss v10 always calls handlers with an array
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  void job; // sweep has no payload

  if (await systemConfigService.isEmergencyStop()) {
    return { skipped: 'emergency_stop' };
  }

  const venezuelaTime = getVenezuelaTimeString();
  const venezuelaDate = getVenezuelaDateAsUTC();
  const normalized = venezuelaTime.substring(0, 5) + ':00';
  const targetStart = addMinutesToTime(normalized, 5);
  const targetEnd   = addMinutesToTime(normalized, 6);

  const draws = await prisma.draw.findMany({
    where: {
      status: 'SCHEDULED',
      drawDate: venezuelaDate,
      drawTime: { gte: targetStart, lt: targetEnd },
    },
    select: { id: true, gameId: true, drawDate: true, drawTime: true, game: { select: { name: true } } },
  });

  if (draws.length === 0) {
    return { enqueued: 0 };
  }

  const boss = getBoss();
  let enqueued = 0;
  for (const draw of draws) {
    if (await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate)) {
      logger.warn(`[close-and-ingest-sweep] ⏸️ ${draw.game.name} ${draw.drawTime} OMITIDO: juego pausado`);
      continue;
    }
    const sent = await boss.send(QUEUES.CLOSE_AND_INGEST, { drawId: draw.id }, {
      singletonKey: `close-${draw.id}`,
      ...QUEUE_CONFIGS[QUEUES.CLOSE_AND_INGEST],
    });
    if (sent) {
      enqueued++;
      logger.info(`[close-and-ingest-sweep] encolado draw ${draw.id} (${draw.game.name} ${draw.drawTime})`);
    }
  }
  return { enqueued, total: draws.length };
}
