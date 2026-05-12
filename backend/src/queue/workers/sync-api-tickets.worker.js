import logger from '../../lib/logger.js';
import syncApiTicketsJob from '../../jobs/sync-api-tickets.job.js';

export async function syncApiTicketsWorker(job) {
  logger.info('[sync-api-tickets] Sincronizando tickets...');
  // viaWorker:true previene recursión — sin este flag, execute() re-enqueue
  // el mismo job en bucle cuando PGBOSS_SYNC_API_TICKETS=true.
  await syncApiTicketsJob.execute({ viaWorker: true });
  return { success: true };
}
