/**
 * Servicio de Análisis de Sorteos
 * Ayuda a determinar el mejor número ganador considerando:
 * - Jugada directa por número
 * - Impacto en tripletas activas
 * - Balance total (venta - premios directos - premios tripleta)
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class DrawAnalysisService {
  /**
   * Analizar impacto de seleccionar cada número como ganador
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<Object>} Análisis completo
   */
  async analyzeDrawWinnerImpact(drawId) {
    try {
      logger.info(`📊 Analizando impacto de ganadores para sorteo ${drawId}`);

      // Obtener sorteo con juego y tickets
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
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
        throw new Error('Sorteo no encontrado');
      }

      // Obtener todos los items del juego
      const gameItems = await prisma.gameItem.findMany({
        where: { gameId: draw.gameId, isActive: true },
        orderBy: { number: 'asc' }
      });

      // Calcular ventas totales
      const tickets = draw.tickets || [];
      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

      // Obtener configuración del juego
      const gameConfig = draw.game.config || {};
      const percentageToDistribute = gameConfig.percentageToDistribute || 70;
      const maxPayout = (totalSales * percentageToDistribute) / 100;

      // Agrupar ventas por item
      const salesByItem = new Map();
      for (const ticket of tickets) {
        for (const detail of ticket.details) {
          const current = salesByItem.get(detail.gameItemId) || { amount: 0, count: 0 };
          salesByItem.set(detail.gameItemId, {
            amount: current.amount + parseFloat(detail.amount),
            count: current.count + 1
          });
        }
      }

      // Obtener tripletas activas del juego
      // Construir fecha/hora completa del sorteo
      const drawDateTime = new Date(draw.drawDate);
      const [hours, minutes] = draw.drawTime.split(':');
      drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      const activeTripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: drawDateTime }
        }
      });

      // Analizar cada item
      const analysis = [];

      for (const item of gameItems) {
        const sales = salesByItem.get(item.id) || { amount: 0, count: 0 };
        const directPrize = sales.amount * parseFloat(item.multiplier);

        // Calcular impacto en tripletas
        const tripletaImpact = await this.calculateTripletaImpact(
          draw.gameId,
          item.id,
          drawId,
          activeTripletas
        );

        const totalPrize = directPrize + tripletaImpact.totalPrize;
        const balance = totalSales - totalPrize;
        const profitPercentage = totalSales > 0 ? ((balance / totalSales) * 100) : 0;

        // Clasificar recomendación
        let recommendation = 'RECOMENDADO';
        let riskLevel = 'low';

        if (totalPrize > totalSales) {
          recommendation = 'PELIGROSO';
          riskLevel = 'high';
        } else if (totalPrize > maxPayout) {
          recommendation = 'RIESGOSO';
          riskLevel = 'medium';
        } else if (profitPercentage < 20) {
          recommendation = 'ACEPTABLE';
          riskLevel = 'medium';
        }

        analysis.push({
          itemId: item.id,
          number: item.number,
          name: item.name,
          multiplier: parseFloat(item.multiplier),
          sales: {
            amount: sales.amount,
            ticketCount: sales.count
          },
          directPrize,
          tripleta: {
            count: tripletaImpact.count,
            completedCount: tripletaImpact.completedCount,
            totalPrize: tripletaImpact.totalPrize,
            details: tripletaImpact.details
          },
          totalPrize,
          balance,
          profitPercentage: profitPercentage.toFixed(2),
          recommendation,
          riskLevel
        });
      }

      // Ordenar por balance descendente (mejores opciones primero)
      analysis.sort((a, b) => b.balance - a.balance);

      // Agregar ranking
      analysis.forEach((item, index) => {
        item.rank = index + 1;
      });

      return {
        drawId,
        game: {
          id: draw.game.id,
          name: draw.game.name,
          type: draw.game.type
        },
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
        status: draw.status,
        currentWinner: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        preselectedItem: draw.preselectedItem ? {
          number: draw.preselectedItem.number,
          name: draw.preselectedItem.name
        } : null,
        summary: {
          totalSales,
          maxPayout,
          percentageToDistribute,
          totalTickets: tickets.length,
          activeTripletas: activeTripletas.length,
          itemsWithSales: analysis.filter(a => a.sales.amount > 0).length
        },
        analysis,
        recommendations: {
          best: analysis.filter(a => a.recommendation === 'RECOMENDADO').slice(0, 5),
          acceptable: analysis.filter(a => a.recommendation === 'ACEPTABLE').slice(0, 5),
          risky: analysis.filter(a => a.recommendation === 'RIESGOSO'),
          dangerous: analysis.filter(a => a.recommendation === 'PELIGROSO')
        }
      };
    } catch (error) {
      logger.error('Error en analyzeDrawWinnerImpact:', error);
      throw error;
    }
  }

  /**
   * Calcular impacto en tripletas si un item gana
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
        // Construir fecha/hora del sorteo inicial
        const startDateTime = new Date(startDraw.drawDate);
        const [startHours, startMinutes] = startDraw.drawTime.split(':');
        startDateTime.setUTCHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
        
        const expiresDate = new Date(tripleta.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z';
        
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: expiresDate } }
            ],
            status: { in: ['DRAWN', 'PUBLISHED'] },
            winnerItemId: { not: null }
          },
          select: { id: true, winnerItemId: true }
        });

        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        
        // Verificar cuántos números ya salieron
        const item1Won = winnerItemIds.includes(tripleta.item1Id);
        const item2Won = winnerItemIds.includes(tripleta.item2Id);
        const item3Won = winnerItemIds.includes(tripleta.item3Id);

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

        // Obtener info de los items
        const items = await prisma.gameItem.findMany({
          where: { id: { in: itemIds } }
        });

        const itemMap = new Map(items.map(i => [i.id, i]));

        details.push({
          tripletaId: tripleta.id,
          userId: tripleta.userId,
          amount: parseFloat(tripleta.amount),
          multiplier: parseFloat(tripleta.multiplier),
          prize,
          wouldComplete,
          numbersWon: [item1Won, item2Won, item3Won].filter(Boolean).length,
          items: itemIds.map(id => ({
            id,
            number: itemMap.get(id)?.number,
            name: itemMap.get(id)?.name,
            won: winnerItemIds.includes(id),
            isTarget: id === itemId
          }))
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
   * Obtener resumen rápido de análisis para un sorteo
   */
  async getQuickAnalysis(drawId) {
    try {
      const fullAnalysis = await this.analyzeDrawWinnerImpact(drawId);
      
      return {
        drawId,
        game: fullAnalysis.game.name,
        drawDate: fullAnalysis.drawDate,
        drawTime: fullAnalysis.drawTime,
        summary: fullAnalysis.summary,
        topRecommendations: fullAnalysis.recommendations.best.slice(0, 3).map(item => ({
          number: item.number,
          name: item.name,
          balance: item.balance,
          profitPercentage: item.profitPercentage
        })),
        dangerousItems: fullAnalysis.recommendations.dangerous.map(item => ({
          number: item.number,
          name: item.name,
          totalPrize: item.totalPrize,
          tripletaCount: item.tripleta.completedCount
        }))
      };
    } catch (error) {
      logger.error('Error en getQuickAnalysis:', error);
      throw error;
    }
  }
}

export default new DrawAnalysisService();
