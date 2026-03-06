import logger from '../../lib/logger.js';
import systemConfigService from '../../services/system-config.service.js';
import testBetsJob from '../../jobs/test-bets.job.js';

export async function testBetsWorker(job) {
  const config = await systemConfigService.getTestBetsConfig();

  if (!config.enabled) {
    logger.info('[test-bets] Jugadas de prueba deshabilitadas, saltando');
    return { skipped: true, reason: 'disabled' };
  }

  logger.info('[test-bets] Ejecutando jugadas de prueba...');
  await testBetsJob.insertTestBets(config);

  return { success: true };
}
