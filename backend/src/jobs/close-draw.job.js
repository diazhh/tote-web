import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import apiIntegrationService from '../services/api-integration.service.js';
import adminNotificationService from '../services/admin-notification.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import pdfReportService from '../services/pdf-report.service.js';
import betSimulatorService from '../services/bet-simulator.service.js';
import { startOfDay } from 'date-fns';
import { getVenezuelaDateString, getVenezuelaTimeString, getVenezuelaDateAsUTC, addMinutesToTime } from '../lib/dateUtils.js';

/**
 * Job para cerrar sorteos 5 minutos antes y preseleccionar ganador
 * Se ejecuta cada minuto
 */
class CloseDrawJob {
  constructor() {
    this.cronExpression = '* * * * *'; // Cada minuto
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, { timezone: 'America/Caracas' });

    logger.info('✅ Job CloseDraws iniciado (cada minuto, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job CloseDraws detenido');
    }
  }

  /**
   * Ejecutar el job
   */
  async execute() {
    try {
      // Verificar parada de emergencia
      const isEmergencyStop = await systemConfigService.isEmergencyStop();
      if (isEmergencyStop) {
        return; // Silenciosamente no hacer nada
      }

      // Obtener fecha y hora actual en Venezuela
      const venezuelaTime = getVenezuelaTimeString(); // HH:MM:SS
      const venezuelaDate = getVenezuelaDateAsUTC(); // Date object para DB
      
      // Calcular hora + 5 minutos (para cerrar sorteos 5 min antes)
      const targetDrawTime = addMinutesToTime(venezuelaTime, 5);

      // Buscar sorteos que deben cerrarse (5 minutos antes)
      // Usar drawDate y drawTime (hora Venezuela directa)
      const drawsToClose = await prisma.draw.findMany({
        where: {
          status: 'SCHEDULED',
          drawDate: venezuelaDate,
          drawTime: targetDrawTime
        },
        include: {
          game: {
            include: {
              items: {
                where: {
                  isActive: true
                }
              }
            }
          },
          preselectedItem: true
        }
      });

      if (drawsToClose.length === 0) {
        return; // No hay sorteos para cerrar
      }

      logger.info(`🔒 Cerrando ${drawsToClose.length} sorteo(s)...`);

      for (const draw of drawsToClose) {
        try {
          const items = draw.game.items;
          
          if (items.length === 0) {
            logger.error(`No hay items activos para el juego ${draw.game.name}`);
            continue;
          }

          let selectedItem;
          let pdfPath = null;
          let selectionMethod = 'random';

          // Verificar si un admin ya puso un pre-ganador manualmente
          if (draw.preselectedItemId) {
            // Respetar la selección del admin
            selectedItem = items.find(i => i.id === draw.preselectedItemId);
            if (selectedItem) {
              selectionMethod = 'admin';
              logger.info(
                `👤 Sorteo ${draw.game.name} - ${draw.drawTime} ` +
                `| Pre-ganador ya seleccionado por admin: ${selectedItem.number} - ${selectedItem.name}`
              );
            }
          }

          // Si no hay pre-ganador de admin, hacer selección automática
          if (!selectedItem) {
            // ANTES DE CERRAR: Importar tickets de APIs externas
            let hasTickets = false;
            try {
              logger.info(`📥 Importando ventas externas para sorteo ${draw.id}...`);
              const importResult = await apiIntegrationService.importSRQTickets(draw.id);
              logger.info(
                `✅ Ventas importadas: ${importResult.imported} tickets guardados, ${importResult.skipped} saltados`
              );
              hasTickets = importResult.imported > 0;
            } catch (error) {
              logger.warn(`⚠️ No se pudieron importar ventas para sorteo ${draw.id}:`, error.message);
            }

            // Si hay tickets, usar el servicio de selección inteligente
            if (hasTickets) {
              try {
                selectedItem = await prewinnerSelectionService.selectPrewinner(draw.id);
                // El servicio ya actualiza el sorteo, genera PDF y envía notificación
                if (selectedItem) {
                  selectionMethod = 'intelligent';
                  // Emitir eventos WebSocket
                  const updatedDraw = await prisma.draw.findUnique({
                    where: { id: draw.id },
                    include: { game: true, preselectedItem: true }
                  });
                  
                  emitToAll('draw:closed', {
                    drawId: updatedDraw.id,
                    game: { name: updatedDraw.game.name, slug: updatedDraw.game.slug },
                    drawDate: updatedDraw.drawDate,
                    drawTime: updatedDraw.drawTime,
                    preselectedItem: { number: selectedItem.number, name: selectedItem.name }
                  });

                  emitToGame(updatedDraw.game.slug, 'draw:closed', {
                    drawId: updatedDraw.id,
                    drawDate: updatedDraw.drawDate,
                    drawTime: updatedDraw.drawTime,
                    preselectedItem: { number: selectedItem.number, name: selectedItem.name }
                  });

                  logger.info(
                    `🔒 Sorteo cerrado: ${draw.game.name} - ${draw.drawTime} ` +
                    `| Preselección inteligente: ${selectedItem.number} - ${selectedItem.name}`
                  );
                  continue; // Ya se procesó todo en el servicio
                }
              } catch (error) {
                logger.warn(`⚠️ Error en selección inteligente, usando aleatoria:`, error.message);
              }
            }

            // Selección aleatoria (sin tickets o si falló la inteligente)
            // Aplicar filtro de items no usados hoy
            const usedItemsToday = await this.getUsedItemsToday(draw.gameId, draw.drawDate);
            let availableItems = items.filter(item => !usedItemsToday.has(item.id));
            
            if (availableItems.length === 0) {
              logger.warn(`⚠️ No hay items disponibles que no hayan sido usados hoy, usando cualquiera...`);
              availableItems = items;
            }

            const randomIndex = Math.floor(Math.random() * availableItems.length);
            selectedItem = availableItems[randomIndex];
            selectionMethod = 'random';
          }

          // Actualizar sorteo
          const updatedDraw = await prisma.draw.update({
            where: { id: draw.id },
            data: {
              status: 'CLOSED',
              preselectedItemId: selectedItem.id,
              closedAt: new Date()
            },
            include: {
              game: true,
              preselectedItem: true
            }
          });

          logger.info(
            `🔒 Sorteo cerrado: ${draw.game.name} - ${draw.drawTime} ` +
            `| Preselección aleatoria: ${selectedItem.number} - ${selectedItem.name}`
          );

          // Emitir evento WebSocket
          emitToAll('draw:closed', {
            drawId: updatedDraw.id,
            game: { name: updatedDraw.game.name, slug: updatedDraw.game.slug },
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            preselectedItem: { number: selectedItem.number, name: selectedItem.name }
          });

          emitToGame(updatedDraw.game.slug, 'draw:closed', {
            drawId: updatedDraw.id,
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            preselectedItem: { number: selectedItem.number, name: selectedItem.name }
          });

          // Registrar en audit log
          await prisma.auditLog.create({
            data: {
              action: 'DRAW_CLOSED',
              entity: 'Draw',
              entityId: draw.id,
              changes: {
                status: 'CLOSED',
                preselectedItemId: selectedItem.id,
                preselectedNumber: selectedItem.number,
                preselectedName: selectedItem.name
              }
            }
          });

          // Generar PDF de cierre (sin ventas)
          try {
            pdfPath = await pdfReportService.generateDrawClosingReport({
              drawId: draw.id,
              game: updatedDraw.game,
              drawDate: updatedDraw.drawDate,
              drawTime: updatedDraw.drawTime,
              prewinnerItem: selectedItem,
              totalSales: 0,
              maxPayout: 0,
              potentialPayout: 0,
              allItems: items,
              salesByItem: {},
              candidates: []
            });
            logger.info(`  📄 PDF generado: ${pdfPath}`);
          } catch (pdfError) {
            logger.warn(`⚠️ Error generando PDF:`, pdfError.message);
          }

          // Enviar notificación a administradores por Telegram con PDF
          try {
            await adminNotificationService.notifyPrewinnerSelected({
              drawId: updatedDraw.id,
              game: updatedDraw.game,
              drawDate: updatedDraw.drawDate,
              drawTime: updatedDraw.drawTime,
              prewinnerItem: updatedDraw.preselectedItem,
              totalSales: 0,
              maxPayout: 0,
              potentialPayout: 0,
              salesByItem: null,
              pdfPath
            });
          } catch (notifyError) {
            logger.warn(`⚠️ Error al notificar cierre de sorteo:`, notifyError.message);
          }
        } catch (error) {
          logger.error(`Error al cerrar sorteo ${draw.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error en CloseDrawJob:', error);
    }
  }

  /**
   * Obtener IDs de items ya usados hoy (pre-seleccionados o ganadores)
   * Esto evita que un mismo item gane más de una vez en el mismo día
   */
  async getUsedItemsToday(gameId, referenceDate) {
    const today = startOfDay(referenceDate);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: referenceDate,
        OR: [
          { preselectedItemId: { not: null } },
          { winnerItemId: { not: null } }
        ]
      },
      select: {
        preselectedItemId: true,
        winnerItemId: true
      }
    });

    const usedItems = new Set();
    for (const draw of drawsToday) {
      if (draw.preselectedItemId) {
        usedItems.add(draw.preselectedItemId);
      }
      if (draw.winnerItemId) {
        usedItems.add(draw.winnerItemId);
      }
    }

    logger.debug(`  Items usados hoy para juego ${gameId}: ${usedItems.size} items`);
    return usedItems;
  }
}

export default new CloseDrawJob();
