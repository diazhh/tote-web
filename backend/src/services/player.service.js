import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import playerMovementService from './player-movement.service.js';

class PlayerService {
  /**
   * Obtener lista de jugadores
   */
  async getPlayers(options = {}) {
    const { search, limit = 50, offset = 0, status } = options;

    const where = {
      role: 'PLAYER'
    };

    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;

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
          bonusBalance: true,
          isActive: true,
          whatsappVerified: true,
          emailVerified: true,
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
        whatsappVerified: true,
        whatsappNotifications: true,
        emailVerified: true,
        balance: true,
        blockedBalance: true,
        bonusBalance: true,
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
  // ============================================
  // ADMIN ACTIONS
  // ============================================

  /**
   * Toggle player active/inactive status
   */
  async togglePlayerStatus(playerId, adminId) {
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { id: true, isActive: true, role: true, username: true }
    });

    if (!player || player.role !== 'PLAYER') {
      throw new Error('Jugador no encontrado');
    }

    const updated = await prisma.user.update({
      where: { id: playerId },
      data: { isActive: !player.isActive },
      select: { id: true, username: true, isActive: true }
    });

    logger.info('Player status toggled', { playerId, newStatus: updated.isActive, adminId });
    return updated;
  }

  /**
   * Admin update player profile
   */
  async updatePlayerProfile(playerId, data, adminId) {
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { id: true, role: true }
    });

    if (!player || player.role !== 'PLAYER') {
      throw new Error('Jugador no encontrado');
    }

    const updateData = {};
    if (data.username !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { username: data.username, id: { not: playerId } }
      });
      if (existing) throw new Error('El nombre de usuario ya está en uso');
      updateData.username = data.username;
    }
    if (data.email !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { email: data.email, id: { not: playerId } }
      });
      if (existing) throw new Error('El email ya está en uso');
      updateData.email = data.email;
      updateData.emailVerified = false;
    }
    if (data.phone !== undefined) {
      if (data.phone) {
        const existing = await prisma.user.findFirst({
          where: { phone: data.phone, id: { not: playerId } }
        });
        if (existing) throw new Error('El teléfono ya está en uso');
      }
      updateData.phone = data.phone || null;
      updateData.whatsappVerified = false;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    const updated = await prisma.user.update({
      where: { id: playerId },
      data: updateData,
      select: {
        id: true, username: true, email: true, phone: true,
        isActive: true, emailVerified: true, whatsappVerified: true
      }
    });

    logger.info('Player profile updated by admin', { playerId, adminId, fields: Object.keys(updateData) });
    return updated;
  }

  /**
   * Admin send password reset link to player
   */
  async sendPlayerResetLink(playerId, adminId) {
    const player = await prisma.user.findUnique({
      where: { id: playerId },
      select: { id: true, email: true, role: true }
    });

    if (!player || player.role !== 'PLAYER') {
      throw new Error('Jugador no encontrado');
    }

    if (!player.email) {
      throw new Error('El jugador no tiene email registrado');
    }

    const passwordResetService = (await import('./password-reset.service.js')).default;
    await passwordResetService.requestReset(player.email);

    logger.info('Password reset link sent by admin', { playerId, adminId });
    return { success: true, message: 'Enlace de recuperación enviado al correo del jugador' };
  }

  /**
   * Admin manual balance adjustment
   */
  async adjustBalance(playerId, amount, reason, adminId) {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.user.findUnique({
        where: { id: playerId },
        select: { id: true, balance: true, role: true }
      });

      if (!player || player.role !== 'PLAYER') {
        throw new Error('Jugador no encontrado');
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount === 0) {
        throw new Error('Monto inválido');
      }

      const newBalance = parseFloat(player.balance) + parsedAmount;
      if (newBalance < 0) {
        throw new Error('El ajuste dejaría el balance en negativo');
      }

      await tx.user.update({
        where: { id: playerId },
        data: { balance: { increment: parsedAmount } }
      });

      await playerMovementService.recordAdjustment(
        tx, playerId, parsedAmount, reason || 'Ajuste manual por administrador', adminId, { adminAction: true }
      );

      logger.info('Balance adjusted', { playerId, amount: parsedAmount, reason, adminId });
      return { newBalance };
    });
  }

  /**
   * Admin give bonus
   */
  async giveBonus(playerId, amount, reason, adminId) {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.user.findUnique({
        where: { id: playerId },
        select: { id: true, bonusBalance: true, role: true }
      });

      if (!player || player.role !== 'PLAYER') {
        throw new Error('Jugador no encontrado');
      }

      const parsedAmount = Math.abs(parseFloat(amount));
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Monto de bono inválido');
      }

      await tx.user.update({
        where: { id: playerId },
        data: { bonusBalance: { increment: parsedAmount } }
      });

      await playerMovementService.recordBonus(
        tx, playerId, parsedAmount, reason || 'Bonificación', adminId,
        { bonusAmount: parsedAmount }
      );

      const newBonusBalance = parseFloat(player.bonusBalance) + parsedAmount;
      logger.info('Bonus given', { playerId, amount: parsedAmount, reason, adminId });
      return { newBonusBalance };
    });
  }

  /**
   * Get player deposits (for admin view)
   */
  async getPlayerDeposits(playerId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    const where = { userId: playerId };
    if (status) where.status = status;

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        include: {
          systemPagoMovil: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.deposit.count({ where })
    ]);

    return { deposits, total, limit, offset };
  }

  /**
   * Get player withdrawals (for admin view)
   */
  async getPlayerWithdrawals(playerId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    const where = { userId: playerId };
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          pagoMovilAccount: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.withdrawal.count({ where })
    ]);

    return { withdrawals, total, limit, offset };
  }
}

export default new PlayerService();
