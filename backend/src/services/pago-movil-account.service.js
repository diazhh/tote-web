import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class PagoMovilAccountService {
  async create(userId, data) {
    try {
      const existingAccounts = await prisma.pagoMovilAccount.count({
        where: { userId }
      });

      const isDefault = existingAccounts === 0 ? true : (data.isDefault || false);

      if (isDefault && existingAccounts > 0) {
        await prisma.pagoMovilAccount.updateMany({
          where: { 
            userId,
            isDefault: true
          },
          data: { isDefault: false }
        });
      }

      const account = await prisma.pagoMovilAccount.create({
        data: {
          userId,
          bankCode: data.bankCode,
          bankName: data.bankName,
          phone: data.phone,
          cedula: data.cedula,
          holderName: data.holderName,
          isDefault,
          isActive: true
        }
      });

      logger.info('PagoMovil account created', { id: account.id, userId });
      return account;
    } catch (error) {
      logger.error('Error creating PagoMovil account:', error);
      throw error;
    }
  }

  async findAll(userId) {
    try {
      const accounts = await prisma.pagoMovilAccount.findMany({
        where: { userId },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      return accounts;
    } catch (error) {
      logger.error('Error fetching PagoMovil accounts:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const account = await prisma.pagoMovilAccount.findUnique({
        where: { id }
      });

      return account;
    } catch (error) {
      logger.error('Error fetching PagoMovil account:', error);
      throw error;
    }
  }

  async update(id, userId, data) {
    try {
      const account = await prisma.pagoMovilAccount.findUnique({
        where: { id }
      });

      if (!account) {
        throw new Error('Cuenta no encontrada');
      }

      if (account.userId !== userId) {
        throw new Error('Esta cuenta no te pertenece');
      }

      const updatedAccount = await prisma.pagoMovilAccount.update({
        where: { id },
        data: {
          bankCode: data.bankCode,
          bankName: data.bankName,
          phone: data.phone,
          cedula: data.cedula,
          holderName: data.holderName
        }
      });

      logger.info('PagoMovil account updated', { id, userId });
      return updatedAccount;
    } catch (error) {
      logger.error('Error updating PagoMovil account:', error);
      throw error;
    }
  }

  async delete(id, userId) {
    try {
      const account = await prisma.pagoMovilAccount.findUnique({
        where: { id },
        include: {
          withdrawals: {
            where: {
              status: {
                in: ['PENDING', 'PROCESSING']
              }
            }
          }
        }
      });

      if (!account) {
        throw new Error('Cuenta no encontrada');
      }

      if (account.userId !== userId) {
        throw new Error('Esta cuenta no te pertenece');
      }

      if (account.withdrawals.length > 0) {
        throw new Error('No puedes eliminar una cuenta con retiros pendientes o en proceso');
      }

      await prisma.pagoMovilAccount.delete({
        where: { id }
      });

      logger.info('PagoMovil account deleted', { id, userId });
      return { success: true };
    } catch (error) {
      logger.error('Error deleting PagoMovil account:', error);
      throw error;
    }
  }

  async setDefault(id, userId) {
    try {
      const account = await prisma.pagoMovilAccount.findUnique({
        where: { id }
      });

      if (!account) {
        throw new Error('Cuenta no encontrada');
      }

      if (account.userId !== userId) {
        throw new Error('Esta cuenta no te pertenece');
      }

      if (!account.isActive) {
        throw new Error('No puedes marcar como predeterminada una cuenta inactiva');
      }

      await prisma.$transaction([
        prisma.pagoMovilAccount.updateMany({
          where: { 
            userId,
            isDefault: true
          },
          data: { isDefault: false }
        }),
        prisma.pagoMovilAccount.update({
          where: { id },
          data: { isDefault: true }
        })
      ]);

      const updatedAccount = await prisma.pagoMovilAccount.findUnique({
        where: { id }
      });

      logger.info('PagoMovil account set as default', { id, userId });
      return updatedAccount;
    } catch (error) {
      logger.error('Error setting default PagoMovil account:', error);
      throw error;
    }
  }

  async getDefault(userId) {
    try {
      const account = await prisma.pagoMovilAccount.findFirst({
        where: { 
          userId,
          isDefault: true,
          isActive: true
        }
      });

      return account;
    } catch (error) {
      logger.error('Error fetching default PagoMovil account:', error);
      throw error;
    }
  }
}

export default new PagoMovilAccountService();
