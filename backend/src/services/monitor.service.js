/**
 * Servicio para el Monitor de Sorteos
 * Proporciona estadísticas por bancas, números y reportes diarios
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { startOfDayDate, endOfDayDate } from '../lib/dateUtils.js';

class MonitorService {
  /**
   * Obtener estadísticas por banca para un sorteo
   * @param {string} drawId - ID del sorteo
   */
  async getBancaStats(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
          tickets: {
            where: { source: 'EXTERNAL_API' },
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

      // Agrupar tickets por banca
      const bancaMap = new Map();

      for (const ticket of draw.tickets) {
        const bancaId = ticket.providerData?.bancaID;
        if (!bancaId) continue;

        if (!bancaMap.has(bancaId)) {
          bancaMap.set(bancaId, {
            externalId: bancaId,
            name: null,
            totalAmount: 0,
            totalPrize: 0,
            ticketCount: 0,
            entityId: ticket.providerData?.entityIds?.bancaId || null
          });
        }

        const banca = bancaMap.get(bancaId);
        banca.totalAmount += parseFloat(ticket.totalAmount);
        banca.ticketCount += 1;

        // Calcular premio si el item ganó
        if (draw.winnerItemId) {
          for (const detail of ticket.details) {
            if (detail.gameItemId === draw.winnerItemId) {
              const prize = parseFloat(detail.amount) * parseFloat(detail.gameItem.multiplier);
              banca.totalPrize += prize;
            }
          }
        }
      }

      // Obtener nombres de bancas si existen en nuestro sistema
      const bancaIds = Array.from(bancaMap.values())
        .filter(b => b.entityId)
        .map(b => b.entityId);

      if (bancaIds.length > 0) {
        const bancas = await prisma.providerBanca.findMany({
          where: { id: { in: bancaIds } }
        });

        for (const banca of bancas) {
          const entry = Array.from(bancaMap.values()).find(b => b.entityId === banca.id);
          if (entry) {
            entry.name = banca.name;
          }
        }
      }

      return {
        drawId,
        game: draw.game.name,
        scheduledAt: draw.scheduledAt,
        winnerItem: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        bancas: Array.from(bancaMap.values()).sort((a, b) => b.totalAmount - a.totalAmount)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas por banca:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por número/item para un sorteo
   * Incluye información de tripletas asociadas
   * @param {string} drawId - ID del sorteo
   */
  async getItemStats(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
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

      // Agrupar por item
      const itemMap = new Map();

      for (const item of gameItems) {
        itemMap.set(item.id, {
          itemId: item.id,
          number: item.number,
          name: item.name,
          multiplier: parseFloat(item.multiplier),
          totalAmount: 0,
          ticketCount: 0,
          potentialPrize: 0,
          percentageOfSales: 0,
          tripletaCount: 0,
          tripletaPrize: 0,
          totalPotentialPrize: 0
        });
      }

      // Calcular ventas totales
      let totalSales = 0;
      for (const ticket of draw.tickets) {
        for (const detail of ticket.details) {
          const item = itemMap.get(detail.gameItemId);
          if (item) {
            const amount = parseFloat(detail.amount);
            item.totalAmount += amount;
            item.ticketCount += 1;
            totalSales += amount;
          }
        }
      }

      // Calcular premios potenciales y porcentajes
      for (const item of itemMap.values()) {
        item.potentialPrize = item.totalAmount * item.multiplier;
        item.percentageOfSales = totalSales > 0 
          ? ((item.potentialPrize / totalSales) * 100).toFixed(2)
          : 0;
      }

      // Obtener tripletas activas que incluyen items de este sorteo
      const activeTripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: draw.scheduledAt }
        }
      });

      // Contar tripletas por item
      for (const tripleta of activeTripletas) {
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
        const tripletaPrize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);

        for (const itemId of itemIds) {
          const item = itemMap.get(itemId);
          if (item) {
            item.tripletaCount += 1;
            item.tripletaPrize += tripletaPrize;
          }
        }
      }

      // Calcular premio total potencial
      for (const item of itemMap.values()) {
        item.totalPotentialPrize = item.potentialPrize + item.tripletaPrize;
      }

      return {
        drawId,
        game: draw.game.name,
        scheduledAt: draw.scheduledAt,
        totalSales,
        winnerItem: draw.winnerItem ? {
          number: draw.winnerItem.number,
          name: draw.winnerItem.name
        } : null,
        items: Array.from(itemMap.values())
          .filter(i => i.totalAmount > 0 || i.tripletaCount > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas por item:', error);
      throw error;
    }
  }

  /**
   * Obtener reporte diario de sorteos
   * @param {Date} date - Fecha del reporte
   * @param {string} gameId - ID del juego (opcional)
   */
  async getDailyReport(date, gameId = null) {
    try {
      // Filtrar por drawDate (solo fecha, sin hora)
      const drawDate = new Date(date);
      if (typeof date === 'string') {
        // Si es string, asegurar formato correcto
        const dateStr = date.split('T')[0];
        drawDate.setTime(new Date(dateStr + 'T00:00:00.000Z').getTime());
      } else {
        // Si es Date, extraer solo la fecha
        const dateStr = date.toISOString().split('T')[0];
        drawDate.setTime(new Date(dateStr + 'T00:00:00.000Z').getTime());
      }

      const where = {
        drawDate: drawDate
      };

      if (gameId) {
        where.gameId = gameId;
      }

      const draws = await prisma.draw.findMany({
        where,
        include: {
          game: true,
          winnerItem: true,
          tickets: {
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });

      const report = [];

      for (const draw of draws) {
        const tickets = draw.tickets || [];
        const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
        
        let totalPrize = 0;
        if (draw.winnerItemId) {
          for (const ticket of tickets) {
            for (const detail of ticket.details) {
              if (detail.gameItemId === draw.winnerItemId) {
                totalPrize += parseFloat(detail.amount) * parseFloat(detail.gameItem.multiplier);
              }
            }
          }
        }

        const balance = totalSales - totalPrize;

        report.push({
          drawId: draw.id,
          game: draw.game.name,
          scheduledAt: draw.scheduledAt,
          status: draw.status,
          winnerItem: draw.winnerItem ? {
            number: draw.winnerItem.number,
            name: draw.winnerItem.name
          } : null,
          totalSales,
          totalPrize,
          balance,
          ticketCount: tickets.length
        });
      }

      // Calcular totales
      const totals = {
        totalSales: report.reduce((sum, r) => sum + r.totalSales, 0),
        totalPrize: report.reduce((sum, r) => sum + r.totalPrize, 0),
        totalBalance: report.reduce((sum, r) => sum + r.balance, 0),
        totalTickets: report.reduce((sum, r) => sum + r.ticketCount, 0),
        drawCount: report.length
      };

      return {
        date: date.toISOString().split('T')[0],
        gameId,
        draws: report,
        totals
      };
    } catch (error) {
      logger.error('Error obteniendo reporte diario:', error);
      throw error;
    }
  }

  /**
   * Obtener tickets de una banca específica en un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {number} bancaExternalId - ID externo de la banca
   */
  async getTicketsByBanca(drawId, bancaExternalId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          tickets: {
            where: { 
              source: 'EXTERNAL_API',
              providerData: {
                path: ['bancaID'],
                equals: parseInt(bancaExternalId)
              }
            },
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

      const tickets = draw.tickets.map(t => ({
        id: t.id,
        externalTicketId: t.externalTicketId,
        comercialId: t.providerData?.comercialID,
        bancaId: t.providerData?.bancaID,
        grupoId: t.providerData?.grupoID,
        taquillaId: t.providerData?.taquillaID,
        totalAmount: parseFloat(t.totalAmount),
        details: t.details.map(d => ({
          number: d.gameItem.number,
          name: d.gameItem.name,
          amount: parseFloat(d.amount)
        })),
        createdAt: t.createdAt
      }));

      return {
        drawId,
        bancaExternalId,
        ticketCount: tickets.length,
        totalAmount: tickets.reduce((sum, t) => sum + t.amount, 0),
        tickets
      };
    } catch (error) {
      logger.error('Error obteniendo tickets por banca:', error);
      throw error;
    }
  }

  /**
   * Obtener tickets de un item específico en un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {string} itemId - ID del item
   */
  async getTicketsByItem(drawId, itemId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          tickets: {
            include: {
              details: {
                where: { gameItemId: itemId },
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

      // Filtrar solo tickets que tienen detalles del item solicitado
      const ticketsWithItem = draw.tickets.filter(t => t.details.length > 0);
      
      const tickets = ticketsWithItem.map(t => ({
        id: t.id,
        externalTicketId: t.externalTicketId,
        source: t.source,
        comercialId: t.providerData?.comercialID,
        bancaId: t.providerData?.bancaID,
        grupoId: t.providerData?.grupoID,
        taquillaId: t.providerData?.taquillaID,
        totalAmount: parseFloat(t.totalAmount),
        details: t.details.map(d => ({
          amount: parseFloat(d.amount),
          number: d.gameItem.number,
          name: d.gameItem.name
        })),
        createdAt: t.createdAt
      }));

      const gameItem = await prisma.gameItem.findUnique({
        where: { id: itemId }
      });

      return {
        drawId,
        item: gameItem ? {
          id: gameItem.id,
          number: gameItem.number,
          name: gameItem.name,
          multiplier: parseFloat(gameItem.multiplier)
        } : null,
        ticketCount: tickets.length,
        totalAmount: tickets.reduce((sum, t) => sum + t.amount, 0),
        tickets
      };
    } catch (error) {
      logger.error('Error obteniendo tickets por item:', error);
      throw error;
    }
  }

  /**
   * Obtener tripletas que incluyen un item específico
   * @param {string} drawId - ID del sorteo (para contexto de fecha)
   * @param {string} itemId - ID del item
   */
  async getTripletasByItem(drawId, itemId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      // Buscar tripletas activas que incluyan este item
      const tripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: draw.scheduledAt },
          OR: [
            { item1Id: itemId },
            { item2Id: itemId },
            { item3Id: itemId }
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      // Obtener los items de cada tripleta
      const itemIds = new Set();
      for (const t of tripletas) {
        itemIds.add(t.item1Id);
        itemIds.add(t.item2Id);
        itemIds.add(t.item3Id);
      }

      const items = await prisma.gameItem.findMany({
        where: { id: { in: Array.from(itemIds) } }
      });

      const itemMap = new Map(items.map(i => [i.id, i]));

      // Verificar cuántos números ya salieron para cada tripleta
      const tripletasWithDetails = await Promise.all(tripletas.map(async (t) => {
        // Obtener sorteos ejecutados en el rango de la tripleta
        const startDraw = await prisma.draw.findUnique({
          where: { id: t.startDrawId }
        });

        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            scheduledAt: {
              gte: startDraw?.scheduledAt || new Date(),
              lte: t.expiresAt
            },
            status: { in: ['DRAWN', 'PUBLISHED'] },
            winnerItemId: { not: null }
          },
          select: { 
            id: true,
            scheduledAt: true,
            winnerItemId: true 
          },
          orderBy: { scheduledAt: 'asc' }
        });

        // Obtener todos los sorteos del rango (incluyendo pendientes)
        const allDrawsInRange = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            scheduledAt: {
              gte: startDraw?.scheduledAt || new Date(),
              lte: t.expiresAt
            }
          },
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            winnerItemId: true
          },
          orderBy: { scheduledAt: 'asc' }
        });

        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        const item1Won = winnerItemIds.includes(t.item1Id);
        const item2Won = winnerItemIds.includes(t.item2Id);
        const item3Won = winnerItemIds.includes(t.item3Id);
        const numbersWon = [item1Won, item2Won, item3Won].filter(Boolean).length;

        // Encontrar en qué sorteos ganó cada número
        const item1WonIn = executedDraws.find(d => d.winnerItemId === t.item1Id);
        const item2WonIn = executedDraws.find(d => d.winnerItemId === t.item2Id);
        const item3WonIn = executedDraws.find(d => d.winnerItemId === t.item3Id);

        // Calcular peligrosidad
        let dangerLevel = 'low';
        if (numbersWon === 2) {
          dangerLevel = 'high'; // Solo falta 1 número - muy peligroso
        } else if (numbersWon === 1) {
          dangerLevel = 'medium'; // Faltan 2 números
        }

        return {
          id: t.id,
          oderId: t.userId,
          username: t.user?.username,
          amount: parseFloat(t.amount),
          multiplier: parseFloat(t.multiplier),
          potentialPrize: parseFloat(t.amount) * parseFloat(t.multiplier),
          drawsCount: t.drawsCount,
          startDrawId: t.startDrawId,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
          items: [
            { 
              ...itemMap.get(t.item1Id), 
              won: item1Won,
              wonInDraw: item1WonIn ? { id: item1WonIn.id, scheduledAt: item1WonIn.scheduledAt } : null
            },
            { 
              ...itemMap.get(t.item2Id), 
              won: item2Won,
              wonInDraw: item2WonIn ? { id: item2WonIn.id, scheduledAt: item2WonIn.scheduledAt } : null
            },
            { 
              ...itemMap.get(t.item3Id), 
              won: item3Won,
              wonInDraw: item3WonIn ? { id: item3WonIn.id, scheduledAt: item3WonIn.scheduledAt } : null
            }
          ],
          numbersWon,
          numbersRemaining: 3 - numbersWon,
          dangerLevel,
          drawsInRange: {
            total: allDrawsInRange.length,
            executed: executedDraws.length,
            pending: allDrawsInRange.filter(d => d.status === 'SCHEDULED').length,
            draws: allDrawsInRange.map(d => ({
              id: d.id,
              scheduledAt: d.scheduledAt,
              status: d.status,
              winnerItemId: d.winnerItemId,
              isRelevant: d.winnerItemId === t.item1Id || d.winnerItemId === t.item2Id || d.winnerItemId === t.item3Id
            }))
          }
        };
      }));

      return {
        drawId,
        itemId,
        item: itemMap.get(itemId) ? {
          number: itemMap.get(itemId).number,
          name: itemMap.get(itemId).name
        } : null,
        tripletaCount: tripletasWithDetails.length,
        totalPotentialPrize: tripletasWithDetails.reduce((sum, t) => sum + t.potentialPrize, 0),
        tripletas: tripletasWithDetails.sort((a, b) => a.numbersRemaining - b.numbersRemaining)
      };
    } catch (error) {
      logger.error('Error obteniendo tripletas por item:', error);
      throw error;
    }
  }
}

export default new MonitorService();
