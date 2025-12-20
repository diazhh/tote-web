import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class PlayerQueryService {
  async getPlayerBalance(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          blockedBalance: true
        }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      return {
        balance: parseFloat(user.balance),
        blockedBalance: parseFloat(user.blockedBalance),
        availableBalance: parseFloat(user.balance) - parseFloat(user.blockedBalance)
      };
    } catch (error) {
      logger.error('Error getting player balance:', error);
      throw error;
    }
  }

  async getPlayerTransactions(userId, filters = {}) {
    try {
      const { type, status, limit = 50, offset = 0, startDate, endDate } = filters;

      const dateFilter = startDate && endDate ? {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      } : {};

      const depositWhere = {
        userId,
        ...(status && { status }),
        ...dateFilter
      };

      const withdrawalWhere = {
        userId,
        ...(status && { status }),
        ...dateFilter
      };

      const [deposits, withdrawals] = await Promise.all([
        (!type || type === 'DEPOSIT') ? prisma.deposit.findMany({
          where: depositWhere,
          orderBy: { createdAt: 'desc' },
          include: {
            systemPagoMovil: true
          }
        }) : [],
        (!type || type === 'WITHDRAWAL') ? prisma.withdrawal.findMany({
          where: withdrawalWhere,
          orderBy: { createdAt: 'desc' },
          include: {
            pagoMovilAccount: true
          }
        }) : []
      ]);

      const transactions = [
        ...deposits.map(d => ({
          id: d.id,
          type: 'DEPOSIT',
          amount: parseFloat(d.amount),
          status: d.status,
          description: `Depósito - ${d.systemPagoMovil.bank} ${d.systemPagoMovil.phone}`,
          reference: d.reference,
          createdAt: d.createdAt,
          processedAt: d.processedAt
        })),
        ...withdrawals.map(w => ({
          id: w.id,
          type: 'WITHDRAWAL',
          amount: parseFloat(w.amount),
          status: w.status,
          description: `Retiro - ${w.pagoMovilAccount.bank} ${w.pagoMovilAccount.phone}`,
          reference: w.reference,
          createdAt: w.createdAt,
          processedAt: w.processedAt,
          completedAt: w.completedAt
        }))
      ];

      transactions.sort((a, b) => b.createdAt - a.createdAt);

      const total = transactions.length;
      const paginatedTransactions = transactions.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
      );

      return {
        transactions: paginatedTransactions,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player transactions:', error);
      throw error;
    }
  }

  async getPlayerStatistics(userId) {
    try {
      const [
        totalTickets,
        activeTickets,
        wonTickets,
        lostTickets,
        totalSpent,
        totalWon,
        recentTickets
      ] = await Promise.all([
        prisma.ticket.count({
          where: { userId }
        }),
        prisma.ticket.count({
          where: { userId, status: 'ACTIVE' }
        }),
        prisma.ticket.count({
          where: { userId, status: 'WON' }
        }),
        prisma.ticket.count({
          where: { userId, status: 'LOST' }
        }),
        prisma.ticket.aggregate({
          where: { userId },
          _sum: { totalAmount: true }
        }),
        prisma.ticket.aggregate({
          where: { userId, status: 'WON' },
          _sum: { totalPrize: true }
        }),
        prisma.ticket.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
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
          }
        })
      ]);

      const totalSpentAmount = totalSpent._sum.totalAmount || 0;
      const totalWonAmount = totalWon._sum.totalPrize || 0;
      const netProfit = parseFloat(totalWonAmount) - parseFloat(totalSpentAmount);
      const winRate = totalTickets > 0 ? (wonTickets / totalTickets) * 100 : 0;

      return {
        summary: {
          totalTickets,
          activeTickets,
          wonTickets,
          lostTickets,
          totalSpent: parseFloat(totalSpentAmount),
          totalWon: parseFloat(totalWonAmount),
          netProfit,
          winRate: parseFloat(winRate.toFixed(2))
        },
        recentTickets: recentTickets.map(ticket => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          totalAmount: parseFloat(ticket.totalAmount),
          totalPrize: parseFloat(ticket.totalPrize || 0),
          createdAt: ticket.createdAt,
          draw: {
            id: ticket.draw.id,
            gameName: ticket.draw.game.name,
            drawDate: ticket.draw.drawDate,
            status: ticket.draw.status,
            winnerNumber: ticket.draw.winnerItem?.number || null
          },
          details: ticket.details.map(detail => ({
            number: detail.gameItem.number,
            amount: parseFloat(detail.amount),
            multiplier: parseFloat(detail.multiplier),
            prize: parseFloat(detail.prize || 0),
            status: detail.status
          }))
        }))
      };
    } catch (error) {
      logger.error('Error getting player statistics:', error);
      throw error;
    }
  }

  async getPlayerTickets(userId, filters = {}) {
    try {
      const { status, drawId, limit = 20, offset = 0 } = filters;

      const where = {
        userId,
        ...(status && { status }),
        ...(drawId && { drawId })
      };

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
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
          }
        }),
        prisma.ticket.count({ where })
      ]);

      return {
        tickets: tickets.map(ticket => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          totalAmount: parseFloat(ticket.totalAmount),
          totalPrize: parseFloat(ticket.totalPrize || 0),
          createdAt: ticket.createdAt,
          draw: {
            id: ticket.draw.id,
            gameName: ticket.draw.game.name,
            drawDate: ticket.draw.drawDate,
            status: ticket.draw.status,
            winnerNumber: ticket.draw.winnerItem?.number || null
          },
          details: ticket.details.map(detail => ({
            id: detail.id,
            number: detail.gameItem.number,
            amount: parseFloat(detail.amount),
            multiplier: parseFloat(detail.multiplier),
            prize: parseFloat(detail.prize || 0),
            status: detail.status
          }))
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player tickets:', error);
      throw error;
    }
  }

  async getPlayerDeposits(userId, filters = {}) {
    try {
      const { status, limit = 20, offset = 0 } = filters;

      const where = {
        userId,
        ...(status && { status })
      };

      const [deposits, total] = await Promise.all([
        prisma.deposit.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
          include: {
            systemPagoMovil: true
          }
        }),
        prisma.deposit.count({ where })
      ]);

      return {
        deposits: deposits.map(deposit => ({
          id: deposit.id,
          amount: parseFloat(deposit.amount),
          reference: deposit.reference,
          phone: deposit.phone,
          bankCode: deposit.bankCode,
          status: deposit.status,
          notes: deposit.notes,
          createdAt: deposit.createdAt,
          processedAt: deposit.processedAt,
          systemPagoMovil: {
            bank: deposit.systemPagoMovil.bank,
            phone: deposit.systemPagoMovil.phone,
            idNumber: deposit.systemPagoMovil.idNumber
          }
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player deposits:', error);
      throw error;
    }
  }

  async getPlayerWithdrawals(userId, filters = {}) {
    try {
      const { status, limit = 20, offset = 0 } = filters;

      const where = {
        userId,
        ...(status && { status })
      };

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
          include: {
            pagoMovilAccount: true
          }
        }),
        prisma.withdrawal.count({ where })
      ]);

      return {
        withdrawals: withdrawals.map(withdrawal => ({
          id: withdrawal.id,
          amount: parseFloat(withdrawal.amount),
          reference: withdrawal.reference,
          status: withdrawal.status,
          notes: withdrawal.notes,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt,
          completedAt: withdrawal.completedAt,
          pagoMovilAccount: {
            bank: withdrawal.pagoMovilAccount.bank,
            phone: withdrawal.pagoMovilAccount.phone,
            idNumber: withdrawal.pagoMovilAccount.idNumber
          }
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player withdrawals:', error);
      throw error;
    }
  }

  async getBalanceHistory(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Get all transactions: deposits, tickets, and prizes
      const [deposits, tickets] = await Promise.all([
        prisma.deposit.findMany({
          where: { 
            userId,
            status: 'APPROVED'
          },
          orderBy: { processedAt: 'desc' },
          include: {
            systemPagoMovil: true
          }
        }),
        prisma.ticket.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          include: {
            draw: {
              include: {
                game: true
              }
            }
          }
        })
      ]);

      // Build transaction history
      const transactions = [];
      let runningBalance = 0;

      // Add deposits
      deposits.forEach(deposit => {
        transactions.push({
          id: deposit.id,
          type: 'DEPOSIT',
          amount: parseFloat(deposit.amount),
          description: `Depósito vía Pago Móvil`,
          reference: deposit.reference,
          createdAt: deposit.processedAt || deposit.createdAt,
          balance: 0 // Will be calculated later
        });
      });

      // Add tickets (debits)
      tickets.forEach(ticket => {
        transactions.push({
          id: ticket.id,
          type: 'TICKET',
          amount: parseFloat(ticket.totalAmount),
          description: `Jugada - ${ticket.draw.game.name}`,
          reference: ticket.ticketNumber,
          createdAt: ticket.createdAt,
          balance: 0 // Will be calculated later
        });

        // Add prize if won
        if (ticket.status === 'WON' && parseFloat(ticket.totalPrize || 0) > 0) {
          transactions.push({
            id: `${ticket.id}-prize`,
            type: 'PRIZE',
            amount: parseFloat(ticket.totalPrize),
            description: `Premio - ${ticket.draw.game.name}`,
            reference: ticket.ticketNumber,
            createdAt: ticket.updatedAt || ticket.createdAt,
            balance: 0 // Will be calculated later
          });
        }
      });

      // Sort by date (oldest first) to calculate running balance
      transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Calculate running balance
      transactions.forEach(transaction => {
        if (transaction.type === 'DEPOSIT' || transaction.type === 'PRIZE') {
          runningBalance += transaction.amount;
        } else if (transaction.type === 'TICKET') {
          runningBalance -= transaction.amount;
        }
        transaction.balance = runningBalance;
      });

      // Sort by date (newest first) for display
      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return {
        currentBalance: parseFloat(user.balance),
        transactions
      };
    } catch (error) {
      logger.error('Error getting balance history:', error);
      throw error;
    }
  }
}

export default new PlayerQueryService();
