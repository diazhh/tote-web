import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class DepositService {
  async create(userId, data) {
    try {
      const deposit = await prisma.deposit.create({
        data: {
          userId,
          systemPagoMovilId: data.systemPagoMovilId,
          amount: data.amount,
          reference: data.reference,
          phone: data.phone,
          bankCode: data.bankCode,
          status: 'PENDING'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true
            }
          },
          systemPagoMovil: true
        }
      });

      logger.info('Deposit created', { id: deposit.id, userId, amount: deposit.amount });
      return deposit;
    } catch (error) {
      logger.error('Error creating deposit:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      const where = {};
      
      if (filters.userId) {
        where.userId = filters.userId;
      }
      
      if (filters.status) {
        where.status = filters.status;
      }

      const deposits = await prisma.deposit.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true
            }
          },
          systemPagoMovil: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return deposits;
    } catch (error) {
      logger.error('Error fetching deposits:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const deposit = await prisma.deposit.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              balance: true
            }
          },
          systemPagoMovil: true
        }
      });

      return deposit;
    } catch (error) {
      logger.error('Error fetching deposit:', error);
      throw error;
    }
  }

  async approve(id, adminId, notes = null) {
    try {
      return await prisma.$transaction(async (tx) => {
        const deposit = await tx.deposit.findUnique({
          where: { id },
          include: { user: true }
        });

        if (!deposit) {
          throw new Error('Depósito no encontrado');
        }

        if (deposit.status !== 'PENDING') {
          throw new Error('El depósito ya fue procesado');
        }

        const updatedDeposit = await tx.deposit.update({
          where: { id },
          data: {
            status: 'APPROVED',
            processedBy: adminId,
            processedAt: new Date(),
            notes
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                phone: true,
                balance: true
              }
            },
            systemPagoMovil: true
          }
        });

        await tx.user.update({
          where: { id: deposit.userId },
          data: {
            balance: {
              increment: deposit.amount
            }
          }
        });

        logger.info('Deposit approved', { 
          id, 
          userId: deposit.userId, 
          amount: deposit.amount,
          adminId 
        });

        return updatedDeposit;
      });
    } catch (error) {
      logger.error('Error approving deposit:', error);
      throw error;
    }
  }

  async reject(id, adminId, notes) {
    try {
      const deposit = await prisma.deposit.findUnique({
        where: { id }
      });

      if (!deposit) {
        throw new Error('Depósito no encontrado');
      }

      if (deposit.status !== 'PENDING') {
        throw new Error('El depósito ya fue procesado');
      }

      const updatedDeposit = await prisma.deposit.update({
        where: { id },
        data: {
          status: 'REJECTED',
          processedBy: adminId,
          processedAt: new Date(),
          notes
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true
            }
          },
          systemPagoMovil: true
        }
      });

      logger.info('Deposit rejected', { id, userId: deposit.userId, adminId });
      return updatedDeposit;
    } catch (error) {
      logger.error('Error rejecting deposit:', error);
      throw error;
    }
  }

  async getUserDeposits(userId) {
    try {
      const deposits = await prisma.deposit.findMany({
        where: { userId },
        include: {
          systemPagoMovil: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return deposits;
    } catch (error) {
      logger.error('Error fetching user deposits:', error);
      throw error;
    }
  }
}

export default new DepositService();
