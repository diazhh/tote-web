import { config } from 'dotenv';
config();

import generateDailyDrawsJob from '../src/jobs/generate-daily-draws.job.js';
import logger from '../src/lib/logger.js';

async function forceGenerateDraws() {
  try {
    logger.info('🔧 Forzando ejecución manual del job de generación de sorteos...');
    await generateDailyDrawsJob.execute();
    logger.info('✅ Job ejecutado exitosamente');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error ejecutando job:', error);
    process.exit(1);
  }
}

forceGenerateDraws();
