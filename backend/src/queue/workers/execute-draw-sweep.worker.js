/**
 * execute-draw-sweep worker — runs every minute via cron Linux.
 * Discovers all CLOSED draws at the current Venezuela minute, runs
 * preselect recovery if needed, and enqueues one `execute-draw` job
 * per draw (singletonKey=`execute-${drawId}`).
 *
 * Replaces the legacy Croner execute-draw.job.js. The per-draw worker
 * execute-draw.worker.js does the actual execution + pipeline kickoff.
 */
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import systemConfigService from '../../services/system-config.service.js';
import drawPauseService from '../../services/draw-pause.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import { getVenezuelaTimeString, getVenezuelaDateAsUTC, addMinutesToTime } from '../../lib/dateUtils.js';
import { recoverPreselectIfMissing } from '../../services/draw-recovery.service.js';

export async function executeDrawSweepWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  void job;

  if (await systemConfigService.isEmergencyStop()) {
    return { skipped: 'emergency_stop' };
  }

  const venezuelaTime = getVenezuelaTimeString();
  const venezuelaDate = getVenezuelaDateAsUTC();
  const normalized = venezuelaTime.substring(0, 5) + ':00';

  // Catch-up window de 3 min cubre tick perdido del cron Linux. La
  // idempotencia está garantizada por `singletonKey=execute-${drawId}`.
  const targetEarliest = addMinutesToTime(normalized, -3);

  // Excluir TERMINAL: se ejecuta en cascada desde el Triple vinculado.
  // Ver services/draw-cascade.service.js. Sin esta exclusión, el TERMINAL
  // se ejecutaría con su preselectedItemId (que viene del SRQ sync) en vez
  // de derivar de los últimos 2 dígitos del Triple. Primer mismatch
  // detectado 2026-05-12 08:00 (Triple=028 pero Terminal=77).
  const draws = await prisma.draw.findMany({
    where: {
      status: 'CLOSED',
      drawDate: venezuelaDate,
      drawTime: { gte: targetEarliest, lte: normalized },
      game: { type: { not: 'TERMINAL' } },
    },
    select: {
      id: true,
      gameId: true,
      drawDate: true,
      drawTime: true,
      status: true,
      preselectedItemId: true,
      game: { select: { name: true, type: true } },
    },
  });

  if (draws.length === 0) {
    return { enqueued: 0 };
  }

  const boss = getBoss();
  let enqueued = 0;
  for (const draw of draws) {
    if (await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate)) {
      logger.warn(`[execute-draw-sweep] ⏸️ ${draw.game.name} ${draw.drawTime} OMITIDO: pausado`);
      continue;
    }

    // Recovery inline: si quedó CLOSED sin preselect, ejecutar selectPrewinner ahora
    // antes de encolar. Esto preserva la red final del flujo Croner.
    await recoverPreselectIfMissing(draw);

    const sent = await boss.send(QUEUES.EXECUTE_DRAW, { drawId: draw.id }, {
      singletonKey: `execute-${draw.id}`,
      ...QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW],
    });
    if (sent) {
      enqueued++;
      logger.info(`[execute-draw-sweep] encolado ${draw.id} (${draw.game.name} ${draw.drawTime})`);
    }
  }
  return { enqueued, total: draws.length };
}
