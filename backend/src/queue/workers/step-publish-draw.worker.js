import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

export async function stepPublishDrawWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Idempotencia: si ya se publicó, saltar directamente al siguiente paso
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, select: { publishedAt: true } });
  if (draw?.publishedAt) {
    logger.info(`[step-publish-draw] Draw ${drawId} ya publicado (${draw.publishedAt.toISOString()}), saltando`);
  } else {
    logger.info(`[step-publish-draw] Publicando draw ${drawId} en canales...`);

    // Paso no-crítico: capturar error para no bloquear pipeline
    try {
      const publicationService = (await import('../../services/publication.service.js')).default;
      const result = await publicationService.publishDraw(drawId);
      if (result.success) {
        const ok = (result.results || []).filter(r => r.success).length;
        const total = (result.results || []).length;
        logger.info(`[step-publish-draw] Draw ${drawId} publicado en ${ok}/${total} canales`);
      }
    } catch (err) {
      logger.error(`[step-publish-draw] Error publicando: ${err.message}`);
    }
  }

  // Siempre encolar siguiente paso (crítico)
  const boss = getBoss();
  await boss.send(QUEUES.STEP_PROCESS_PRIZES, { drawId }, {
    singletonKey: `prizes-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.STEP_PROCESS_PRIZES],
  });

  return { success: true, drawId };
}
