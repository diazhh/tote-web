import logger from '../../lib/logger.js';
import generateDailyDrawsJob from '../../jobs/generate-daily-draws.job.js';

export async function generateDailyDrawsWorker(job) {
  logger.info('[generate-daily-draws] Generando sorteos diarios...');
  await generateDailyDrawsJob.execute();
  return { success: true };
}
