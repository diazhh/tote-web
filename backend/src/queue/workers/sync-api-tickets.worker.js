import logger from '../../lib/logger.js';
import syncApiTicketsJob from '../../jobs/sync-api-tickets.job.js';

export async function syncApiTicketsWorker(job) {
  logger.info('[sync-api-tickets] Sincronizando tickets...');
  await syncApiTicketsJob.execute();
  return { success: true };
}
