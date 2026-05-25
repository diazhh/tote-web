import { Cron } from 'croner';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import drawPauseService from '../services/draw-pause.service.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import adminNotificationService from '../services/admin-notification.service.js';
import prizeProcessorService from '../services/prize-processor.service.js';
import drawStatsService from '../services/draw-stats.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { getVenezuelaTimeString, getVenezuelaDateAsUTC } from '../lib/dateUtils.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

/**
 * Safety net: if draw is CLOSED without a preselect (pg-boss preselect didn't run,
 * crashed, or sweep skipped), run selectPrewinner inline before processing.
 * Idempotent: re-reads the draw after the call and returns the fresh row. On
 * failure, returns the input unchanged (caller's existing fallback handles
 * missing preselect).
 *
 * @param {object} draw - draw row with at least { id, status, preselectedItemId }
 * @returns {Promise<object>} fresh draw row or the input if no recovery needed
 */
export async function recoverPreselectIfMissing(draw) {
  if (draw.status !== 'CLOSED' || draw.preselectedItemId) {
    return draw;
  }
  logger.warn(`[execute-draw] ⚠️ Recovery inline: ${draw.id} CLOSED sin preselect, ejecutando selectPrewinner`);
  try {
    await prewinnerSelectionService.selectPrewinner(draw.id);
    const fresh = await prisma.draw.findUnique({
      where: { id: draw.id },
      include: { game: true, preselectedItem: true },
    });
    return fresh || draw;
  } catch (err) {
    logger.error(`[execute-draw] Recovery falló para ${draw.id}: ${err.message}`);
    return draw;
  }
}

/**
 * Job para ejecutar sorteos en su hora programada
 * Se ejecuta cada minuto
 */
class ExecuteDrawJob {
  constructor() {
    this.cronExpression = '* * * * *'; // Cada minuto
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = new Cron(this.cronExpression, { 
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en ExecuteDraws job:', error);
      }
    }, async () => {
      await this.execute();
    });

    logger.info('✅ Job ExecuteDraws iniciado (cada minuto, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job ExecuteDraws detenido');
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
        return;
      }

      // Obtener fecha y hora actual en Venezuela
      const venezuelaTime = getVenezuelaTimeString(); // HH:MM:SS
      const venezuelaDate = getVenezuelaDateAsUTC(); // Date object para DB

      // Log cada ejecución para monitoreo
      logger.info(`[ExecuteDraws] Ejecutando - VE Time: ${venezuelaTime}, VE Date: ${venezuelaDate.toISOString()}`);

      // Buscar sorteos que deben ejecutarse (hora programada ya pasó)
      // Usar drawDate y drawTime (hora Venezuela directa)
      // Excluir TERMINAL: se ejecutan en cascada al ejecutar el sorteo Triple vinculado
      const drawsToExecute = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          drawDate: venezuelaDate,
          drawTime: {
            lte: venezuelaTime
          },
          game: {
            type: { not: 'TERMINAL' }
          }
        },
        include: {
          game: true,
          preselectedItem: true
        }
      });

      if (drawsToExecute.length === 0) {
        // No hay Triples por ejecutar, pero igual escanear TERMINAL huérfanos
        // (caso: backend murió entre Triple draw y cascada → TERMINAL queda CLOSED).
        // Ver incidente 2026-05-10.
        await this.recoverOrphanTerminalDraws();
        return;
      }

      // Filtrar sorteos cuyo juego está pausado
      const filteredDraws = [];
      for (const draw of drawsToExecute) {
        const isPaused = await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate);
        if (isPaused) {
          logger.warn(`⏸️ Sorteo ${draw.game.name} - ${draw.drawTime} NO EJECUTADO: juego pausado`);
          continue;
        }
        filteredDraws.push(draw);
      }

      if (filteredDraws.length === 0) {
        return;
      }

      const drawsToExecuteFiltered = filteredDraws;
      logger.info(`🎲 ${drawsToExecuteFiltered.length} sorteo(s) para ejecutar...`);

      // Si pg-boss está habilitado, encolar todos los draws en paralelo
      if (process.env.PGBOSS_EXECUTE_DRAW === 'true') {
        const boss = getBoss();
        await Promise.all(drawsToExecuteFiltered.map(draw =>
          boss.send(QUEUES.EXECUTE_DRAW, { drawId: draw.id }, {
            singletonKey: `exec-${draw.id}`,
            ...QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW],
          }).then(() => logger.info(`[execute-draw] Draw ${draw.id} encolado en pg-boss`))
        ));
        return;
      }

      // Legacy: ejecución directa sin reintentos
      for (const originalDraw of drawsToExecuteFiltered) {
        try {
          // Safety net: if pg-boss preselect didn't run (worker down, crash, etc.),
          // recover inline before reading preselectedItemId. If recovery fails,
          // the existing `if (!winnerItemId) { continue; }` guard catches it.
          const draw = await recoverPreselectIfMissing(originalDraw);

          // El número ganador es el preseleccionado (puede haber sido cambiado manualmente)
          const winnerItemId = draw.preselectedItemId;

          if (!winnerItemId) {
            logger.error(`Sorteo ${draw.id} no tiene número preseleccionado`);
            continue;
          }

          // Actualizar sorteo a DRAWN
          const updatedDraw = await prisma.draw.update({
            where: { id: draw.id },
            data: {
              status: 'DRAWN',
              winnerItemId: winnerItemId,
              drawnAt: new Date()
            },
            include: {
              game: true,
              winnerItem: true
            }
          });

          logger.info(
            `🎲 Sorteo ejecutado: ${draw.game.name} - ${draw.drawTime} ` +
            `| Ganador: ${updatedDraw.winnerItem.number} - ${updatedDraw.winnerItem.name}`
          );

          // Emitir evento WebSocket
          emitToAll('draw:executed', {
            drawId: updatedDraw.id,
            game: {
              name: updatedDraw.game.name,
              slug: updatedDraw.game.slug
            },
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            winnerItem: {
              number: updatedDraw.winnerItem.number,
              name: updatedDraw.winnerItem.name
            }
          });

          emitToGame(updatedDraw.game.slug, 'draw:executed', {
            drawId: updatedDraw.id,
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            winnerItem: {
              number: updatedDraw.winnerItem.number,
              name: updatedDraw.winnerItem.name
            }
          });

          // Registrar en audit log
          await prisma.auditLog.create({
            data: {
              action: 'DRAW_EXECUTED',
              entity: 'Draw',
              entityId: draw.id,
              changes: {
                status: 'DRAWN',
                winnerItemId: winnerItemId,
                winnerNumber: updatedDraw.winnerItem.number,
                winnerName: updatedDraw.winnerItem.name
              }
            }
          });

          // Generar imagen del sorteo
          let imagePath = null;
          try {
            const { generateDrawImage } = await import('../services/imageService.js');
            const imageResult = await generateDrawImage(updatedDraw.id);
            // Construir ruta local del archivo para enviar por Telegram
            if (imageResult && imageResult.filename) {
              imagePath = `./storage/results/${imageResult.filename}`;
            }
            logger.info(`✅ Imagen generada para sorteo ${updatedDraw.id}: ${imagePath}`);
          } catch (imageError) {
            logger.error(`❌ Error generando imagen para sorteo ${updatedDraw.id}:`, imageError);
            await prisma.draw.update({
              where: { id: updatedDraw.id },
              data: {
                imageError: imageError.message
              }
            });
          }

          // Notificar a administradores (con imagen)
          try {
            const stats = await this.calculateDrawStats(updatedDraw);
            await adminNotificationService.notifyDrawResult({
              drawId: updatedDraw.id,
              game: updatedDraw.game,
              drawDate: updatedDraw.drawDate,
              drawTime: updatedDraw.drawTime,
              winnerItem: updatedDraw.winnerItem,
              totalSales: stats.totalSales,
              totalPayout: stats.totalPayout,
              profit: stats.profit,
              dailyStats: stats.daily,
              weeklyStats: stats.weekly,
              monthlyStats: stats.monthly,
              imagePath // Ruta local del archivo
            });
            logger.info(`📱 Notificación enviada a administradores para sorteo ${updatedDraw.id}`);
          } catch (notifyError) {
            logger.error(`❌ Error notificando administradores para sorteo ${updatedDraw.id}:`, notifyError);
          }

          // Publicar en redes sociales
          try {
            logger.info(`📢 Publicando sorteo ${updatedDraw.id} en canales...`);
            const publicationService = (await import('../services/publication.service.js')).default;
            const publicationResult = await publicationService.publishDraw(updatedDraw.id);

            if (publicationResult.success) {
              const successCount = publicationResult.results.filter(r => r.success).length;
              const totalCount = publicationResult.results.length;
              logger.info(
                `✅ Sorteo publicado en ${successCount}/${totalCount} canales para ${updatedDraw.game.name} - ${updatedDraw.drawTime}`
              );
            }
          } catch (publishError) {
            logger.error(`❌ Error publicando sorteo ${updatedDraw.id}:`, publishError);
          }

          // Totalizar premios: calcular ganadores/perdedores y actualizar tickets
          try {
            logger.info(`💰 Totalizando premios para sorteo ${updatedDraw.id}...`);
            const prizeResult = await prizeProcessorService.processPrizesForDraw(updatedDraw.id);
            logger.info(
              `✅ Premios totalizados: ${prizeResult.winnersCount} ganadores, ` +
              `${prizeResult.losersCount} perdedores, ` +
              `$${prizeResult.totalPrizesAwarded.toFixed(2)} en premios`
            );
          } catch (prizeError) {
            logger.error(`❌ Error totalizando premios para sorteo ${updatedDraw.id}:`, prizeError);
          }

          // Calcular y persistir estadísticas del sorteo y proveedores
          try {
            logger.info(`📊 Calculando estadísticas para sorteo ${updatedDraw.id}...`);
            await drawStatsService.calculateAllStats(updatedDraw.id);
            logger.info(`✅ Estadísticas calculadas y guardadas para sorteo ${updatedDraw.id}`);
          } catch (statsError) {
            logger.error(`❌ Error calculando estadísticas para sorteo ${updatedDraw.id}:`, statsError);
          }

          // Cascada TERMINAL: si este juego tiene linkedGames de tipo TERMINAL,
          // ejecutar sus sorteos con ganador = últimos 2 dígitos del Triple
          try {
            await this.cascadeTerminalDraws(updatedDraw);
          } catch (terminalError) {
            logger.error(`❌ Error cascada Terminal para sorteo ${updatedDraw.id}:`, terminalError);
          }
        } catch (error) {
          logger.error(`Error al ejecutar sorteo ${draw.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error en ExecuteDrawJob:', error);
    }
  }

  /**
   * Calcular estadísticas del sorteo (ventas, pagos, ganancias)
   * @param {object} draw - Sorteo con game y winnerItem incluidos
   * @returns {Promise<object>} - Estadísticas calculadas
   */
  async calculateDrawStats(draw) {
    const now = new Date();
    const gameId = draw.gameId;

    // Obtener tickets del sorteo actual (todos los orígenes)
    const currentDrawTickets = await prisma.ticket.findMany({
      where: {
        drawId: draw.id
      },
      include: {
        details: true
      }
    });

    const totalSales = currentDrawTickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
    
    // Calcular pago del sorteo actual
    let winnerSales = 0;
    currentDrawTickets.forEach(ticket => {
      ticket.details.forEach(detail => {
        if (detail.gameItemId === draw.winnerItemId) {
          winnerSales += parseFloat(detail.amount);
        }
      });
    });
    
    const multiplier = parseFloat(draw.winnerItem?.multiplier || 30);
    const totalPayout = winnerSales * multiplier;
    const profit = totalSales - totalPayout;

    // Estadísticas diarias
    const daily = await this.getPeriodStats(gameId, startOfDay(now), endOfDay(now));
    
    // Estadísticas semanales (lunes a domingo)
    const weekly = await this.getPeriodStats(gameId, startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
    
    // Estadísticas mensuales
    const monthly = await this.getPeriodStats(gameId, startOfMonth(now), endOfMonth(now));

    return {
      totalSales,
      totalPayout,
      profit,
      daily,
      weekly,
      monthly
    };
  }

  /**
   * Cascada Terminal: cuando un sorteo Triple se ejecuta, buscar sorteos Terminal
   * vinculados (misma fecha/hora) y ejecutarlos con ganador = últimos 2 dígitos
   */
  async cascadeTerminalDraws(tripleDraw) {
    // Buscar juegos TERMINAL vinculados a este juego
    const terminalGames = await prisma.game.findMany({
      where: { linkedGameId: tripleDraw.gameId, type: 'TERMINAL', isActive: true }
    });

    if (terminalGames.length === 0) return;

    const tripleWinnerNumber = tripleDraw.winnerItem.number; // e.g. "123"
    const terminalNumber = tripleWinnerNumber.slice(-2); // e.g. "23"

    for (const terminalGame of terminalGames) {
      // Buscar sorteo Terminal para misma fecha/hora (SCHEDULED o CLOSED)
      const terminalDraw = await prisma.draw.findFirst({
        where: {
          gameId: terminalGame.id,
          drawDate: tripleDraw.drawDate,
          drawTime: tripleDraw.drawTime,
          status: { in: ['SCHEDULED', 'CLOSED'] }
        }
      });

      if (!terminalDraw) {
        logger.warn(`[Terminal] No se encontró sorteo Terminal para ${terminalGame.name} ${tripleDraw.drawTime}`);
        continue;
      }

      // Buscar el GameItem que corresponde al número terminal
      const winnerItem = await prisma.gameItem.findUnique({
        where: { gameId_number: { gameId: terminalGame.id, number: terminalNumber } }
      });

      if (!winnerItem) {
        logger.error(`[Terminal] GameItem ${terminalNumber} no encontrado para ${terminalGame.name}`);
        continue;
      }

      // Ejecutar el sorteo Terminal directamente a DRAWN
      const updatedTerminal = await prisma.draw.update({
        where: { id: terminalDraw.id },
        data: {
          status: 'DRAWN',
          preselectedItemId: winnerItem.id,
          winnerItemId: winnerItem.id,
          closedAt: new Date(),
          drawnAt: new Date()
        },
        include: { game: true, winnerItem: true }
      });

      logger.info(
        `🎰 Terminal ejecutado: ${terminalGame.name} - ${tripleDraw.drawTime} ` +
        `| Ganador: ${terminalNumber} (de Triple ${tripleWinnerNumber})`
      );

      // Emitir WebSocket
      emitToAll('draw:executed', {
        drawId: updatedTerminal.id,
        game: { name: updatedTerminal.game.name, slug: updatedTerminal.game.slug },
        drawDate: updatedTerminal.drawDate,
        drawTime: updatedTerminal.drawTime,
        winnerItem: { number: updatedTerminal.winnerItem.number, name: updatedTerminal.winnerItem.name }
      });

      emitToGame(updatedTerminal.game.slug, 'draw:executed', {
        drawId: updatedTerminal.id,
        drawDate: updatedTerminal.drawDate,
        drawTime: updatedTerminal.drawTime,
        winnerItem: { number: updatedTerminal.winnerItem.number, name: updatedTerminal.winnerItem.name }
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: 'DRAW_EXECUTED',
          entity: 'Draw',
          entityId: updatedTerminal.id,
          changes: {
            status: 'DRAWN',
            winnerItemId: winnerItem.id,
            winnerNumber: terminalNumber,
            sourceTripleDrawId: tripleDraw.id,
            sourceTripleNumber: tripleWinnerNumber
          }
        }
      });

      // Totalizar premios Terminal
      let terminalPrizeResult = null;
      try {
        terminalPrizeResult = await prizeProcessorService.processPrizesForDraw(updatedTerminal.id);
        logger.info(
          `💰 Premios Terminal: ${terminalPrizeResult.winnersCount} ganadores, ` +
          `$${terminalPrizeResult.totalPrizesAwarded.toFixed(2)} en premios`
        );
      } catch (prizeError) {
        logger.error(`❌ Error premios Terminal ${updatedTerminal.id}:`, prizeError);
      }

      // Notificar resultado Terminal a administradores (sin imagen, Terminal no tiene plantilla)
      try {
        const terminalStats = await this.calculateDrawStats(updatedTerminal);
        await adminNotificationService.notifyDrawResult({
          drawId: updatedTerminal.id,
          game: updatedTerminal.game,
          drawDate: updatedTerminal.drawDate,
          drawTime: updatedTerminal.drawTime,
          winnerItem: updatedTerminal.winnerItem,
          totalSales: terminalStats.totalSales,
          totalPayout: terminalStats.totalPayout,
          profit: terminalStats.profit,
          dailyStats: terminalStats.daily,
          weeklyStats: terminalStats.weekly,
          monthlyStats: terminalStats.monthly,
          isTerminal: true,
          sourceTripleNumber: tripleWinnerNumber
        });
        logger.info(`📱 Notificacion Terminal enviada a administradores`);
      } catch (notifyError) {
        logger.error(`❌ Error notificando Terminal ${updatedTerminal.id}:`, notifyError);
      }

      // Calcular estadísticas Terminal
      try {
        await drawStatsService.calculateAllStats(updatedTerminal.id);
        logger.info(`📊 Estadísticas Terminal calculadas para ${updatedTerminal.id}`);
      } catch (statsError) {
        logger.error(`❌ Error estadísticas Terminal ${updatedTerminal.id}:`, statsError);
      }
    }
  }

  /**
   * Recuperar TERMINAL huérfanos: sorteos TERMINAL en CLOSED cuyo Triple
   * vinculado ya está DRAWN. Pasa cuando el backend murió entre el draw
   * del Triple y la cascada (incidente 2026-05-10: SIGKILL PM2 1G).
   * Idempotente — si TERMINAL ya está DRAWN, cascadeTerminalDraws lo salta.
   * Bound a drawDate=hoy (Venezuela) para no resucitar sorteos viejos.
   */
  async recoverOrphanTerminalDraws() {
    try {
      const venezuelaDate = getVenezuelaDateAsUTC();
      const orphanTerminals = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          drawDate: venezuelaDate,
          game: { type: 'TERMINAL', isActive: true }
        },
        include: { game: true },
        take: 50 // safety cap
      });

      if (orphanTerminals.length === 0) return;

      // Agrupar por Triple draw (linkedGameId + drawDate + drawTime)
      const tripleKeys = new Map();
      for (const t of orphanTerminals) {
        const tripleGameId = t.game.linkedGameId;
        if (!tripleGameId) continue;
        const key = `${tripleGameId}|${t.drawDate.toISOString()}|${t.drawTime}`;
        if (!tripleKeys.has(key)) {
          tripleKeys.set(key, { tripleGameId, drawDate: t.drawDate, drawTime: t.drawTime });
        }
      }

      for (const { tripleGameId, drawDate, drawTime } of tripleKeys.values()) {
        const tripleDraw = await prisma.draw.findFirst({
          where: { gameId: tripleGameId, drawDate, drawTime, status: 'DRAWN' },
          include: { winnerItem: true }
        });
        if (!tripleDraw || !tripleDraw.winnerItem) continue;

        logger.warn(`[recover-orphan-terminals] Disparando cascada para Triple ${tripleDraw.id} (${drawTime})`);
        try {
          await this.cascadeTerminalDraws(tripleDraw);
        } catch (err) {
          logger.error(`[recover-orphan-terminals] Error en cascada Triple ${tripleDraw.id}:`, err);
        }
      }
    } catch (err) {
      logger.error('[recover-orphan-terminals] Error en escaneo:', err);
    }
  }

  /**
   * Obtener estadísticas de un período
   * @param {string} gameId - ID del juego
   * @param {Date} startDate - Fecha inicio
   * @param {Date} endDate - Fecha fin
   * @returns {Promise<object>} - { sales, payouts, profit }
   */
  async getPeriodStats(gameId, startDate, endDate) {
    try {
      // Obtener todos los sorteos del período que ya fueron ejecutados
      const draws = await prisma.draw.findMany({
        where: {
          gameId,
          drawDate: { gte: startDate, lte: endDate },
          status: 'DRAWN'
        },
        select: { id: true, winnerItemId: true, winnerItem: { select: { multiplier: true } } }
      });

      if (draws.length === 0) return { sales: 0, payouts: 0, profit: 0 };

      // Atribución por TicketDetail.drawId — corrige bug multi-sorteo donde
      // un ticket con apuestas en N sorteos sólo contribuía a `Ticket.drawId`.
      const drawIds = draws.map(d => d.id);
      const details = await prisma.ticketDetail.findMany({
        where: {
          drawId: { in: drawIds },
          ticket: { status: { not: 'CANCELLED' } }
        },
        select: { drawId: true, gameItemId: true, amount: true }
      });

      // Index: drawId → { sales, winnerSales }
      const byDraw = new Map();
      const winnerByDraw = new Map();
      for (const d of draws) winnerByDraw.set(d.id, d.winnerItemId);

      for (const detail of details) {
        const amount = parseFloat(detail.amount);
        let entry = byDraw.get(detail.drawId);
        if (!entry) {
          entry = { sales: 0, winnerSales: 0 };
          byDraw.set(detail.drawId, entry);
        }
        entry.sales += amount;
        if (winnerByDraw.get(detail.drawId) === detail.gameItemId) {
          entry.winnerSales += amount;
        }
      }

      let sales = 0;
      let payouts = 0;
      for (const draw of draws) {
        const entry = byDraw.get(draw.id) || { sales: 0, winnerSales: 0 };
        sales += entry.sales;
        if (draw.winnerItemId && draw.winnerItem) {
          const multiplier = parseFloat(draw.winnerItem.multiplier || 30);
          payouts += entry.winnerSales * multiplier;
        }
      }

      return { sales, payouts, profit: sales - payouts };
    } catch (error) {
      logger.error('Error calculando estadísticas del período:', error);
      return { sales: 0, payouts: 0, profit: 0 };
    }
  }
}

export default new ExecuteDrawJob();
