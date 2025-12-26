import cron from 'node-cron';
import logger from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import apiIntegrationService from '../services/api-integration.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import { addMinutes, subMinutes } from 'date-fns';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';

/**
 * Job para sincronizar tickets de APIs externas (SRQ)
 * 
 * LÓGICA:
 * - Se ejecuta cada 5 minutos
 * - Por cada juego activo, busca el sorteo PRÓXIMO a cerrar (status SCHEDULED)
 * - Solo sincroniza sorteos que tengan mapping de SRQ (external_draw_id)
 * - Sincroniza CONTINUAMENTE hasta que el sorteo cambie a CLOSED
 * 
 * Ejemplo:
 * - 5:00pm → Sincroniza sorteo de 6:00pm
 * - 5:05pm → Sincroniza sorteo de 6:00pm
 * - 5:50pm → Sincroniza sorteo de 6:00pm
 * - 5:55pm → Sorteo de 6:00pm se cierra (close-draw.job.js), deja de sincronizar
 * - 6:00pm → Sincroniza sorteo de 7:00pm
 * 
 * Para cada sorteo:
 *   1. Elimina todos los tickets y detalles existentes del sorteo
 *   2. Consulta API de SRQ para obtener ventas actualizadas
 *   3. Inserta todos los tickets y detalles asociados
 * 
 * IMPORTANTE: Este job NO selecciona pre-ganador. Eso lo hace close-draw.job.js
 * exactamente 5 minutos antes de la hora del sorteo.
 */
class SyncApiTicketsJob {
  constructor() {
    this.cronExpression = '*/5 * * * *'; // Cada 5 minutos
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, { timezone: 'America/Caracas' });

    logger.info(`✅ Job SyncApiTickets iniciado (cada 5 minutos, sorteos próximos a cerrar, TZ: America/Caracas)`);
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
   * 
   * Lógica:
   * 1. Obtener todos los juegos activos
   * 2. Por cada juego, buscar el sorteo PRÓXIMO a cerrar (SCHEDULED con mapping)
   * 3. Sincronizar tickets de SRQ cada 5 minutos (elimina + inserta)
   * 4. Continuar sincronizando hasta que el sorteo cambie a CLOSED
   * 5. Seleccionar pre-ganador si no existe
   * 
   * Ejemplo:
   * - Si son las 5:00pm, sincroniza el sorteo de las 6:00pm
   * - Si son las 5:50pm, sincroniza el sorteo de las 6:00pm
   * - A las 5:55pm cierra el sorteo y deja de sincronizar
   */
  async execute() {
    try {
      const now = new Date();

      // 1. Obtener todos los juegos activos
      const games = await prisma.game.findMany({
        where: { isActive: true }
      });

      if (games.length === 0) {
        return;
      }

      logger.info(`🎫 Sincronizando tickets de sorteos próximos a cerrar...`);

      // 2. Por cada juego, buscar el sorteo próximo a cerrar
      for (const game of games) {
        try {
          // Buscar el sorteo SCHEDULED más próximo que tenga mapping de SRQ
          // El sorteo cierra 5 minutos antes de su hora programada
          // Ejemplo: Sorteo de 6pm cierra a las 5:55pm
          // Entonces desde las 5:00pm hasta las 5:55pm sincronizamos el sorteo de 6pm
          const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
          
          const { getVenezuelaDateAsUTC, getVenezuelaTimeString } = await import('../lib/dateUtils.js');
          const todayVenezuela = getVenezuelaDateAsUTC();
          const currentTime = getVenezuelaTimeString();
          
          // Calcular 1 hora desde ahora en hora Venezuela
          const [hours, minutes] = currentTime.split(':');
          let oneHourLaterHours = parseInt(hours) + 1;
          const oneHourLaterTime = `${String(oneHourLaterHours).padStart(2, '0')}:${minutes}:00`;
          const tomorrowVenezuela = new Date(todayVenezuela);
          tomorrowVenezuela.setDate(tomorrowVenezuela.getDate() + 1);
          
          const draw = await prisma.draw.findFirst({
            where: {
              gameId: game.id,
              status: 'SCHEDULED',
              OR: [
                { drawDate: todayVenezuela, drawTime: { gte: currentTime, lte: oneHourLaterTime } },
                { drawDate: tomorrowVenezuela, drawTime: { lte: oneHourLaterTime } }
              ],
              apiMappings: {
                some: {}, // Debe tener mapping de SRQ
              },
            },
            include: {
              apiMappings: true,
            },
            orderBy: [
              { drawDate: 'asc' },
              { drawTime: 'asc' }
            ],
          });

          if (!draw) {
            continue; // No hay sorteo próximo para este juego
          }

          // Calcular minutos hasta el sorteo usando drawTime
          const [drawHours, drawMinutes] = draw.drawTime.split(':');
          const [currentHours, currentMinutes] = currentTime.split(':');
          const drawTotalMinutes = parseInt(drawHours) * 60 + parseInt(drawMinutes);
          const currentTotalMinutes = parseInt(currentHours) * 60 + parseInt(currentMinutes);
          const minutesUntilDraw = drawTotalMinutes - currentTotalMinutes;
          // Calcular minutos hasta el cierre (5 min antes del sorteo)
          const minutesUntilClose = minutesUntilDraw - 5;

          // Formatear hora para display
          const hour = parseInt(drawHours);
          const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
          const displayHour = hour % 12 || 12;
          const hora = `${displayHour}:${drawMinutes} ${ampm}`;

          logger.info(`  📊 ${game.name} ${hora} (cierra en ${minutesUntilClose} min)`);

          // 3. Importar tickets de SRQ (elimina tickets anteriores + inserta nuevos)
          // Se ejecuta cada 5 minutos hasta que el sorteo cambie a CLOSED
          const result = await apiIntegrationService.importSRQTickets(draw.id, true);
          
          logger.info(`     ✓ ${result.imported} tickets importados, ${result.deleted} eliminados`);
        } catch (error) {
          logger.error(`  ✗ Error en ${game.name}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error en SyncApiTicketsJob:', error);
    }
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
      
      const { getVenezuelaDateAsUTC } = await import('../lib/dateUtils.js');
      const todayVenezuela = getVenezuelaDateAsUTC();
      
      const draws = await prisma.draw.findMany({
        where: {
          drawDate: todayVenezuela,
          apiMappings: {
            some: {},
          },
        },
        include: {
          game: true,
          apiMappings: true,
        },
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ],
      });

      logger.info(`🎫 Importando tickets de ${draws.length} sorteos de hoy...`);

      const results = [];
      for (const draw of draws) {
        try {
          const result = await apiIntegrationService.importSRQTickets(draw.id);
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            ...result,
          });
          logger.info(`  ✓ ${draw.game.name} ${draw.drawTime}: ${result.imported} tickets`);
        } catch (error) {
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
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
