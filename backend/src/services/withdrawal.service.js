import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class WithdrawalService {
  async create(userId, data) {
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new Error('Usuario no encontrado');
        }

        if (!user.phoneVerified) {
          throw new Error('Debes verificar tu teléfono antes de solicitar retiros');
        }

        const availableBalance = user.balance - user.blockedBalance;
        
        if (availableBalance < data.amount) {
          throw new Error(`Saldo insuficiente. Disponible: ${availableBalance}`);
        }

        if (data.amount <= 0) {
          throw new Error('El monto debe ser mayor a 0');
        }

        const pagoMovilAccount = await tx.pagoMovilAccount.findUnique({
          where: { id: data.pagoMovilAccountId }
        });

        if (!pagoMovilAccount) {
          throw new Error('Cuenta Pago Móvil no encontrada');
        }

        if (pagoMovilAccount.userId !== userId) {
          throw new Error('Esta cuenta no te pertenece');
        }

        if (!pagoMovilAccount.isActive) {
          throw new Error('Esta cuenta está inactiva');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            blockedBalance: {
              increment: data.amount
            }
          }
        });

        const withdrawal = await tx.withdrawal.create({
          data: {
            userId,
            pagoMovilAccountId: data.pagoMovilAccountId,
            amount: data.amount,
            status: 'PENDING'
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                phone: true,
                balance: true,
                blockedBalance: true
              }
            },
            pagoMovilAccount: true
          }
        });

        logger.info('Withdrawal created', { 
          id: withdrawal.id, 
          userId, 
          amount: withdrawal.amount 
        });

        return withdrawal;
      });
    } catch (error) {
      logger.error('Error creating withdrawal:', error);
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

      const withdrawals = await prisma.withdrawal.findMany({
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
          pagoMovilAccount: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return withdrawals;
    } catch (error) {
      logger.error('Error fetching withdrawals:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              balance: true,
              blockedBalance: true
            }
          },
          pagoMovilAccount: true
        }
      });

      return withdrawal;
    } catch (error) {
      logger.error('Error fetching withdrawal:', error);
      throw error;
    }
  }

  async process(id, adminId) {
    try {
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id }
      });

      if (!withdrawal) {
        throw new Error('Retiro no encontrado');
      }

      if (withdrawal.status !== 'PENDING') {
        throw new Error('El retiro ya fue procesado');
      }

      const updatedWithdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'PROCESSING',
          processedBy: adminId,
          processedAt: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              balance: true,
              blockedBalance: true
            }
          },
          pagoMovilAccount: true
        }
      });

      logger.info('Withdrawal marked as processing', { id, userId: withdrawal.userId, adminId });
      return updatedWithdrawal;
    } catch (error) {
      logger.error('Error processing withdrawal:', error);
      throw error;
    }
  }

  async complete(id, adminId, reference, notes = null) {
    try {
      return await prisma.$transaction(async (tx) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: { user: true }
        });

        if (!withdrawal) {
          throw new Error('Retiro no encontrado');
        }

        if (withdrawal.status !== 'PROCESSING' && withdrawal.status !== 'PENDING') {
          throw new Error('El retiro debe estar en estado PENDING o PROCESSING');
        }

        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            blockedBalance: {
              decrement: withdrawal.amount
            }
          }
        });

        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            processedBy: adminId,
            processedAt: new Date(),
            reference,
            notes
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                phone: true,
                balance: true,
                blockedBalance: true
              }
            },
            pagoMovilAccount: true
          }
        });

        logger.info('Withdrawal completed', { 
          id, 
          userId: withdrawal.userId, 
          amount: withdrawal.amount,
          adminId 
        });

        return updatedWithdrawal;
      });
    } catch (error) {
      logger.error('Error completing withdrawal:', error);
      throw error;
    }
  }

  async reject(id, adminId, notes) {
    try {
      return await prisma.$transaction(async (tx) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: { user: true }
        });

        if (!withdrawal) {
          throw new Error('Retiro no encontrado');
        }

        if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
          throw new Error('Solo se pueden rechazar retiros en estado PENDING o PROCESSING');
        }

        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            blockedBalance: {
              decrement: withdrawal.amount
            }
          }
        });

        const updatedWithdrawal = await tx.withdrawal.update({
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
                phone: true,
                balance: true,
                blockedBalance: true
              }
            },
            pagoMovilAccount: true
          }
        });

        logger.info('Withdrawal rejected', { id, userId: withdrawal.userId, adminId });
        return updatedWithdrawal;
      });
    } catch (error) {
      logger.error('Error rejecting withdrawal:', error);
      throw error;
    }
  }

  async cancel(id, userId) {
    try {
      return await prisma.$transaction(async (tx) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id },
          include: { user: true }
        });

        if (!withdrawal) {
          throw new Error('Retiro no encontrado');
        }

        if (withdrawal.userId !== userId) {
          throw new Error('Este retiro no te pertenece');
        }

        if (withdrawal.status !== 'PENDING') {
          throw new Error('Solo se pueden cancelar retiros en estado PENDING');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            blockedBalance: {
              decrement: withdrawal.amount
            }
          }
        });

        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'CANCELLED'
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                phone: true,
                balance: true,
                blockedBalance: true
              }
            },
            pagoMovilAccount: true
          }
        });

        logger.info('Withdrawal cancelled', { id, userId });
        return updatedWithdrawal;
      });
    } catch (error) {
      logger.error('Error cancelling withdrawal:', error);
      throw error;
    }
  }

  async getUserWithdrawals(userId) {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId },
        include: {
          pagoMovilAccount: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return withdrawals;
    } catch (error) {
      logger.error('Error fetching user withdrawals:', error);
      throw error;
    }
  }
}

export default new WithdrawalService();
