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
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
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
      // Construir fecha/hora completa del sorteo para comparar con expiresAt
      const drawDateTime = new Date(draw.drawDate);
      const [hours, minutes] = draw.drawTime.split(':');
      drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Obtener sorteos anteriores ejecutados (para verificar números ganados)
      // Esta consulta se hace una sola vez para todas las tripletas
      const previousDraws = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lt: draw.drawTime } }
          ],
          status: 'DRAWN',
          winnerItemId: { not: null }
        },
        orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
        take: 11,
        select: { winnerItemId: true }
      });
      
      const previousWinnerIds = previousDraws.map(d => d.winnerItemId);

      // 1. Tripletas locales (TripleBet)
      const activeTripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: drawDateTime }
        }
      });

      // Contar tripletas locales por item
      // Solo contar tripletas que ganarían en ESTE sorteo específico (les falta solo 1 número)
      for (const tripleta of activeTripletas) {
        const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
        const tripletaPrize = parseFloat(tripleta.amount) * parseFloat(tripleta.multiplier);

        const numbersAlreadyWon = itemIds.filter(id => previousWinnerIds.includes(id)).length;
        
        // Solo contar si le falta exactamente 1 número (2 ya ganaron)
        if (numbersAlreadyWon === 2) {
          // Encontrar qué número falta
          const missingItemId = itemIds.find(id => !previousWinnerIds.includes(id));
          
          const item = itemMap.get(missingItemId);
          if (item) {
            item.tripletaCount += 1;
            item.tripletaPrize += tripletaPrize;
          }
        }
      }

      // 2. Tripletas externas de SRQ (Ticket con source EXTERNAL_API y type TRIPLETA)
      // Las tripletas de SRQ son válidas para 11 sorteos consecutivos desde el primer sorteo después de jugarse
      // Necesitamos buscar tripletas de sorteos anteriores que aún estén dentro de su ventana de validez
      
      // Obtener los 11 sorteos anteriores (incluyendo el actual) para determinar qué tripletas están activas
      const previousDrawsForSearch = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lte: draw.drawTime } }
          ]
        },
        orderBy: [
          { drawDate: 'desc' },
          { drawTime: 'desc' }
        ],
        take: 11,
        select: { id: true, drawDate: true, drawTime: true }
      });

      const drawIdsToSearch = previousDrawsForSearch.map(d => d.id);

      // Buscar tripletas asociadas a cualquiera de estos sorteos
      // Filtrar solo ACTIVE porque las WON/LOST ya no participan
      const externalTripletaTickets = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          },
          drawId: { in: drawIdsToSearch }
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          draw: {
            select: {
              drawDate: true,
              drawTime: true
            }
          }
        }
      });

      // Contar tripletas externas por item
      // Solo contar tripletas que ganarían en ESTE sorteo específico (les falta solo 1 número)
      for (const ticket of externalTripletaTickets) {
        // Cada ticket de tripleta tiene 3 detalles (los 3 números)
        const tripletaPrize = parseFloat(ticket.totalAmount) * parseFloat(ticket.details[0]?.multiplier || 50); // multiplier default 50x
        
        // Obtener los 3 números de la tripleta
        const tripletaItemIds = ticket.details.map(d => d.gameItemId);
        
        const numbersAlreadyWon = tripletaItemIds.filter(id => previousWinnerIds.includes(id)).length;
        
        // Solo contar si le falta exactamente 1 número (2 ya ganaron)
        // Esto significa que si este sorteo gana uno de los números faltantes, la tripleta se completa
        if (numbersAlreadyWon === 2) {
          // Encontrar qué número falta
          const missingItemId = tripletaItemIds.find(id => !previousWinnerIds.includes(id));
          
          const item = itemMap.get(missingItemId);
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
        drawDate: draw.drawDate,
        drawTime: draw.drawTime,
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
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ]
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
          drawDate: draw.drawDate,
          drawTime: draw.drawTime,
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
      // Construir fecha/hora completa del sorteo
      const drawDateTime = new Date(draw.drawDate);
      const [hours, minutes] = draw.drawTime.split(':');
      drawDateTime.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // 1. Tripletas locales (TripleBet)
      const tripletas = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          expiresAt: { gte: drawDateTime },
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

      // 2. Tripletas externas de SRQ (Ticket)
      // Las tripletas de SRQ son válidas para 11 sorteos consecutivos
      // Buscar en los últimos 11 sorteos
      const previousDrawsForItem = await prisma.draw.findMany({
        where: {
          gameId: draw.gameId,
          OR: [
            { drawDate: { lt: draw.drawDate } },
            { drawDate: draw.drawDate, drawTime: { lte: draw.drawTime } }
          ]
        },
        orderBy: [
          { drawDate: 'desc' },
          { drawTime: 'desc' }
        ],
        take: 11,
        select: { id: true }
      });

      const drawIdsForItem = previousDrawsForItem.map(d => d.id);

      const externalTripletas = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          },
          drawId: { in: drawIdsForItem },
          details: {
            some: {
              gameItemId: itemId
            }
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

      // Obtener los items de cada tripleta local
      const itemIds = new Set();
      for (const t of tripletas) {
        itemIds.add(t.item1Id);
        itemIds.add(t.item2Id);
        itemIds.add(t.item3Id);
      }

      // Agregar items de tripletas externas
      for (const ticket of externalTripletas) {
        for (const detail of ticket.details) {
          itemIds.add(detail.gameItemId);
        }
      }

      const items = await prisma.gameItem.findMany({
        where: { id: { in: Array.from(itemIds) } }
      });

      const itemMap = new Map(items.map(i => [i.id, i]));

      // Verificar cuántos números ya salieron para cada tripleta LOCAL
      const tripletasWithDetails = await Promise.all(tripletas.map(async (t) => {
        // Obtener sorteos ejecutados en el rango de la tripleta
        const startDraw = await prisma.draw.findUnique({
          where: { id: t.startDrawId }
        });

        // Construir fecha/hora del sorteo inicial
        const startDateTime = new Date(startDraw.drawDate);
        const [startHours, startMinutes] = startDraw.drawTime.split(':');
        startDateTime.setUTCHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
        
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: new Date(t.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z' } }
            ],
            status: 'DRAWN',
            winnerItemId: { not: null }
          },
          select: { 
            id: true,
            drawDate: true,
            drawTime: true,
            winnerItemId: true 
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ]
        });

        // Obtener todos los sorteos del rango (incluyendo pendientes)
        const allDrawsInRange = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate, lte: new Date(t.expiresAt).toISOString().split('T')[0] + 'T00:00:00.000Z' } }
            ]
          },
          select: {
            id: true,
            drawDate: true,
            drawTime: true,
            status: true,
            winnerItemId: true
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ]
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
              wonInDraw: item1WonIn ? { id: item1WonIn.id, drawDate: item1WonIn.drawDate, drawTime: item1WonIn.drawTime } : null
            },
            { 
              ...itemMap.get(t.item2Id), 
              won: item2Won,
              wonInDraw: item2WonIn ? { id: item2WonIn.id, drawDate: item2WonIn.drawDate, drawTime: item2WonIn.drawTime } : null
            },
            { 
              ...itemMap.get(t.item3Id), 
              won: item3Won,
              wonInDraw: item3WonIn ? { id: item3WonIn.id, drawDate: item3WonIn.drawDate, drawTime: item3WonIn.drawTime } : null
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
              drawDate: d.drawDate,
              drawTime: d.drawTime,
              status: d.status,
              winnerItemId: d.winnerItemId,
              isRelevant: d.winnerItemId === t.item1Id || d.winnerItemId === t.item2Id || d.winnerItemId === t.item3Id
            }))
          }
        };
      }));

      // Procesar tripletas EXTERNAS de SRQ
      const externalTripletasWithDetails = await Promise.all(externalTripletas.map(async (ticket) => {
        const details = ticket.details;
        const itemIds = details.map(d => d.gameItemId);
        
        // Obtener el sorteo inicial (donde está asociada la tripleta)
        const startDraw = await prisma.draw.findUnique({
          where: { id: ticket.drawId },
          select: { drawDate: true, drawTime: true }
        });

        // Obtener los siguientes 11 sorteos desde el sorteo inicial
        const allDrawsInRange = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate } }
            ]
          },
          select: {
            id: true,
            drawDate: true,
            drawTime: true,
            status: true,
            winnerItemId: true
          },
          orderBy: [
            { drawDate: 'asc' },
            { drawTime: 'asc' }
          ],
          take: 11
        });

        // Filtrar solo los sorteos ejecutados
        const executedDraws = allDrawsInRange.filter(d => 
          d.status === 'DRAWN' && d.winnerItemId
        );

        // Verificar cuántos números han ganado
        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        const itemsWonStatus = itemIds.map(itemId => {
          const wonDraw = executedDraws.find(d => d.winnerItemId === itemId);
          return {
            itemId,
            won: !!wonDraw,
            wonInDraw: wonDraw ? { 
              id: wonDraw.id, 
              drawDate: wonDraw.drawDate, 
              drawTime: wonDraw.drawTime 
            } : null
          };
        });

        const numbersWon = itemsWonStatus.filter(i => i.won).length;

        // Calcular peligrosidad
        let dangerLevel = 'low';
        if (numbersWon === 2) {
          dangerLevel = 'high'; // Solo falta 1 número - muy peligroso
        } else if (numbersWon === 1) {
          dangerLevel = 'medium'; // Faltan 2 números
        }
        
        // Calcular estado de la tripleta
        const pendingDraws = allDrawsInRange.filter(d => d.status === 'SCHEDULED').length;
        let status = 'ACTIVE';
        if (numbersWon === 3) {
          status = 'WON';
        } else if (pendingDraws === 0 && numbersWon < 3) {
          status = 'LOST';
        }
        
        return {
          id: ticket.providerData?.ticketID || ticket.id, // Mostrar ticketID de SRQ en lugar del ID de DB
          userId: null,
          username: ticket.providerData?.taquillaID ? `Taquilla ${ticket.providerData.taquillaID}` : 'SRQ',
          amount: parseFloat(ticket.totalAmount),
          multiplier: parseFloat(details[0]?.multiplier || 50),
          potentialPrize: parseFloat(ticket.totalAmount) * parseFloat(details[0]?.multiplier || 50),
          drawsCount: 11, // Tripletas de SRQ son válidas por 11 sorteos
          startDrawId: ticket.drawId,
          expiresAt: null,
          createdAt: ticket.createdAt,
          status,
          items: details.map((d, idx) => ({
            ...itemMap.get(d.gameItemId),
            won: itemsWonStatus[idx].won,
            wonInDraw: itemsWonStatus[idx].wonInDraw
          })),
          numbersWon,
          numbersRemaining: 3 - numbersWon,
          dangerLevel,
          source: 'EXTERNAL_API',
          providerData: ticket.providerData,
          drawsInRange: {
            total: allDrawsInRange.length,
            executed: executedDraws.length,
            pending: pendingDraws,
            draws: allDrawsInRange.map(d => ({
              id: d.id,
              drawDate: d.drawDate,
              drawTime: d.drawTime,
              status: d.status,
              winnerItemId: d.winnerItemId,
              isRelevant: itemIds.includes(d.winnerItemId)
            }))
          }
        };
      }));

      // Combinar tripletas locales y externas
      const allTripletas = [...tripletasWithDetails, ...externalTripletasWithDetails];

      return {
        drawId,
        itemId,
        item: itemMap.get(itemId) ? {
          number: itemMap.get(itemId).number,
          name: itemMap.get(itemId).name
        } : null,
        tripletaCount: allTripletas.length,
        totalPotentialPrize: allTripletas.reduce((sum, t) => sum + t.potentialPrize, 0),
        tripletas: allTripletas.sort((a, b) => a.numbersRemaining - b.numbersRemaining)
      };
    } catch (error) {
      logger.error('Error obteniendo tripletas por item:', error);
      throw error;
    }
  }
}

export default new MonitorService();
