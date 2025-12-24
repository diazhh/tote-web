import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class PlayerService {
  /**
   * Obtener lista de jugadores
   */
  async getPlayers(options = {}) {
    const { search, limit = 50, offset = 0 } = options;

    const where = {
      role: 'PLAYER'
    };

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [players, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          balance: true,
          blockedBalance: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      }),
      prisma.user.count({ where })
    ]);

    return {
      players,
      total,
      limit,
      offset
    };
  }

  /**
   * Obtener detalles completos de un jugador
   */
  async getPlayerDetails(playerId) {
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        phoneVerified: true,
        balance: true,
        blockedBalance: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        role: true
      }
    });

    if (!player || player.role !== 'PLAYER') {
      return null;
    }

    // Obtener estadísticas
    const [ticketStats, tripletaStats, deposits, withdrawals] = await Promise.all([
      // Estadísticas de tickets
      prisma.ticket.aggregate({
        where: { userId: playerId },
        _count: { id: true },
        _sum: { totalAmount: true, totalPrize: true }
      }),
      // Estadísticas de tripletas
      prisma.tripleBet.aggregate({
        where: { userId: playerId },
        _count: { id: true },
        _sum: { amount: true, prize: true }
      }),
      // Depósitos
      prisma.deposit.aggregate({
        where: { userId: playerId, status: 'APPROVED' },
        _count: { id: true },
        _sum: { amount: true }
      }),
      // Retiros
      prisma.withdrawal.aggregate({
        where: { userId: playerId, status: 'COMPLETED' },
        _count: { id: true },
        _sum: { amount: true }
      })
    ]);

    // Tickets ganadores
    const winningTickets = await prisma.ticket.count({
      where: {
        userId: playerId,
        status: 'WON'
      }
    });

    // Tripletas ganadoras
    const winningTripletas = await prisma.tripleBet.count({
      where: {
        userId: playerId,
        status: 'WON'
      }
    });

    // Últimos tickets
    const recentTickets = await prisma.ticket.findMany({
      where: { userId: playerId },
      include: {
        draw: {
          include: {
            game: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    // Últimas tripletas
    const recentTripletasRaw = await prisma.tripleBet.findMany({
      where: { userId: playerId },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    // Obtener información del juego para cada tripleta
    const recentTripletas = await Promise.all(
      recentTripletasRaw.map(async (tripleta) => {
        const [game, item1, item2, item3] = await Promise.all([
          prisma.game.findUnique({ where: { id: tripleta.gameId } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item1Id } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item2Id } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item3Id } })
        ]);

        return {
          ...tripleta,
          game,
          item1,
          item2,
          item3
        };
      })
    );

    return {
      player,
      stats: {
        tickets: {
          total: ticketStats._count.id || 0,
          won: winningTickets,
          totalBet: parseFloat(ticketStats._sum.totalAmount || 0),
          totalPrize: parseFloat(ticketStats._sum.totalPrize || 0)
        },
        tripletas: {
          total: tripletaStats._count.id || 0,
          won: winningTripletas,
          totalBet: parseFloat(tripletaStats._sum.amount || 0),
          totalPrize: parseFloat(tripletaStats._sum.prize || 0)
        },
        deposits: {
          total: deposits._count.id || 0,
          totalAmount: parseFloat(deposits._sum.amount || 0)
        },
        withdrawals: {
          total: withdrawals._count.id || 0,
          totalAmount: parseFloat(withdrawals._sum.amount || 0)
        }
      },
      recentTickets,
      recentTripletas
    };
  }

  /**
   * Obtener tickets de un jugador
   */
  async getPlayerTickets(playerId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    const where = { userId: playerId };
    if (status) {
      where.status = status;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          draw: {
            include: {
              game: true,
              winnerItem: true
            }
          },
          details: {
            include: {
              gameItem: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      }),
      prisma.ticket.count({ where })
    ]);

    return {
      tickets,
      total,
      limit,
      offset
    };
  }

  /**
   * Obtener tripletas de un jugador
   */
  async getPlayerTripletas(playerId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    const where = { userId: playerId };
    if (status) {
      where.status = status;
    }

    const [tripletas, total] = await Promise.all([
      prisma.tripleBet.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      }),
      prisma.tripleBet.count({ where })
    ]);

    // Obtener información adicional manualmente
    const tripletasWithDetails = await Promise.all(
      tripletas.map(async (tripleta) => {
        const [game, item1, item2, item3] = await Promise.all([
          prisma.game.findUnique({ where: { id: tripleta.gameId } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item1Id } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item2Id } }),
          prisma.gameItem.findUnique({ where: { id: tripleta.item3Id } })
        ]);

        return {
          ...tripleta,
          game,
          item1,
          item2,
          item3
        };
      })
    );

    return {
      tripletas: tripletasWithDetails,
      total,
      limit,
      offset
    };
  }
}

export default new PlayerService();
