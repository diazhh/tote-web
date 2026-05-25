import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import adminNotificationService from './admin-notification.service.js';
import { startOfDay, differenceInDays } from 'date-fns';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';
import prewinnerOptimizerService from './prewinner-optimizer.service.js';
import { withDrawLock } from '../lib/drawLock.js';
import { loadDrawTicketDetails, sumDetailsAmount } from '../lib/drawDetailsLoader.js';

/**
 * Servicio para selección de pre-ganadores
 * 
 * Utiliza el PrewinnerOptimizerService para la selección inteligente
 * y se encarga de:
 * - Actualizar el sorteo con el item seleccionado
 * - Generar PDFs de reporte
 * - Enviar notificaciones a administradores
 */
class PrewinnerSelectionService {
  /**
   * Seleccionar pre-ganador para un sorteo
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<Object|null>} - GameItem seleccionado o null
   */
  async selectPrewinner(drawId) {
    // Serializar concurrencia con import SRQ — garantiza que el optimizer lea
    // un snapshot consistente de ventas, sin tickets a medio insertar.
    return withDrawLock(drawId, async () => this._selectPrewinnerInner(drawId));
  }

  async _selectPrewinnerInner(drawId) {
    try {
      logger.info(`🎯 Seleccionando pre-ganador para sorteo ${drawId}...`);

      // Usar el optimizador multi-criterio
      const result = await prewinnerOptimizerService.selectOptimalPrewinner(drawId);
      
      if (!result.success) {
        logger.error(`Error en optimizador: ${result.error}`);
        return null;
      }

      const selectedItem = result.selectedItem;
      
      // Si fue selección de admin (preselect vía Telegram, panel, etc.), el draw
      // tiene preselectedItemId pero NO necesariamente status=CLOSED. El cron
      // execute-draw filtra por status=CLOSED, así que sin este update el
      // sorteo nunca se ejecuta automáticamente. updateMany con where
      // status=SCHEDULED evita pisar draws que ya pasaron a CLOSED/DRAWN
      // por otro flujo concurrente (ej. force-totalize).
      if (result.method === 'admin') {
        logger.info(`  👤 Pre-ganador seleccionado por admin: ${selectedItem.number} - ${selectedItem.name}`);
        const updated = await prisma.draw.updateMany({
          where: { id: drawId, status: 'SCHEDULED' },
          data: { status: 'CLOSED', closedAt: new Date() }
        });
        if (updated.count > 0) {
          logger.info(`  🔒 Draw ${drawId} marcado CLOSED (preselect admin previo)`);
        }
        return selectedItem;
      }

      // Obtener el sorteo para generar reportes
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true }
      });

      if (!draw) {
        logger.warn(`Sorteo ${drawId} no encontrado`);
        return null;
      }

      // Cargar TicketDetails atribuidos a este sorteo (multi-sorteo seguro:
      // antes usaba la relación Draw.tickets que perdía jugadas cuyo
      // Ticket.drawId apuntaba a otro sorteo distinto).
      const details = await loadDrawTicketDetails(drawId, {
        ticketSelect: { id: true },
      });

      // Obtener configuración del juego
      const gameConfig = draw.game.config || {};
      const percentageToDistribute = gameConfig.percentageToDistribute || 70;

      // Ventas totales del sorteo = suma de detail.amount (NO Ticket.totalAmount)
      const totalSales = sumDetailsAmount(details);

      // Calcular monto máximo a pagar
      let maxPayout;
      if (gameConfig.maxPayoutFixed && gameConfig.maxPayoutFixed > 0) {
        maxPayout = parseFloat(gameConfig.maxPayoutFixed);
      } else {
        maxPayout = (totalSales * percentageToDistribute) / 100;
      }
      maxPayout = Math.min(maxPayout, totalSales);

      logger.info(`  Ventas totales: $${totalSales.toFixed(2)}, Máximo a pagar: $${maxPayout.toFixed(2)}`);
      logger.info(`  Método de selección: ${result.method}`);

      // Obtener todos los items del juego
      const gameItems = await prisma.gameItem.findMany({
        where: {
          gameId: draw.gameId,
          isActive: true
        },
        orderBy: { number: 'asc' }
      });

      // Agrupar ventas por item desde la lista plana de details
      const salesByItem = this.groupSalesByItem(details);

      // Calcular datos del item seleccionado
      const selectedSales = salesByItem.get(selectedItem.id) || { amount: 0, count: 0 };
      const potentialPayout = parseFloat(selectedSales.amount) * parseFloat(selectedItem.multiplier);

      // Log del item seleccionado
      logger.info(`  ✅ Pre-ganador seleccionado: ${selectedItem.number} (${selectedItem.name})`);
      logger.info(`     - Ventas: $${selectedSales.amount.toFixed(2)} (${selectedSales.count} tickets)`);
      logger.info(`     - Pago potencial: $${potentialPayout.toFixed(2)}`);
      
      if (result.analysis) {
        logger.info(`     - Tickets ganadores: ${result.analysis.selected?.ticketCount || 0}`);
        logger.info(`     - Score final: ${result.analysis.selected?.finalScore?.toFixed(4) || 'N/A'}`);
      }

      // Actualizar el sorteo con el preselectedItemId
      await prisma.draw.update({
        where: { id: drawId },
        data: {
          preselectedItemId: selectedItem.id,
          status: 'CLOSED',
          closedAt: new Date()
        }
      });

      // Preparar datos de ventas para notificación
      const salesByItemForNotification = {};
      for (const [itemId, sales] of salesByItem.entries()) {
        const item = gameItems.find(i => i.id === itemId);
        if (item) {
          salesByItemForNotification[item.number] = {
            number: item.number,
            name: item.name,
            amount: sales.amount,
            count: sales.count
          };
        }
      }

      // Calcular top 5 de riesgo de tripletas
      const tripletaRiskTop5 = await this.calculateTripletaRiskTop5(draw.gameId, drawId);

      const analysisData = result.analysis || {};

      // Enviar notificación a administradores (solo mensaje de texto;
      // se eliminó el PDF adjunto para liberar el lock más rápido — ver
      // spec 2026-05-11-eliminar-pdf-cierre-sorteo-design.md)
      try {
        await adminNotificationService.notifyPrewinnerSelected({
          drawId,
          game: draw.game,
          drawDate: draw.drawDate,
          drawTime: draw.drawTime,
          prewinnerItem: selectedItem,
          totalSales,
          maxPayout,
          potentialPayout,
          salesByItem: salesByItemForNotification,
          tripletaRiskTop5,
          optimizerMethod: result.method,
          optimizerAnalysis: analysisData
        });
      } catch (notifyError) {
        logger.error(`Error enviando notificación: ${notifyError.message}`);
      }

      return selectedItem;
    } catch (error) {
      logger.error(`❌ Error seleccionando pre-ganador para ${drawId}:`, error);
      throw error;
    }
  }

  /**
   * Agrupar ventas por item desde lista plana de TicketDetail.
   * (Antes recibía tickets[] e iteraba ticket.details — eso incluía jugadas
   * de OTROS sorteos cuando el ticket era multi-sorteo.)
   */
  groupSalesByItem(details) {
    const salesByItem = new Map();

    for (const detail of details) {
      const existing = salesByItem.get(detail.gameItemId) || { amount: 0, count: 0 };
      salesByItem.set(detail.gameItemId, {
        amount: existing.amount + parseFloat(detail.amount),
        count: existing.count + 1
      });
    }

    return salesByItem;
  }

  /**
   * Obtener IDs de items ya usados hoy
   */
  async getUsedItemsToday(gameId, referenceDate) {
    // referenceDate es un drawDate (Date UTC)
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
      if (draw.preselectedItemId) usedItems.add(draw.preselectedItemId);
      if (draw.winnerItemId) usedItems.add(draw.winnerItemId);
    }

    return usedItems;
  }

  /**
   * Obtener centenas usadas hoy (para TRIPLE)
   */
  async getUsedCentenasToday(gameId, referenceDate) {
    // referenceDate es un drawDate (Date UTC)
    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        drawDate: referenceDate,
        OR: [
          { preselectedItemId: { not: null } },
          { winnerItemId: { not: null } }
        ]
      },
      include: {
        preselectedItem: true,
        winnerItem: true
      }
    });

    const usedCentenas = new Set();
    for (const draw of drawsToday) {
      if (draw.preselectedItem) {
        const centena = Math.floor(parseInt(draw.preselectedItem.number) / 100);
        usedCentenas.add(centena);
      }
      if (draw.winnerItem) {
        const centena = Math.floor(parseInt(draw.winnerItem.number) / 100);
        usedCentenas.add(centena);
      }
    }

    return usedCentenas;
  }

  /**
   * Selección aleatoria (fallback)
   */
  async selectRandomItem(gameId, gameType, usedCentenas = new Set(), usedItemsToday = new Set()) {
    let items = await prisma.gameItem.findMany({
      where: {
        gameId,
        isActive: true
      }
    });

    // Filtrar items ya usados hoy
    if (usedItemsToday.size > 0) {
      items = items.filter(item => !usedItemsToday.has(item.id));
    }

    // Para TRIPLE, filtrar por centenas
    if (gameType === 'TRIPLE' && usedCentenas.size > 0) {
      items = items.filter(item => {
        const centena = Math.floor(parseInt(item.number) / 100);
        return !usedCentenas.has(centena);
      });
    }

    if (items.length === 0) {
      items = await prisma.gameItem.findMany({
        where: { gameId, isActive: true }
      });
    }

    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  }

  /**
   * Calcular top 5 de números con mayor riesgo de tripletas
   * @param {string} gameId - ID del juego
   * @param {string} drawId - ID del sorteo actual
   * @returns {Promise<Array>} - Top 5 números con mayor riesgo
   */
  async calculateTripletaRiskTop5(gameId, drawId) {
    try {
      // Obtener el sorteo actual
      const currentDraw = await prisma.draw.findUnique({
        where: { id: drawId },
        select: { drawDate: true, drawTime: true }
      });

      if (!currentDraw) return [];

      // Obtener sorteos ejecutados del mismo día
      const executedDraws = await prisma.draw.findMany({
        where: {
          gameId,
          drawDate: currentDraw.drawDate,
          drawTime: { lt: currentDraw.drawTime },
          status: 'DRAWN',
          winnerItemId: { not: null }
        },
        select: { winnerItemId: true }
      });

      const previousWinnerIds = executedDraws.map(d => d.winnerItemId);

      // Obtener todas las tripletas activas
      const activeTripletas = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          }
        }
      });

      // Calcular riesgo por número
      const riskByItem = new Map();

      for (const tripleta of activeTripletas) {
        const itemIds = tripleta.details.map(d => d.gameItemId);
        const numbersAlreadyWon = itemIds.filter(id => previousWinnerIds.includes(id)).length;

        // Solo contar tripletas que les falta 1 número (alto riesgo)
        if (numbersAlreadyWon === 2) {
          const missingItemId = itemIds.find(id => !previousWinnerIds.includes(id));
          const missingItem = tripleta.details.find(d => d.gameItemId === missingItemId);
          
          if (missingItem) {
            const existing = riskByItem.get(missingItemId) || {
              number: missingItem.gameItem.number,
              name: missingItem.gameItem.name,
              tripletaCount: 0,
              tripletaPrize: 0
            };

            const tripletaPrize = parseFloat(tripleta.totalAmount) * parseFloat(tripleta.providerData.multiplicador || 50);
            
            riskByItem.set(missingItemId, {
              ...existing,
              tripletaCount: existing.tripletaCount + 1,
              tripletaPrize: existing.tripletaPrize + tripletaPrize
            });
          }
        }
      }

      // Convertir a array y ordenar por premio potencial
      const riskArray = Array.from(riskByItem.values())
        .sort((a, b) => b.tripletaPrize - a.tripletaPrize)
        .slice(0, 5);

      return riskArray;
    } catch (error) {
      logger.error('Error calculando top 5 de riesgo de tripletas:', error);
      return [];
    }
  }

  /**
   * Seleccionar pre-ganadores para sorteos que cierran pronto
   */
  async selectPrewinnersForClosingDraws(minutesBefore = 5) {
    try {
      const { getVenezuelaDateAsUTC, getVenezuelaTimeString, addMinutesToTime } = await import('../lib/dateUtils.js');
      const todayVenezuela = getVenezuelaDateAsUTC();
      const currentTime = getVenezuelaTimeString();
      const targetTime = addMinutesToTime(currentTime, minutesBefore);

      const draws = await prisma.draw.findMany({
        where: {
          drawDate: todayVenezuela,
          drawTime: {
            gte: currentTime,
            lte: targetTime
          },
          status: 'SCHEDULED',
          preselectedItemId: null,
          apiMappings: {
            some: {}
          }
        },
        include: {
          game: true
        }
      });

      if (draws.length === 0) {
        return [];
      }

      logger.info(`🎯 Seleccionando pre-ganadores para ${draws.length} sorteos...`);

      const results = [];
      for (const draw of draws) {
        try {
          const selected = await this.selectPrewinner(draw.id);
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            selectedItem: selected ? { number: selected.number, name: selected.name } : null
          });
        } catch (error) {
          logger.error(`Error seleccionando pre-ganador para ${draw.id}:`, error.message);
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('❌ Error en selectPrewinnersForClosingDraws:', error);
      throw error;
    }
  }
}

export default new PrewinnerSelectionService();
