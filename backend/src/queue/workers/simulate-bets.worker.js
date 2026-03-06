import logger from '../../lib/logger.js';
import systemConfigService from '../../services/system-config.service.js';
import betSimulatorService from '../../services/bet-simulator.service.js';

export async function simulateBetsWorker(job) {
  const isEmergencyStop = await systemConfigService.isEmergencyStop();
  if (isEmergencyStop) {
    logger.info('[simulate-bets] Emergency stop activo, saltando');
    return { skipped: true, reason: 'emergency_stop' };
  }

  const isSimulatorEnabled = await systemConfigService.isBetSimulatorEnabled();
  if (!isSimulatorEnabled) {
    logger.info('[simulate-bets] Simulador deshabilitado, saltando');
    return { skipped: true, reason: 'simulator_disabled' };
  }

  logger.info('[simulate-bets] Iniciando simulación automática...');

  const result = await betSimulatorService.runSimulation({
    includeTripletas: true,
    delayMs: 50,
  });

  if (result.success) {
    logger.info(`[simulate-bets] Completado: ${result.stats.tickets} tickets, ${result.stats.tripletas} tripletas`);
  } else {
    logger.info(`[simulate-bets] ${result.message}`);
  }

  return { success: true, stats: result.stats };
}
