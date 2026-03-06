import PgBoss from 'pg-boss';
import logger from '../lib/logger.js';

let instance = null;

export function getBoss() {
  if (!instance) {
    instance = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: 'pgboss',
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      expireInHours: 1,
      archiveCompletedAfterSeconds: 86400,
      deleteAfterDays: 7,
      monitorStateIntervalSeconds: 30,
    });

    instance.on('error', (error) => {
      logger.error('[pg-boss] Error:', error);
    });
  }
  return instance;
}
