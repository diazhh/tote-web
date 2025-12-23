import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import adminNotificationService from './admin-notification.service.js';
import pdfReportService from './pdf-report.service.js';
import { startOfDay, subDays, differenceInDays } from 'date-fns';

/**
 * Servicio para selección de pre-ganadores
 * 
 * Criterios de selección:
 * 1. El pago potencial (monto jugado × multiplicador + tripletas) debe estar por debajo
 *    del máximo a repartir (percentageToDistribute del total de ventas)
 * 2. El item NO debe haber sido pre-seleccionado o ganado en el mismo día
 * 3. Para juegos TRIPLE: distribuir en diferentes centenas (0XX, 1XX, 2XX, etc.)
 * 4. Considerar riesgo de tripletas: evitar items que completarían tripletas costosas
 * 5. Favorecer items con más tickets vendidos (más personas ganan)
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

      // Obtener el sorteo con su juego y tickets
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          preselectedItem: true,
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

      // Si ya hay un pre-ganador seleccionado por admin, respetarlo
      if (draw.preselectedItemId && draw.preselectedItem) {
        logger.info(`  👤 Pre-ganador ya seleccionado por admin: ${draw.preselectedItem.number} - ${draw.preselectedItem.name}`);
        return draw.preselectedItem;
      }

      // Obtener configuración del juego
      const gameConfig = draw.game.config || {};
      const percentageToDistribute = gameConfig.percentageToDistribute || 70;

      // Calcular ventas totales del sorteo
      const tickets = draw.tickets || [];
      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

      if (totalSales === 0) {
        logger.info(`  No hay ventas para sorteo ${drawId}, selección aleatoria...`);
        return await this.selectRandomItem(draw.gameId, draw.game.type);
      }

      // Calcular monto máximo a pagar
      const maxPayout = (totalSales * percentageToDistribute) / 100;
      logger.info(`  Ventas totales: $${totalSales.toFixed(2)}, Máximo a pagar: $${maxPayout.toFixed(2)}`);

      // Agrupar tickets por gameItem
      const salesByItem = this.groupSalesByItem(tickets);

      // Obtener todos los items del juego con su lastWin
      const gameItems = await prisma.gameItem.findMany({
        where: {
          gameId: draw.gameId,
          isActive: true
        },
        orderBy: { number: 'asc' }
      });

      // Obtener items ya usados hoy (pre-seleccionados o ganadores)
      const usedItemsToday = await this.getUsedItemsToday(draw.gameId, draw.scheduledAt);
      
      // Obtener centenas usadas hoy (solo para TRIPLE)
      const usedCentenas = draw.game.type === 'TRIPLE' 
        ? await this.getUsedCentenasToday(draw.gameId, draw.scheduledAt)
        : new Set();

      // Obtener tripletas activas para calcular riesgo
      const activeTripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: draw.scheduledAt }
        }
      });

      logger.info(`  Tripletas activas: ${activeTripletas.length}`);

      // Evaluar cada item
      const candidates = [];
      const now = new Date();

      for (const item of gameItems) {
        const sales = salesByItem.get(item.id) || { amount: 0, count: 0 };
        const potentialPayout = parseFloat(sales.amount) * parseFloat(item.multiplier);
        
        // Criterio 1: El pago potencial debe estar por debajo del máximo
        if (potentialPayout > maxPayout) {
          continue; // Descartado: pagaría más del máximo
        }

        // Criterio 2: NO debe haber sido pre-seleccionado o ganado hoy
        if (usedItemsToday.has(item.id)) {
          continue; // Descartado: ya fue usado hoy
        }

        // Criterio 3: Para TRIPLE, evitar centenas ya usadas hoy
        if (draw.game.type === 'TRIPLE') {
          const centena = Math.floor(parseInt(item.number) / 100);
          if (usedCentenas.has(centena)) {
            continue; // Descartado: centena ya usada hoy
          }
        }

        // Calcular días desde última victoria (para scoring, no para exclusión)
        const daysSinceLastWin = item.lastWin 
          ? differenceInDays(now, new Date(item.lastWin))
          : 999; // Nunca ha ganado

        // Calcular impacto de tripletas si este item gana
        const tripletaImpact = await this.calculateTripletaImpact(
          draw.gameId,
          item.id,
          drawId,
          activeTripletas
        );

        // Pago total incluyendo tripletas
        const totalPayout = potentialPayout + tripletaImpact.totalPrize;

        // Si el pago total (incluyendo tripletas) excede las ventas, descartar
        if (totalPayout > totalSales) {
          logger.debug(`  Descartado ${item.number}: pago total $${totalPayout.toFixed(2)} > ventas $${totalSales.toFixed(2)}`);
          continue;
        }

        // Calcular score (mayor es mejor)
        // - Preferir items que no han ganado hace más tiempo
        // - Preferir items con pago cercano pero debajo del máximo
        // - Preferir items con más tickets vendidos (más personas ganan)
        // - Penalizar items que completarían tripletas
        const payoutRatio = maxPayout > 0 ? potentialPayout / maxPayout : 0;
        const score = this.calculateScore(
          daysSinceLastWin, 
          payoutRatio, 
          sales.amount, 
          sales.count,
          tripletaImpact.completedCount,
          tripletaImpact.totalPrize,
          totalSales
        );

        candidates.push({
          item,
          sales,
          potentialPayout,
          tripletaImpact,
          totalPayout,
          daysSinceLastWin,
          score
        });
      }

      if (candidates.length === 0) {
        logger.warn(`  No hay candidatos válidos, selección aleatoria...`);
        return await this.selectRandomItem(draw.gameId, draw.game.type, usedCentenas, usedItemsToday);
      }

      // Ordenar por score descendente
      candidates.sort((a, b) => b.score - a.score);

      // Seleccionar el mejor candidato
      const selected = candidates[0];
      
      logger.info(`  ✅ Pre-ganador seleccionado: ${selected.item.number} (${selected.item.name})`);
      logger.info(`     - Ventas: $${selected.sales.amount.toFixed(2)} (${selected.sales.count} tickets)`);
      logger.info(`     - Pago potencial directo: $${selected.potentialPayout.toFixed(2)}`);
      logger.info(`     - Tripletas que se completarían: ${selected.tripletaImpact?.completedCount || 0}`);
      logger.info(`     - Pago tripletas: $${(selected.tripletaImpact?.totalPrize || 0).toFixed(2)}`);
      logger.info(`     - Pago total: $${(selected.totalPayout || selected.potentialPayout).toFixed(2)}`);
      logger.info(`     - Días sin ganar: ${selected.daysSinceLastWin}`);
      logger.info(`     - Score: ${selected.score.toFixed(2)}`);

      // Actualizar el sorteo con el preselectedItemId
      await prisma.draw.update({
        where: { id: drawId },
        data: {
          preselectedItemId: selected.item.id,
          status: 'CLOSED',
          closedAt: new Date()
        }
      });

      // Preparar datos de ventas por item para notificación
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

      // Preparar datos de riesgo de tripletas para el PDF
      const highRiskItems = candidates.filter(c => c.tripletaImpact?.completedCount > 0);
      const tripletaRiskData = {
        activeTripletas: activeTripletas.length,
        highRiskItems: highRiskItems.length,
        mediumRiskItems: candidates.filter(c => c.tripletaImpact?.count > 0 && c.tripletaImpact?.completedCount === 0).length,
        noRiskItems: candidates.filter(c => !c.tripletaImpact || c.tripletaImpact.count === 0).length,
        totalHighRiskPrize: highRiskItems.reduce((sum, c) => sum + (c.tripletaImpact?.totalPrize || 0), 0),
        highRiskDetails: highRiskItems.map(c => ({
          number: c.item.number,
          name: c.item.name,
          completedCount: c.tripletaImpact?.completedCount || 0,
          totalPrize: c.tripletaImpact?.totalPrize || 0
        }))
      };

      // Generar PDF de cierre de sorteo primero
      let pdfPath = null;
      try {
        pdfPath = await pdfReportService.generateDrawClosingReport({
          drawId,
          game: draw.game,
          scheduledAt: draw.scheduledAt,
          prewinnerItem: selected.item,
          totalSales,
          maxPayout,
          potentialPayout: selected.potentialPayout,
          allItems: gameItems,
          salesByItem: this.convertSalesByItemForPdf(salesByItem, gameItems),
          candidates: candidates.slice(0, 10), // Top 10 candidatos
          tripletaRiskData
        });
        logger.info(`  📄 PDF generado: ${pdfPath}`);
      } catch (pdfError) {
        logger.error(`Error generando PDF de cierre: ${pdfError.message}`);
      }

      // Enviar notificación a administradores con el PDF
      try {
        await adminNotificationService.notifyPrewinnerSelected({
          drawId,
          game: draw.game,
          scheduledAt: draw.scheduledAt,
          prewinnerItem: selected.item,
          totalSales,
          maxPayout,
          potentialPayout: selected.potentialPayout,
          salesByItem: salesByItemForNotification,
          pdfPath // Incluir ruta del PDF
        });
      } catch (notifyError) {
        logger.error(`Error enviando notificación de pre-ganador: ${notifyError.message}`);
      }

      return selected.item;
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
   * Convertir salesByItem (Map) a objeto para PDF (indexado por itemId)
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
   * Calcular score para un candidato
   * @param {number} daysSinceLastWin - Días desde la última victoria
   * @param {number} payoutRatio - Ratio del pago potencial vs máximo (0-1)
   * @param {number} salesAmount - Monto vendido para este item
   * @param {number} ticketCount - Cantidad de tickets vendidos para este item
   * @param {number} tripletaCompletedCount - Cantidad de tripletas que se completarían
   * @param {number} tripletaPrize - Premio total de tripletas que se pagarían
   * @param {number} totalSales - Ventas totales del sorteo
   */
  calculateScore(daysSinceLastWin, payoutRatio, salesAmount, ticketCount = 0, tripletaCompletedCount = 0, tripletaPrize = 0, totalSales = 0) {
    // Peso para días sin ganar (más días = mejor, pero con límite)
    const daysWeight = 0.15;
    const daysScore = Math.min(daysSinceLastWin / 30, 1); // Normalizar a 30 días máx

    // Peso para ratio de pago (queremos cercano a 1 pero no mayor)
    const payoutWeight = 0.15;
    const payoutScore = payoutRatio; // Ya está entre 0 y 1

    // Peso para ventas en monto (preferir items con algunas ventas)
    const salesWeight = 0.10;
    const salesScore = salesAmount > 0 ? Math.min(salesAmount / 100, 1) : 0;

    // Peso para cantidad de tickets (más tickets = más personas ganan = mejor)
    // Este es el factor más importante para maximizar ganadores
    const ticketWeight = 0.35;
    const ticketScore = ticketCount > 0 ? Math.min(ticketCount / 50, 1) : 0; // Normalizar a 50 tickets máx

    // Penalización por riesgo de tripletas (muy importante para evitar pérdidas)
    const tripletaWeight = 0.25;
    let tripletaPenalty = 0;
    
    if (tripletaCompletedCount > 0) {
      // Penalizar fuertemente si se completarían tripletas
      // La penalización es proporcional al premio de tripletas vs ventas totales
      const tripletaRiskRatio = totalSales > 0 ? tripletaPrize / totalSales : 1;
      tripletaPenalty = Math.min(tripletaRiskRatio * 2, 1); // Máximo penalización de 1
      
      // Penalización adicional por cantidad de tripletas
      tripletaPenalty += Math.min(tripletaCompletedCount * 0.2, 0.5);
      tripletaPenalty = Math.min(tripletaPenalty, 1); // Cap at 1
    }

    const baseScore = (daysScore * daysWeight) + (payoutScore * payoutWeight) + (salesScore * salesWeight) + (ticketScore * ticketWeight);
    const tripletaDeduction = tripletaPenalty * tripletaWeight;
    
    return Math.max(baseScore - tripletaDeduction, 0);
  }

  /**
   * Calcular impacto en tripletas si un item gana
   * @param {string} gameId - ID del juego
   * @param {string} itemId - ID del item
   * @param {string} drawId - ID del sorteo
   * @param {Array} activeTripletas - Tripletas activas
   */
  async calculateTripletaImpact(gameId, itemId, drawId, activeTripletas) {
    try {
      // Filtrar tripletas que incluyen este item
      const relevantTripletas = activeTripletas.filter(t => 
        t.item1Id === itemId || t.item2Id === itemId || t.item3Id === itemId
      );

      if (relevantTripletas.length === 0) {
        return { count: 0, completedCount: 0, totalPrize: 0, details: [] };
      }

      const details = [];
      let completedCount = 0;
      let totalPrize = 0;

      for (const tripleta of relevantTripletas) {
        // Obtener sorteo inicial de la tripleta
        const startDraw = await prisma.draw.findUnique({
          where: { id: tripleta.startDrawId }
        });

        if (!startDraw) continue;

        // Obtener sorteos ejecutados en el rango de la tripleta
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId,
            scheduledAt: {
              gte: startDraw.scheduledAt,
              lte: tripleta.expiresAt
            },
            status: { in: ['DRAWN', 'PUBLISHED'] },
            winnerItemId: { not: null }
          },
          select: { id: true, winnerItemId: true }
        });

        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        
        // Verificar si este item es el que falta para completar
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
        const otherItems = itemIds.filter(id => id !== itemId);
        const otherItemsWon = otherItems.every(id => winnerItemIds.includes(id));

        // Si los otros 2 ya salieron, este item completaría la tripleta
        const wouldComplete = otherItemsWon && !winnerItemIds.includes(itemId);
        const prize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);

        if (wouldComplete) {
          completedCount++;
          totalPrize += prize;
        }

        details.push({
          tripletaId: tripleta.id,
          amount: parseFloat(tripleta.amount),
          multiplier: parseFloat(tripleta.multiplier),
          prize,
          wouldComplete
        });
      }

      return {
        count: relevantTripletas.length,
        completedCount,
        totalPrize,
        details: details.sort((a, b) => b.wouldComplete - a.wouldComplete)
      };
    } catch (error) {
      logger.error('Error en calculateTripletaImpact:', error);
      return { count: 0, completedCount: 0, totalPrize: 0, details: [] };
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
        scheduledAt: {
          gte: today,
          lt: tomorrow
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
      if (draw.preselectedItemId) {
        usedItems.add(draw.preselectedItemId);
      }
      if (draw.winnerItemId) {
        usedItems.add(draw.winnerItemId);
      }
    }

    logger.debug(`  Items usados hoy: ${usedItems.size} items`);
    return usedItems;
  }

  /**
   * Obtener centenas ya usadas hoy para un juego TRIPLE
   */
  async getUsedCentenasToday(gameId, referenceDate) {
    const today = startOfDay(referenceDate);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const drawsToday = await prisma.draw.findMany({
      where: {
        gameId,
        scheduledAt: {
          gte: today,
          lt: tomorrow
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

    logger.debug(`  Centenas usadas hoy: ${Array.from(usedCentenas).join(', ')}`);
    return usedCentenas;
  }

  /**
   * Selección aleatoria cuando no hay candidatos válidos
   */
  async selectRandomItem(gameId, gameType, usedCentenas = new Set(), usedItemsToday = new Set()) {
    // Buscar todos los items activos
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

    // Para TRIPLE, filtrar por centenas no usadas
    if (gameType === 'TRIPLE' && usedCentenas.size > 0) {
      items = items.filter(item => {
        const centena = Math.floor(parseInt(item.number) / 100);
        return !usedCentenas.has(centena);
      });
    }

    if (items.length === 0) {
      // Si no hay items válidos, tomar cualquiera (caso extremo)
      logger.warn(`  ⚠️ No hay items disponibles que no hayan sido usados hoy, seleccionando cualquiera...`);
      items = await prisma.gameItem.findMany({
        where: { gameId, isActive: true }
      });
    }

    // Selección aleatoria
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  }

  /**
   * Seleccionar pre-ganadores para todos los sorteos que cierran pronto
   * @param {number} minutesBefore - Minutos antes del sorteo
   */
  async selectPrewinnersForClosingDraws(minutesBefore = 5) {
    try {
      const now = new Date();
      const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 60 * 1000); // -1 min

      // Buscar sorteos que cierran pronto y no tienen preselectedItem
      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: windowStart,
            lte: targetTime
          },
          status: 'SCHEDULED',
          preselectedItemId: null,
          apiMappings: {
            some: {} // Solo sorteos con mapping de API (tienen tickets)
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
