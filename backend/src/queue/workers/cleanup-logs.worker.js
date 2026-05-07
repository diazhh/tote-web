/**
 * Cleanup logs worker — corre diariamente y purga registros viejos para
 * evitar que un atacante con acceso a un endpoint de creación pueda llenar
 * el disco. Las retenciones son conservadoras y deben sobrar para forensia.
 */

import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const RETENTION = {
  // WebhookLog: descartar payloads antiguos en estados no útiles
  webhookLogDiscoveredDays: 7,
  webhookLogProcessedDays: 30,
  // PageVisit: 90 días alcanza para reportes históricos
  pageVisitDays: 90,
  // PasswordResetToken: tokens usados o expirados ya no sirven
  passwordResetTokenDays: 7,
};

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export async function cleanupLogsWorker() {
  const startedAt = Date.now();
  const summary = {};

  try {
    // 1) WebhookLog: estados no productivos viejos
    const webhookDiscovered = await prisma.webhookLog.deleteMany({
      where: {
        status: { in: ['DISCOVERED', 'DUPLICATE', 'FAILED'] },
        createdAt: { lt: daysAgo(RETENTION.webhookLogDiscoveredDays) },
      },
    });
    summary.webhookLog_discovered_dup_failed = webhookDiscovered.count;

    // 2) WebhookLog: processed muy viejo
    const webhookProcessed = await prisma.webhookLog.deleteMany({
      where: {
        status: 'PROCESSED',
        createdAt: { lt: daysAgo(RETENTION.webhookLogProcessedDays) },
      },
    });
    summary.webhookLog_processed = webhookProcessed.count;

    // 3) PageVisit
    const pageVisits = await prisma.pageVisit.deleteMany({
      where: { createdAt: { lt: daysAgo(RETENTION.pageVisitDays) } },
    });
    summary.pageVisit = pageVisits.count;

    // 4) PasswordResetToken: usados o expirados
    const resetTokens = await prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { used: true },
          { expiresAt: { lt: new Date() } },
        ],
        createdAt: { lt: daysAgo(RETENTION.passwordResetTokenDays) },
      },
    });
    summary.passwordResetToken = resetTokens.count;

    const elapsed = Date.now() - startedAt;
    logger.info('[cleanup-logs] Limpieza completada', { ...summary, elapsedMs: elapsed });
    return summary;
  } catch (error) {
    logger.error('[cleanup-logs] Error en limpieza:', error);
    throw error;
  }
}
