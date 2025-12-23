import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import taquillaWebService from './taquilla-web.service.js';

class TicketService {
  async create(userId, data) {
    try {
      const ticket = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new Error('Usuario no encontrado');
        }

        const draw = await tx.draw.findUnique({
          where: { id: data.drawId },
          include: { game: true }
        });

        if (!draw) {
          throw new Error('Sorteo no encontrado');
        }

        if (draw.status !== 'SCHEDULED') {
          throw new Error('Solo puedes jugar en sorteos programados (SCHEDULED)');
        }

        if (new Date() >= new Date(draw.closeTime)) {
          throw new Error('El sorteo ya cerró');
        }

        if (!data.details || data.details.length === 0) {
          throw new Error('Debes incluir al menos una jugada');
        }

        let totalAmount = 0;
        const detailsToCreate = [];

        for (const detail of data.details) {
          if (!detail.gameItemId || !detail.amount) {
            throw new Error('Cada jugada debe tener gameItemId y amount');
          }

          if (detail.amount <= 0) {
            throw new Error('El monto de cada jugada debe ser mayor a 0');
          }

          const gameItem = await tx.gameItem.findUnique({
            where: { id: detail.gameItemId }
          });

          if (!gameItem) {
            throw new Error(`Item de juego ${detail.gameItemId} no encontrado`);
          }

          if (gameItem.gameId !== draw.gameId) {
            throw new Error(`El item ${gameItem.number} no pertenece al juego del sorteo`);
          }

          totalAmount += parseFloat(detail.amount);

          detailsToCreate.push({
            gameItemId: detail.gameItemId,
            amount: detail.amount,
            multiplier: gameItem.multiplier,
            status: 'ACTIVE'
          });
        }

        const availableBalance = user.balance - user.blockedBalance;
        
        if (availableBalance < totalAmount) {
          throw new Error(`Saldo insuficiente. Disponible: ${availableBalance}, Requerido: ${totalAmount}`);
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              decrement: totalAmount
            }
          }
        });

        const createdTicket = await tx.ticket.create({
          data: {
            userId,
            drawId: data.drawId,
            totalAmount,
            status: 'ACTIVE',
            details: {
              create: detailsToCreate
            }
          },
          include: {
            details: {
              include: {
                gameItem: true
              }
            },
            draw: {
              include: {
                game: true
              }
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                balance: true
              }
            }
          }
        });

        logger.info('Ticket created', { 
          id: createdTicket.id, 
          userId, 
          drawId: data.drawId,
          totalAmount,
          detailsCount: detailsToCreate.length
        });

        return createdTicket;
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      const where = {};
      
      if (filters.userId) {
        where.userId = filters.userId;
      }
      
      if (filters.drawId) {
        where.drawId = filters.drawId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          draw: {
            include: {
              game: true,
              winnerItem: true
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return tickets;
    } catch (error) {
      logger.error('Error fetching tickets:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          draw: {
            include: {
              game: true,
              winnerItem: true
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              balance: true
            }
          }
        }
      });

      return ticket;
    } catch (error) {
      logger.error('Error fetching ticket:', error);
      throw error;
    }
  }

  async getUserTickets(userId, filters = {}) {
    try {
      const where = { userId };

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.drawId) {
        where.drawId = filters.drawId;
      }

      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          draw: {
            include: {
              game: true,
              winnerItem: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return tickets;
    } catch (error) {
      logger.error('Error fetching user tickets:', error);
      throw error;
    }
  }

  async getTicketsByDraw(drawId) {
    try {
      const tickets = await prisma.ticket.findMany({
        where: { drawId },
        include: {
          details: {
            include: {
              gameItem: true
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return tickets;
    } catch (error) {
      logger.error('Error fetching tickets by draw:', error);
      throw error;
    }
  }

  async cancel(id, userId) {
    try {
      return await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
          where: { id },
          include: { 
            draw: true,
            details: true
          }
        });

        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }

        if (ticket.userId !== userId) {
          throw new Error('Este ticket no te pertenece');
        }

        if (ticket.status !== 'ACTIVE') {
          throw new Error('Solo puedes cancelar tickets activos');
        }

        if (ticket.draw.status !== 'SCHEDULED') {
          throw new Error('No puedes cancelar tickets de sorteos que ya cerraron o se ejecutaron');
        }

        if (new Date() >= new Date(ticket.draw.closeTime)) {
          throw new Error('No puedes cancelar tickets después de que el sorteo cerró');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              increment: ticket.totalAmount
            }
          }
        });

        await tx.ticketDetail.updateMany({
          where: { ticketId: id },
          data: { status: 'LOST' }
        });

        const updatedTicket = await tx.ticket.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: {
            details: {
              include: {
                gameItem: true
              }
            },
            draw: {
              include: {
                game: true
              }
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                balance: true
              }
            }
          }
        });

        logger.info('Ticket cancelled', { id, userId, refundAmount: ticket.totalAmount });
        return updatedTicket;
      });
    } catch (error) {
      logger.error('Error cancelling ticket:', error);
      throw error;
    }
  }

  async getStatsByDraw(drawId) {
    try {
      const stats = await prisma.ticket.aggregate({
        where: { drawId },
        _sum: {
          totalAmount: true,
          totalPrize: true
        },
        _count: true
      });

      const ticketsByStatus = await prisma.ticket.groupBy({
        by: ['status'],
        where: { drawId },
        _count: true
      });

      const topPlays = await prisma.ticketDetail.groupBy({
        by: ['gameItemId'],
        where: {
          ticket: {
            drawId
          }
        },
        _sum: {
          amount: true
        },
        _count: true,
        orderBy: {
          _sum: {
            amount: 'desc'
          }
        },
        take: 10
      });

      const gameItems = await prisma.gameItem.findMany({
        where: {
          id: {
            in: topPlays.map(tp => tp.gameItemId)
          }
        }
      });

      const topPlaysWithItems = topPlays.map(tp => ({
        ...tp,
        gameItem: gameItems.find(gi => gi.id === tp.gameItemId)
      }));

      return {
        totalTickets: stats._count,
        totalSales: stats._sum.totalAmount || 0,
        totalPrizes: stats._sum.totalPrize || 0,
        ticketsByStatus,
        topPlays: topPlaysWithItems
      };
    } catch (error) {
      logger.error('Error fetching stats by draw:', error);
      throw error;
    }
  }
}

export default new TicketService();
