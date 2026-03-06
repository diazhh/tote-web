import logger from '../../lib/logger.js';
import apiIntegrationService from '../../services/api-integration.service.js';

export async function syncApiPlanningWorker(job) {
  logger.info('[sync-api-planning] Sincronizando planificación con SRQ...');

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const resultToday = await apiIntegrationService.syncSRQPlanning(today);
  const resultTomorrow = await apiIntegrationService.syncSRQPlanning(tomorrow);

  const mapped = resultToday.mapped + resultTomorrow.mapped;
  const skipped = resultToday.skipped + resultTomorrow.skipped;

  logger.info(`[sync-api-planning] Completado: ${mapped} sorteos mapeados, ${skipped} saltados`);
  return { success: true, mapped, skipped };
}
