import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class DrawStatsService {
  /**
   * Calcular y guardar estadísticas de un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {Object} tx - Transacción de Prisma (opcional)
   */
  async calculateDrawStats(drawId, tx = null) {
    const client = tx || prisma;

    try {
      // Obtener el sorteo con sus tickets
      const draw = await client.draw.findUnique({
        where: { id: drawId },
        include: {
          tickets: {
            include: {
              details: true
            }
          },
          game: true,
          winnerItem: true
        }
      });

      if (!draw) {
        throw new Error(`Sorteo ${drawId} no encontrado`);
      }

      // Calcular estadísticas de tickets
      let totalSales = 0;
      let totalPrize = 0;
      let ticketCount = 0;
      let detailCount = 0;
      let winnerCount = 0;

      for (const ticket of draw.tickets) {
        ticketCount++;
        totalSales += parseFloat(ticket.totalAmount || 0);
        totalPrize += parseFloat(ticket.totalPrize || 0);
        detailCount += ticket.details.length;

        if (ticket.status === 'WON') {
          winnerCount++;
        }
      }

      // Calcular estadísticas de tripletas activas en este sorteo
      const tripletas = await client.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          OR: [
            { startDrawId: drawId },
            { endDrawId: drawId }
          ]
        }
      });

      let tripletaSales = 0;
      let tripletaPrize = 0;
      let tripletaCount = tripletas.length;

      for (const tripleta of tripletas) {
        tripletaSales += parseFloat(tripleta.amount || 0);
        // El premio potencial de tripleta
        tripletaPrize += parseFloat(tripleta.amount || 0) * parseFloat(tripleta.multiplier || 0);
      }

      // Calcular balance
      const grossProfit = totalSales - totalPrize;
      const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

      // Upsert DrawStats
      const stats = await client.drawStats.upsert({
        where: { drawId },
        create: {
          drawId,
          totalSales,
          ticketCount,
          detailCount,
          totalPrize,
          winnerCount,
          grossProfit,
          profitMargin,
          tripletaSales,
          tripletaPrize,
          tripletaCount,
          calculatedAt: new Date()
        },
        update: {
          totalSales,
          ticketCount,
          detailCount,
          totalPrize,
          winnerCount,
          grossProfit,
          profitMargin,
          tripletaSales,
          tripletaPrize,
          tripletaCount,
          calculatedAt: new Date()
        }
      });

      logger.info('DrawStats calculated', {
        drawId,
        totalSales,
        totalPrize,
        grossProfit,
        profitMargin: profitMargin.toFixed(2)
      });

      return stats;
    } catch (error) {
      logger.error('Error calculating DrawStats:', error);
      throw error;
    }
  }

  /**
   * Calcular estadísticas por proveedor (taquilla, grupo, banca, comercial)
   * @param {string} drawId - ID del sorteo
   * @param {Object} tx - Transacción de Prisma (opcional)
   */
  async calculateProviderStats(drawId, tx = null) {
    const client = tx || prisma;

    try {
      // Obtener tickets del sorteo con datos de proveedor
      const tickets = await client.ticket.findMany({
        where: { 
          drawId,
          source: 'EXTERNAL_API'
        },
        include: {
          details: true
        }
      });

      // Agrupar por nivel de proveedor
      const statsByLevel = {
        TAQUILLA: new Map(),
        GRUPO: new Map(),
        BANCA: new Map(),
        COMERCIAL: new Map()
      };

      for (const ticket of tickets) {
        const providerData = ticket.providerData || {};
        const totalAmount = parseFloat(ticket.totalAmount || 0);
        const totalPrize = parseFloat(ticket.totalPrize || 0);
        const isWinner = ticket.status === 'WON';

        // Procesar cada nivel
        const levels = [
          { level: 'TAQUILLA', id: providerData.taquillaID },
          { level: 'GRUPO', id: providerData.grupoID },
          { level: 'BANCA', id: providerData.bancaID },
          { level: 'COMERCIAL', id: providerData.comercialID }
        ];

        for (const { level, id } of levels) {
          if (!id) continue;

          const key = `${level}-${id}`;
          if (!statsByLevel[level].has(key)) {
            statsByLevel[level].set(key, {
              level,
              externalId: parseInt(id),
              entityId: `${level.toLowerCase()}-${id}`,
              totalSales: 0,
              ticketCount: 0,
              detailCount: 0,
              totalPrize: 0,
              winnerCount: 0
            });
          }

          const stats = statsByLevel[level].get(key);
          stats.totalSales += totalAmount;
          stats.ticketCount++;
          stats.detailCount += ticket.details.length;
          stats.totalPrize += totalPrize;
          if (isWinner) stats.winnerCount++;
        }
      }

      // Guardar estadísticas por nivel
      const allStats = [];

      for (const [level, statsMap] of Object.entries(statsByLevel)) {
        for (const stats of statsMap.values()) {
          const grossProfit = stats.totalSales - stats.totalPrize;
          const profitMargin = stats.totalSales > 0 ? (grossProfit / stats.totalSales) * 100 : 0;

          const saved = await client.providerStats.upsert({
            where: {
              level_entityId_drawId: {
                level: stats.level,
                entityId: stats.entityId,
                drawId
              }
            },
            create: {
              level: stats.level,
              entityId: stats.entityId,
              externalId: stats.externalId,
              drawId,
              totalSales: stats.totalSales,
              ticketCount: stats.ticketCount,
              detailCount: stats.detailCount,
              totalPrize: stats.totalPrize,
              winnerCount: stats.winnerCount,
              grossProfit,
              profitMargin,
              calculatedAt: new Date()
            },
            update: {
              totalSales: stats.totalSales,
              ticketCount: stats.ticketCount,
              detailCount: stats.detailCount,
              totalPrize: stats.totalPrize,
              winnerCount: stats.winnerCount,
              grossProfit,
              profitMargin,
              calculatedAt: new Date()
            }
          });

          allStats.push(saved);
        }
      }

      logger.info('ProviderStats calculated', {
        drawId,
        taquillas: statsByLevel.TAQUILLA.size,
        grupos: statsByLevel.GRUPO.size,
        bancas: statsByLevel.BANCA.size,
        comerciales: statsByLevel.COMERCIAL.size
      });

      return allStats;
    } catch (error) {
      logger.error('Error calculating ProviderStats:', error);
      throw error;
    }
  }

  /**
   * Calcular todas las estadísticas de un sorteo (draw + providers)
   */
  async calculateAllStats(drawId, tx = null) {
    const client = tx || prisma;

    const drawStats = await this.calculateDrawStats(drawId, client);
    const providerStats = await this.calculateProviderStats(drawId, client);

    return { drawStats, providerStats };
  }

  /**
   * Obtener estadísticas de un sorteo
   */
  async getDrawStats(drawId) {
    return prisma.drawStats.findUnique({
      where: { drawId },
      include: {
        draw: {
          include: {
            game: true,
            winnerItem: true
          }
        }
      }
    });
  }

  /**
   * Obtener estadísticas de proveedores de un sorteo
   */
  async getProviderStats(drawId, level = null) {
    const where = { drawId };
    if (level) where.level = level;

    return prisma.providerStats.findMany({
      where,
      orderBy: [
        { level: 'asc' },
        { totalSales: 'desc' }
      ]
    });
  }

  /**
   * Obtener resumen de estadísticas por fecha
   */
  async getDailyStats(date, gameId = null) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const where = {
      draw: {
        drawDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    };

    if (gameId) {
      where.draw.gameId = gameId;
    }

    const stats = await prisma.drawStats.findMany({
      where,
      include: {
        draw: {
          include: {
            game: true,
            winnerItem: true
          }
        }
      },
      orderBy: {
        draw: {
          scheduledAt: 'asc'
        }
      }
    });

    // Calcular totales
    const totals = {
      totalSales: 0,
      totalPrize: 0,
      grossProfit: 0,
      ticketCount: 0,
      drawCount: stats.length
    };

    for (const stat of stats) {
      totals.totalSales += parseFloat(stat.totalSales || 0);
      totals.totalPrize += parseFloat(stat.totalPrize || 0);
      totals.grossProfit += parseFloat(stat.grossProfit || 0);
      totals.ticketCount += stat.ticketCount;
    }

    totals.profitMargin = totals.totalSales > 0 
      ? (totals.grossProfit / totals.totalSales) * 100 
      : 0;

    return { stats, totals };
  }

  /**
   * Obtener estadísticas acumuladas de un proveedor
   */
  async getProviderAccumulatedStats(level, externalId, dateFrom = null, dateTo = null) {
    const where = {
      level,
      externalId: parseInt(externalId)
    };

    if (dateFrom || dateTo) {
      where.draw = {};
      if (dateFrom) where.draw.drawDate = { gte: new Date(dateFrom) };
      if (dateTo) {
        where.draw.drawDate = where.draw.drawDate || {};
        where.draw.drawDate.lte = new Date(dateTo);
      }
    }

    const stats = await prisma.providerStats.findMany({
      where,
      include: {
        draw: {
          include: {
            game: true
          }
        }
      }
    });

    // Calcular totales
    const totals = {
      totalSales: 0,
      totalPrize: 0,
      grossProfit: 0,
      ticketCount: 0,
      drawCount: stats.length
    };

    for (const stat of stats) {
      totals.totalSales += parseFloat(stat.totalSales || 0);
      totals.totalPrize += parseFloat(stat.totalPrize || 0);
      totals.grossProfit += parseFloat(stat.grossProfit || 0);
      totals.ticketCount += stat.ticketCount;
    }

    totals.profitMargin = totals.totalSales > 0 
      ? (totals.grossProfit / totals.totalSales) * 100 
      : 0;

    return { stats, totals };
  }
}

export default new DrawStatsService();
