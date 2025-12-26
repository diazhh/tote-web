import { config } from 'dotenv';
config();

import syncApiPlanningJob from '../src/jobs/sync-api-planning.job.js';
import logger from '../src/lib/logger.js';

async function forceSyncSRQ() {
  try {
    logger.info('🔧 Forzando sincronización con proveedor SRQ...');
    const result = await syncApiPlanningJob.execute();
    logger.info('✅ Sincronización completada:', result);
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error sincronizando con SRQ:', error);
    process.exit(1);
  }
}

forceSyncSRQ();
