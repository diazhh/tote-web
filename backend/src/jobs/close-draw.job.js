import { Cron } from 'croner';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import drawPauseService from '../services/draw-pause.service.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import apiIntegrationService from '../services/api-integration.service.js';
import adminNotificationService from '../services/admin-notification.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import betSimulatorService from '../services/bet-simulator.service.js';
import { startOfDay } from 'date-fns';
import { getVenezuelaDateString, getVenezuelaTimeString, getVenezuelaDateAsUTC, addMinutesToTime } from '../lib/dateUtils.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

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
    this.task = new Cron(this.cronExpression, { 
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en CloseDraws job:', error);
      }
    }, async () => {
      await this.execute();
    });

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

      // Normalizar a :00 segundos antes de calcular target (evita mismatch por segundos del cron)
      const venezuelaTimeNormalized = venezuelaTime.substring(0, 5) + ':00'; // "HH:MM:00"
      const targetDrawTime = addMinutesToTime(venezuelaTimeNormalized, 5);  // "HH:MM:00" exacto
      const targetDrawTimeNext = addMinutesToTime(venezuelaTimeNormalized, 6); // límite superior

      // Log cada ejecución para monitoreo
      logger.info(`[CloseDraws] Ejecutando - VE Time: ${venezuelaTime}, VE Date: ${venezuelaDate.toISOString()}, Target: ${targetDrawTime}`);

      // Buscar sorteos que deben cerrarse (5 minutos antes)
      // Usar rango en lugar de match exacto para tolerar segundos del cron
      const drawsToClose = await prisma.draw.findMany({
        where: {
          status: 'SCHEDULED',
          drawDate: venezuelaDate,
          drawTime: {
            gte: targetDrawTime,
            lt: targetDrawTimeNext
          }
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

      // Filtrar sorteos cuyo juego está pausado
      const filteredDraws = [];
      for (const draw of drawsToClose) {
        const isPaused = await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate);
        if (isPaused) {
          logger.warn(`⏸️ Sorteo ${draw.game.name} - ${draw.drawTime} OMITIDO: juego pausado`);
          continue;
        }
        filteredDraws.push(draw);
      }

      if (filteredDraws.length === 0) {
        return;
      }

      const drawsToCloseFiltered = filteredDraws;
      logger.info(`🔒 ${drawsToCloseFiltered.length} sorteo(s) para cerrar...`);

      // Si pg-boss está habilitado, encolar todos los draws en paralelo
      if (process.env.PGBOSS_CLOSE_DRAW === 'true') {
        const boss = getBoss();
        await Promise.all(drawsToCloseFiltered.map(draw =>
          boss.send(QUEUES.CLOSE_DRAW, { drawId: draw.id }, {
            singletonKey: `close-${draw.id}`,
            ...QUEUE_CONFIGS[QUEUES.CLOSE_DRAW],
          }).then(() => logger.info(`[close-draw] Draw ${draw.id} encolado en pg-boss`))
        ));
        return;
      }

      // Legacy: ejecución directa sin reintentos
      for (const draw of drawsToCloseFiltered) {
        try {
          // TERMINAL: solo cerrar e importar ventas. El ganador lo determina la cascada del Triple.
          if (draw.game.type === 'TERMINAL') {
            // Importar ventas de Terminal desde SRQ
            let terminalTickets = 0;
            try {
              logger.info(`📥 Importando ventas externas Terminal para sorteo ${draw.id}...`);
              const importResult = await apiIntegrationService.importSRQTickets(draw.id);
              terminalTickets = importResult.imported;
              logger.info(`✅ Ventas Terminal importadas: ${importResult.imported} tickets`);
            } catch (error) {
              logger.warn(`⚠️ No se pudieron importar ventas Terminal para sorteo ${draw.id}:`, error.message);
            }

            // Cerrar sin pre-ganador
            const updatedTerminal = await prisma.draw.update({
              where: { id: draw.id },
              data: { status: 'CLOSED', closedAt: new Date() },
              include: { game: true }
            });

            logger.info(`🔒 Sorteo cerrado: ${draw.game.name} - ${draw.drawTime} | Terminal (ganador viene del Triple) | ${terminalTickets} tickets`);

            // Emitir evento WebSocket
            emitToAll('draw:closed', {
              drawId: updatedTerminal.id,
              game: { name: updatedTerminal.game.name, slug: updatedTerminal.game.slug },
              drawDate: updatedTerminal.drawDate,
              drawTime: updatedTerminal.drawTime
            });

            // Notificar a admins del cierre Terminal con ventas
            try {
              await adminNotificationService.notifyPrewinnerSelected({
                drawId: updatedTerminal.id,
                game: updatedTerminal.game,
                drawDate: updatedTerminal.drawDate,
                drawTime: updatedTerminal.drawTime,
                prewinnerItem: null,
                totalSales: 0,
                maxPayout: 0,
                potentialPayout: 0,
                salesByItem: null,
                tripletaRiskTop5: [],
                isTerminal: true,
                terminalTickets
              });
            } catch (notifyError) {
              logger.warn(`⚠️ Error notificando cierre Terminal:`, notifyError.message);
            }

            // Audit log
            await prisma.auditLog.create({
              data: {
                action: 'DRAW_CLOSED',
                entity: 'Draw',
                entityId: draw.id,
                changes: { status: 'CLOSED', type: 'TERMINAL', terminalTickets }
              }
            });

            continue;
          }

          const items = draw.game.items;

          if (items.length === 0) {
            logger.error(`No hay items activos para el juego ${draw.game.name}`);
            continue;
          }

          let selectedItem;
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
            try {
              logger.info(`📥 Importando ventas externas para sorteo ${draw.id}...`);
              const importResult = await apiIntegrationService.importSRQTickets(draw.id);
              logger.info(
                `✅ Ventas importadas: ${importResult.imported} tickets guardados, ${importResult.skipped} saltados`
              );
            } catch (error) {
              logger.warn(`⚠️ No se pudieron importar ventas para sorteo ${draw.id}:`, error.message);
            }

            // hasTickets debe basarse en conteo REAL de DB, no solo en lo recién
            // importado. Si el sync periódico (Maxplay, online, webhooks, SRQ previo)
            // ya pobló la DB, importResult.imported puede ser 0 aunque sí haya
            // tickets — y entonces caeríamos al fallback aleatorio sin necesidad.
            const ticketCount = await prisma.ticket.count({
              where: { drawId: draw.id, status: { not: 'CANCELLED' } }
            });
            const hasTickets = ticketCount > 0;
            logger.info(`  📊 Tickets en DB: ${ticketCount} → ${hasTickets ? 'optimizer' : 'aleatoria'}`);

            // Si hay tickets, usar el servicio de selección inteligente
            if (hasTickets) {
              try {
                // Timeout 15s: si el optimizer cuelga (lock DB, query lenta,
                // bug interno) se aborta y caemos al fallback aleatorio en
                // vez de bloquear el cron entero. El sorteo SE CIERRA igual.
                selectedItem = await Promise.race([
                  prewinnerSelectionService.selectPrewinner(draw.id),
                  new Promise((_, rej) => setTimeout(
                    () => rej(new Error('selectPrewinner timeout 15s')),
                    15000
                  ))
                ]);
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
                // Loguear stack completo para diagnóstico — no solo message
                logger.warn(
                  `⚠️ Error en selección inteligente para draw ${draw.id}: ${error.message}`,
                  { stack: error.stack }
                );

                // DEFENSIVO: el optimizer puede haber persistido el pre-ganador
                // ANTES del timeout/error (el persist ocurre al inicio de
                // _selectPrewinnerInner, antes del PDF y notificaciones que son
                // lo que típicamente lo hacen demorar). Si ya quedó persistido,
                // respetarlo y NO sobreescribir con fallback aleatorio — esa
                // sobreescritura fue la causa del incidente del 2026-05-11
                // (TRIPLE PANTERA 08:00, número 100, pérdida ~153K).
                const current = await prisma.draw.findUnique({
                  where: { id: draw.id },
                  select: {
                    status: true,
                    preselectedItemId: true,
                    preselectedItem: true
                  }
                });
                if (current?.status === 'CLOSED' && current.preselectedItemId) {
                  logger.info(
                    `  ✅ Optimizer ya persistió ${current.preselectedItem.number} ` +
                    `antes del error/timeout — respetando selección inteligente`
                  );
                  emitToAll('draw:closed', {
                    drawId: draw.id,
                    game: { name: draw.game.name, slug: draw.game.slug },
                    drawDate: draw.drawDate,
                    drawTime: draw.drawTime,
                    preselectedItem: {
                      number: current.preselectedItem.number,
                      name: current.preselectedItem.name
                    }
                  });
                  emitToGame(draw.game.slug, 'draw:closed', {
                    drawId: draw.id,
                    drawDate: draw.drawDate,
                    drawTime: draw.drawTime,
                    preselectedItem: {
                      number: current.preselectedItem.number,
                      name: current.preselectedItem.name
                    }
                  });
                  logger.info(
                    `🔒 Sorteo cerrado: ${draw.game.name} - ${draw.drawTime} ` +
                    `| Preselección inteligente (recuperada): ${current.preselectedItem.number} - ${current.preselectedItem.name}`
                  );
                  continue;
                }
                logger.warn(`  ↪ cayendo a selección aleatoria`);
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

          // Actualizar sorteo con guard atómico: solo cerrar si sigue SCHEDULED.
          // Esto previene sobreescritura si otro flujo (selectPrewinner del
          // optimizer, otra invocación del cron, force-totalize) ya lo cerró.
          const writeResult = await prisma.draw.updateMany({
            where: { id: draw.id, status: 'SCHEDULED' },
            data: {
              status: 'CLOSED',
              preselectedItemId: selectedItem.id,
              closedAt: new Date()
            }
          });

          if (writeResult.count === 0) {
            // Otro proceso ya cerró este sorteo — releer y respetar
            const existing = await prisma.draw.findUnique({
              where: { id: draw.id },
              include: { game: true, preselectedItem: true }
            });
            logger.info(
              `  ↪ Sorteo ya cerrado por otro flujo con ` +
              `${existing?.preselectedItem?.number || '?'} — saltando aleatoria`
            );
            continue;
          }

          const updatedDraw = await prisma.draw.findUnique({
            where: { id: draw.id },
            include: { game: true, preselectedItem: true }
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

          // Calcular top 5 de riesgo de tripletas
          let tripletaRiskTop5 = [];
          try {
            tripletaRiskTop5 = await prewinnerSelectionService.calculateTripletaRiskTop5(draw.gameId, draw.id);
          } catch (tripletaError) {
            logger.warn(`⚠️ Error calculando riesgo de tripletas:`, tripletaError.message);
          }

          // Enviar notificación a administradores por Telegram (solo texto;
          // el PDF adjunto se eliminó — ver spec 2026-05-11-eliminar-pdf-cierre-sorteo-design.md)
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
              tripletaRiskTop5
            });
          } catch (notifyError) {
            logger.warn(`⚠️ Error al notificar cierre de sorteo:`, notifyError.message);
          }
        } catch (error) {
          logger.error(`Error al cerrar sorteo ${draw.id}:`, error);
        }
      }

      // ============================================================
      // RED DE SEGURIDAD — recovery de draws "stuck"
      // ============================================================
      // Captura cualquier draw en la ventana actual que quedó en SCHEDULED
      // pero ya tiene preselectedItemId (race condition entre preselect del
      // admin y el cron, optimizer abortado, error silencioso, etc.).
      // Sin esto, el cron execute-draw nunca lo procesaría porque filtra
      // por status=CLOSED. Como este job corre cada minuto, recovery
      // automático en máximo 60s tras detectar el estado inconsistente.
      try {
        const stuck = await prisma.draw.findMany({
          where: {
            status: 'SCHEDULED',
            preselectedItemId: { not: null },
            drawDate: venezuelaDate,
            drawTime: { gte: targetDrawTime, lt: targetDrawTimeNext }
          },
          include: { game: { select: { name: true, slug: true } } }
        });

        for (const draw of stuck) {
          logger.warn(
            `⚠️ Draw ${draw.game.name} ${draw.drawTime} (${draw.id}) ` +
            `quedó SCHEDULED con preselectedItemId set — forzando CLOSED (red de seguridad)`
          );
          const updated = await prisma.draw.updateMany({
            where: { id: draw.id, status: 'SCHEDULED' },
            data: { status: 'CLOSED', closedAt: new Date() }
          });
          if (updated.count > 0) {
            emitToAll('draw:closed', {
              drawId: draw.id,
              game: { name: draw.game.name, slug: draw.game.slug },
              drawDate: draw.drawDate,
              drawTime: draw.drawTime,
              recovered: true
            });
            await prisma.auditLog.create({
              data: {
                action: 'DRAW_CLOSED_RECOVERY',
                entity: 'Draw',
                entityId: draw.id,
                changes: { reason: 'stuck_in_scheduled_with_preselect', forcedBy: 'close-draw-safety-net' }
              }
            }).catch(() => { /* audit best-effort */ });
          }
        }
      } catch (safetyError) {
        logger.error('❌ Error en red de seguridad close-draw:', safetyError);
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
