import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class SystemPagoMovilService {
  async create(data) {
    try {
      const account = await prisma.systemPagoMovil.create({
        data: {
          bankCode: data.bankCode,
          bankName: data.bankName,
          phone: data.phone,
          cedula: data.cedula,
          holderName: data.holderName,
          isActive: data.isActive ?? true,
          priority: data.priority ?? 0
        }
      });

      logger.info('SystemPagoMovil account created', { id: account.id });
      return account;
    } catch (error) {
      logger.error('Error creating SystemPagoMovil account:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      const where = {};
      
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      const accounts = await prisma.systemPagoMovil.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      return accounts;
    } catch (error) {
      logger.error('Error fetching SystemPagoMovil accounts:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const account = await prisma.systemPagoMovil.findUnique({
        where: { id },
        include: {
          deposits: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return account;
    } catch (error) {
      logger.error('Error fetching SystemPagoMovil account:', error);
      throw error;
    }
  }

  async update(id, data) {
    try {
      const account = await prisma.systemPagoMovil.update({
        where: { id },
        data: {
          ...(data.bankCode && { bankCode: data.bankCode }),
          ...(data.bankName && { bankName: data.bankName }),
          ...(data.phone && { phone: data.phone }),
          ...(data.cedula && { cedula: data.cedula }),
          ...(data.holderName && { holderName: data.holderName }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.priority !== undefined && { priority: data.priority })
        }
      });

      logger.info('SystemPagoMovil account updated', { id });
      return account;
    } catch (error) {
      logger.error('Error updating SystemPagoMovil account:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      await prisma.systemPagoMovil.delete({
        where: { id }
      });

      logger.info('SystemPagoMovil account deleted', { id });
      return true;
    } catch (error) {
      logger.error('Error deleting SystemPagoMovil account:', error);
      throw error;
    }
  }

  async getActiveAccounts() {
    try {
      const accounts = await prisma.systemPagoMovil.findMany({
        where: { isActive: true },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      return accounts;
    } catch (error) {
      logger.error('Error fetching active SystemPagoMovil accounts:', error);
      throw error;
    }
  }
}

export default new SystemPagoMovilService();
