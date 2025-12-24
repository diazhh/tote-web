import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import adminNotificationService from './admin-notification.service.js';
import pdfReportService from './pdf-report.service.js';
import { startOfDay, differenceInDays } from 'date-fns';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';
import prewinnerOptimizerService from './prewinner-optimizer.service.js';

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
    try {
      logger.info(`🎯 Seleccionando pre-ganador para sorteo ${drawId}...`);

      // Usar el optimizador multi-criterio
      const result = await prewinnerOptimizerService.selectOptimalPrewinner(drawId);
      
      if (!result.success) {
        logger.error(`Error en optimizador: ${result.error}`);
        return null;
      }

      const selectedItem = result.selectedItem;
      
      // Si fue selección de admin, ya está todo listo
      if (result.method === 'admin') {
        logger.info(`  👤 Pre-ganador seleccionado por admin: ${selectedItem.number} - ${selectedItem.name}`);
        return selectedItem;
      }

      // Obtener el sorteo para generar reportes
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          tickets: {
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        logger.warn(`Sorteo ${drawId} no encontrado`);
        return null;
      }

      // Obtener configuración del juego
      const gameConfig = draw.game.config || {};
      const percentageToDistribute = gameConfig.percentageToDistribute || 70;

      // Calcular ventas totales del sorteo
      const tickets = draw.tickets || [];
      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

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

      // Agrupar ventas por item
      const salesByItem = this.groupSalesByItem(tickets);

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

      // Preparar datos de análisis para el PDF
      const analysisData = result.analysis || {};
      const tripletaRiskData = {
        activeTripletas: 0,
        highRiskItems: 0,
        mediumRiskItems: 0,
        noRiskItems: analysisData.validCandidates || 0,
        totalHighRiskPrize: 0,
        highRiskDetails: []
      };

      // Generar PDF de cierre
      let pdfPath = null;
      try {
        pdfPath = await pdfReportService.generateDrawClosingReport({
          drawId,
          game: draw.game,
          scheduledAt: draw.scheduledAt,
          prewinnerItem: selectedItem,
          totalSales,
          maxPayout,
          potentialPayout,
          allItems: gameItems,
          salesByItem: this.convertSalesByItemForPdf(salesByItem, gameItems),
          candidates: analysisData.topAlternatives || [],
          tripletaRiskData,
          optimizerAnalysis: analysisData
        });
        logger.info(`  📄 PDF generado: ${pdfPath}`);
      } catch (pdfError) {
        logger.error(`Error generando PDF de cierre: ${pdfError.message}`);
      }

      // Enviar notificación a administradores
      try {
        await adminNotificationService.notifyPrewinnerSelected({
          drawId,
          game: draw.game,
          scheduledAt: draw.scheduledAt,
          prewinnerItem: selectedItem,
          totalSales,
          maxPayout,
          potentialPayout,
          salesByItem: salesByItemForNotification,
          pdfPath,
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
   * Agrupar ventas por item
   */
  groupSalesByItem(tickets) {
    const salesByItem = new Map();
    
    for (const ticket of tickets) {
      for (const detail of ticket.details) {
        const existing = salesByItem.get(detail.gameItemId) || { amount: 0, count: 0 };
        salesByItem.set(detail.gameItemId, {
          amount: existing.amount + parseFloat(detail.amount),
          count: existing.count + 1
        });
      }
    }

    return salesByItem;
  }

  /**
   * Convertir salesByItem para PDF
   */
  convertSalesByItemForPdf(salesByItem, gameItems) {
    const result = {};
    for (const [itemId, sales] of salesByItem.entries()) {
      result[itemId] = {
        amount: sales.amount,
        count: sales.count
      };
    }
    return result;
  }

  /**
   * Obtener IDs de items ya usados hoy
   */
  async getUsedItemsToday(gameId, referenceDate) {
    const today = startOfDayInCaracas(referenceDate);
    const tomorrow = endOfDayInCaracas(referenceDate);

    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        scheduledAt: {
          gte: today,
          lte: tomorrow
        },
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
    const today = startOfDayInCaracas(referenceDate);
    const tomorrow = endOfDayInCaracas(referenceDate);

    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        scheduledAt: {
          gte: today,
          lte: tomorrow
        },
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
   * Seleccionar pre-ganadores para sorteos que cierran pronto
   */
  async selectPrewinnersForClosingDraws(minutesBefore = 5) {
    try {
      const now = new Date();
      const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 60 * 1000);

      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: windowStart,
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
            scheduledAt: draw.scheduledAt,
            selectedItem: selected ? { number: selected.number, name: selected.name } : null
          });
        } catch (error) {
          logger.error(`Error seleccionando pre-ganador para ${draw.id}:`, error.message);
          results.push({
            drawId: draw.id,
            game: draw.game.name,
            scheduledAt: draw.scheduledAt,
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
