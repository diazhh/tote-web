import cron from 'node-cron';
import logger from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import apiIntegrationService from '../services/api-integration.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import { startOfDay, endOfDay, addMinutes, subMinutes } from 'date-fns';

/**
 * Job para sincronizar tickets de APIs externas
 * Se ejecuta cada minuto y verifica si hay sorteos próximos a cerrar
 * Importa tickets 5 minutos antes de la hora de totalización
 */
class SyncApiTicketsJob {
  constructor() {
    this.cronExpression = '* * * * *'; // Cada minuto
    this.minutesBefore = 5; // Minutos antes del sorteo para importar tickets
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, { timezone: 'America/Caracas' });

    logger.info(`✅ Job SyncApiTickets iniciado (cada minuto, ${this.minutesBefore} min antes del sorteo, TZ: America/Caracas)`);
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job SyncApiTickets detenido');
    }
  }

  /**
   * Ejecutar el job
   */
  async execute() {
    try {
      const now = new Date();
      const targetTime = addMinutes(now, this.minutesBefore);
      const windowStart = subMinutes(targetTime, 1); // Ventana de 2 minutos

      // Buscar sorteos que cierran en los próximos 5 minutos (+/- 1 min)
      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: windowStart,
            lte: targetTime,
          },
          status: {
            in: ['SCHEDULED', 'CLOSED'],
          },
          apiMappings: {
            some: {}, // Solo sorteos con mapping de API
          },
        },
        include: {
          game: true,
          apiMappings: true,
        },
      });

      if (draws.length === 0) {
        return; // No hay sorteos próximos
      }

      logger.info(`🎫 Sincronizando tickets de ${draws.length} sorteos próximos a cerrar...`);

      for (const draw of draws) {
        try {
          // 1. Importar tickets de TODOS los proveedores configurados para este juego
          const importResults = await this.importTicketsFromAllProviders(draw);
          
          const totalImported = importResults.reduce((sum, r) => sum + (r.imported || 0), 0);
          const totalSkipped = importResults.reduce((sum, r) => sum + (r.skipped || 0), 0);
          const allSuccessful = importResults.every(r => !r.error);
          
          logger.info(`  ✓ ${draw.game.name} ${draw.scheduledAt.toLocaleTimeString()}: ${totalImported} tickets de ${importResults.length} proveedor(es)`);

          // 2. Seleccionar pre-ganador SOLO después de importar de TODOS los proveedores
          if (allSuccessful && (totalImported > 0 || totalSkipped > 0)) {
            // Verificar que el sorteo no tenga ya un pre-ganador
            const currentDraw = await prisma.draw.findUnique({
              where: { id: draw.id },
              select: { preselectedItemId: true, status: true }
            });

            if (!currentDraw.preselectedItemId && currentDraw.status === 'SCHEDULED') {
              try {
                const prewinner = await prewinnerSelectionService.selectPrewinner(draw.id);
                if (prewinner) {
                  logger.info(`  🎯 Pre-ganador: ${prewinner.number} (${prewinner.name})`);
                }
              } catch (prewinnerError) {
                logger.error(`  ⚠️ Error seleccionando pre-ganador: ${prewinnerError.message}`);
              }
            }
          }
        } catch (error) {
          logger.error(`  ✗ Error en ${draw.game.name}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error en SyncApiTicketsJob:', error);
    }
  }

  /**
   * Importar tickets de todos los proveedores configurados para un sorteo
   * @param {object} draw - Objeto Draw con game y apiMappings
   * @returns {Promise<Array>} - Resultados de importación por proveedor
   */
  async importTicketsFromAllProviders(draw) {
    const results = [];

    // Obtener todas las configuraciones de SALES activas para este juego
    const salesConfigs = await prisma.apiConfiguration.findMany({
      where: {
        gameId: draw.gameId,
        type: 'SALES',
        isActive: true
      },
      include: {
        apiSystem: true
      }
    });

    if (salesConfigs.length === 0) {
      // Si no hay configuraciones de ventas, usar el método existente
      const result = await apiIntegrationService.importSRQTickets(draw.id);
      return [result];
    }

    // Importar de cada proveedor
    for (const config of salesConfigs) {
      try {
        const result = await apiIntegrationService.importSRQTickets(draw.id);
        results.push({
          provider: config.apiSystem?.name || config.name,
          ...result
        });
      } catch (error) {
        results.push({
          provider: config.apiSystem?.name || config.name,
          error: error.message,
          imported: 0,
          skipped: 0
        });
      }
    }

    return results;
  }

  /**
   * Ejecutar manualmente para un sorteo específico
   * @param {string} drawId - ID del sorteo
   */
  async executeForDraw(drawId) {
    try {
      logger.info(`🎫 Importando tickets para sorteo ${drawId}...`);
      const result = await apiIntegrationService.importSRQTickets(drawId);
      return result;
    } catch (error) {
      logger.error(`Error importando tickets para ${drawId}:`, error);
      throw error;
    }
  }

  /**
   * Ejecutar para todos los sorteos de hoy
   */
  async executeForToday() {
    try {
      const today = new Date();
      
      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: startOfDay(today),
            lte: endOfDay(today),
          },
          apiMappings: {
            some: {},
          },
        },
        include: {
          game: true,
          apiMappings: true,
        },
        orderBy: { scheduledAt: 'asc' },
      });

      logger.info(`🎫 Importando tickets de ${draws.length} sorteos de hoy...`);

      const results = [];
      for (const draw of draws) {
        try {
          const result = await apiIntegrationService.importSRQTickets(draw.id);
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            time: draw.scheduledAt,
            ...result,
          });
          logger.info(`  ✓ ${draw.game.name} ${draw.scheduledAt.toLocaleTimeString()}: ${result.imported} tickets`);
        } catch (error) {
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            time: draw.scheduledAt,
            error: error.message,
          });
          logger.error(`  ✗ ${draw.game.name}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      logger.error('Error en executeForToday:', error);
      throw error;
    }
  }
}

export default new SyncApiTicketsJob();
