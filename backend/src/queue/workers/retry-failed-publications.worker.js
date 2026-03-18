import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

/**
 * Worker scheduled que busca DrawPublications FAILED de las últimas 2 horas
 * y reintenta enviarlas. Corre cada 5 minutos.
 *
 * Las guardas por canal (status === 'SENT') en publication.service.js
 * previenen duplicados — solo reintenta canales que realmente fallaron.
 */
export async function retryFailedPublicationsWorker() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Buscar draws con al menos un canal FAILED en las últimas 2 horas
  const failedPubs = await prisma.drawPublication.findMany({
    where: {
      status: 'FAILED',
      updatedAt: { gte: twoHoursAgo },
      retries: { lt: 5 }, // máximo 5 reintentos totales
    },
    include: {
      draw: {
        select: { id: true, status: true, gameId: true }
      }
    }
  });

  if (failedPubs.length === 0) return { success: true, retried: 0 };

  // Agrupar por drawId para no republicar el mismo draw múltiples veces
  const drawIds = [...new Set(failedPubs.filter(p => p.draw.status === 'DRAWN').map(p => p.draw.id))];

  logger.info(`[retry-failed-pubs] ${failedPubs.length} publicaciones FAILED en ${drawIds.length} draws, reintentando...`);

  let retried = 0;
  let succeeded = 0;

  for (const drawId of drawIds) {
    const channelsFailed = failedPubs
      .filter(p => p.drawId === drawId)
      .map(p => p.channel);

    for (const channel of channelsFailed) {
      try {
        const publicationService = (await import('../../services/publication.service.js')).default;
        const result = await publicationService.republishToChannel(drawId, channel);
        retried++;
        if (result.success && !result.skipped) {
          succeeded++;
          logger.info(`[retry-failed-pubs] ${channel} para draw ${drawId}: OK`);
        } else if (result.skipped) {
          logger.info(`[retry-failed-pubs] ${channel} para draw ${drawId}: saltado (${result.reason})`);
        }
      } catch (err) {
        retried++;
        logger.warn(`[retry-failed-pubs] ${channel} para draw ${drawId}: FAILED again — ${err.message}`);
      }
    }
  }

  logger.info(`[retry-failed-pubs] Resultado: ${succeeded}/${retried} reintentos exitosos`);
  return { success: true, retried, succeeded };
}
