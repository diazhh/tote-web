import logger from '../../lib/logger.js';
import generateDailyDrawsJob from '../../jobs/generate-daily-draws.job.js';

export async function generateDailyDrawsWorker(job) {
  logger.info('[generate-daily-draws] Generando sorteos diarios...');
  // viaWorker:true previene recursión — sin este flag, execute() re-enqueue
  // el mismo job en bucle cuando PGBOSS_GENERATE_DAILY_DRAWS=true.
  await generateDailyDrawsJob.execute({ viaWorker: true });
  return { success: true };
}
