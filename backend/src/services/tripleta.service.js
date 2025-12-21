/**
 * Servicio para gestión de apuestas Tripleta
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export class TripletaService {
  /**
   * Crear una apuesta tripleta
   * @param {Object} data - Datos de la apuesta
   * @returns {Promise<Object>}
   */
  async createTripleBet(data) {
    try {
      const { userId, gameId, item1Id, item2Id, item3Id, amount } = data;

      // Validar que el juego existe y tiene tripleta habilitada
      const game = await prisma.game.findUnique({
        where: { id: gameId },
      });

      if (!game) {
        throw new Error('Juego no encontrado');
      }

      if (!game.isActive) {
        throw new Error('El juego no está activo');
      }

      const tripletaConfig = game.config?.tripleta;
      if (!tripletaConfig || !tripletaConfig.enabled) {
        throw new Error('La modalidad Tripleta no está habilitada para este juego');
      }

      // Validar que los 3 items son diferentes
      if (item1Id === item2Id || item1Id === item3Id || item2Id === item3Id) {
        throw new Error('Los tres números deben ser diferentes');
      }

      // Validar que los items existen y pertenecen al juego
      const items = await prisma.gameItem.findMany({
        where: {
          id: { in: [item1Id, item2Id, item3Id] },
          gameId: gameId,
          isActive: true,
        },
      });

      if (items.length !== 3) {
        throw new Error('Uno o más números seleccionados no son válidos');
      }

      // Validar que el usuario tiene saldo suficiente
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      if (user.balance < amount) {
        throw new Error('Saldo insuficiente');
      }

      // Obtener los próximos sorteos programados
      const nextDraws = await prisma.draw.findMany({
        where: {
          gameId: gameId,
          status: 'SCHEDULED',
          scheduledAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          scheduledAt: 'asc',
        },
        take: tripletaConfig.drawsCount,
      });

      if (nextDraws.length < tripletaConfig.drawsCount) {
        throw new Error(`No hay suficientes sorteos programados. Se requieren ${tripletaConfig.drawsCount} sorteos.`);
      }

      const startDrawId = nextDraws[0].id;
      const endDrawId = nextDraws[nextDraws.length - 1].id;
      const expiresAt = nextDraws[nextDraws.length - 1].scheduledAt;

      // Crear la apuesta en una transacción
      const result = await prisma.$transaction(async (tx) => {
        // Descontar el saldo del usuario
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              decrement: amount,
            },
          },
        });

        // Crear la apuesta tripleta
        const tripleBet = await tx.tripleBet.create({
          data: {
            userId,
            gameId,
            item1Id,
            item2Id,
            item3Id,
            amount,
            multiplier: tripletaConfig.multiplier,
            drawsCount: tripletaConfig.drawsCount,
            startDrawId,
            endDrawId,
            expiresAt,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                balance: true,
              },
            },
          },
        });

        return tripleBet;
      });

      logger.info(`Apuesta Tripleta creada: ${result.id} - Usuario: ${userId} - Juego: ${gameId}`);
      return result;
    } catch (error) {
      logger.error('Error creando apuesta tripleta:', error);
      throw error;
    }
  }

  /**
   * Obtener apuestas tripleta de un usuario
   * @param {string} userId - ID del usuario
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Array>}
   */
  async getUserTripleBets(userId, filters = {}) {
    try {
      const where = { userId };

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.gameId) {
        where.gameId = filters.gameId;
      }

      const tripleBets = await prisma.tripleBet.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      });

      return tripleBets;
    } catch (error) {
      logger.error('Error obteniendo apuestas tripleta del usuario:', error);
      throw error;
    }
  }

  /**
   * Obtener una apuesta tripleta por ID
   * @param {string} id - ID de la apuesta
   * @returns {Promise<Object|null>}
   */
  async getTripleBetById(id) {
    try {
      const tripleBet = await prisma.tripleBet.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return tripleBet;
    } catch (error) {
      logger.error(`Error obteniendo apuesta tripleta ${id}:`, error);
      throw error;
    }
  }

  /**
   * Verificar apuestas tripleta activas contra un sorteo ejecutado
   * @param {string} drawId - ID del sorteo
   * @returns {Promise<Object>}
   */
  async checkTripleBetsForDraw(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          winnerItem: true,
        },
      });

      if (!draw || !draw.winnerItemId) {
        throw new Error('Sorteo no encontrado o sin ganador');
      }

      // Obtener todas las apuestas tripleta activas para este juego
      // que tengan este sorteo en su rango
      const activeTripleBets = await prisma.tripleBet.findMany({
        where: {
          gameId: draw.gameId,
          status: 'ACTIVE',
          startDrawId: {
            lte: drawId,
          },
          expiresAt: {
            gte: draw.scheduledAt,
          },
        },
      });

      logger.info(`Verificando ${activeTripleBets.length} apuestas tripleta activas para sorteo ${drawId}`);

      let winnersCount = 0;
      let losersCount = 0;

      for (const bet of activeTripleBets) {
        // Obtener todos los sorteos en el rango de esta apuesta que ya fueron ejecutados
        const executedDraws = await prisma.draw.findMany({
          where: {
            gameId: draw.gameId,
            scheduledAt: {
              gte: (await prisma.draw.findUnique({ where: { id: bet.startDrawId } })).scheduledAt,
              lte: bet.expiresAt,
            },
            status: { in: ['DRAWN', 'PUBLISHED'] },
            winnerItemId: { not: null },
          },
          select: {
            id: true,
            winnerItemId: true,
          },
        });

        // Verificar si los 3 números han salido
        const winnerItemIds = executedDraws.map(d => d.winnerItemId);
        const hasItem1 = winnerItemIds.includes(bet.item1Id);
        const hasItem2 = winnerItemIds.includes(bet.item2Id);
        const hasItem3 = winnerItemIds.includes(bet.item3Id);

        if (hasItem1 && hasItem2 && hasItem3) {
          // ¡Ganador!
          const prize = bet.amount * bet.multiplier;
          
          await prisma.$transaction(async (tx) => {
            // Actualizar la apuesta
            await tx.tripleBet.update({
              where: { id: bet.id },
              data: {
                status: 'WON',
                winnerDrawId: drawId,
                prize: prize,
              },
            });

            // Acreditar el premio al usuario
            await tx.user.update({
              where: { id: bet.userId },
              data: {
                balance: {
                  increment: prize,
                },
              },
            });
          });

          winnersCount++;
          logger.info(`Apuesta Tripleta ganadora: ${bet.id} - Premio: ${prize}`);
        } else if (executedDraws.length >= bet.drawsCount) {
          // Ya se ejecutaron todos los sorteos y no ganó
          await prisma.tripleBet.update({
            where: { id: bet.id },
            data: {
              status: 'EXPIRED',
            },
          });

          losersCount++;
          logger.info(`Apuesta Tripleta expirada: ${bet.id}`);
        }
      }

      return {
        checked: activeTripleBets.length,
        winners: winnersCount,
        expired: losersCount,
      };
    } catch (error) {
      logger.error('Error verificando apuestas tripleta:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de tripletas para un juego
   * @param {string} gameId - ID del juego
   * @returns {Promise<Object>}
   */
  async getGameTripletaStats(gameId) {
    try {
      const [total, active, won, lost, totalAmount, totalPrizes] = await Promise.all([
        prisma.tripleBet.count({ where: { gameId } }),
        prisma.tripleBet.count({ where: { gameId, status: 'ACTIVE' } }),
        prisma.tripleBet.count({ where: { gameId, status: 'WON' } }),
        prisma.tripleBet.count({ where: { gameId, status: { in: ['LOST', 'EXPIRED'] } } }),
        prisma.tripleBet.aggregate({
          where: { gameId },
          _sum: { amount: true },
        }),
        prisma.tripleBet.aggregate({
          where: { gameId, status: 'WON' },
          _sum: { prize: true },
        }),
      ]);

      return {
        total,
        active,
        won,
        lost,
        totalAmount: totalAmount._sum.amount || 0,
        totalPrizes: totalPrizes._sum.prize || 0,
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de tripletas:', error);
      throw error;
    }
  }
}

export default new TripletaService();
