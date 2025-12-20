import withdrawalService from '../services/withdrawal.service.js';
import logger from '../lib/logger.js';

class WithdrawalController {
  async create(req, res) {
    try {
      const userId = req.user.id;
      const { pagoMovilAccountId, amount } = req.body;

      if (!pagoMovilAccountId || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Todos los campos son requeridos: pagoMovilAccountId, amount'
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'El monto debe ser mayor a 0'
        });
      }

      const withdrawal = await withdrawalService.create(userId, {
        pagoMovilAccountId,
        amount
      });

      res.status(201).json({
        success: true,
        data: withdrawal,
        message: 'Retiro solicitado exitosamente. Tu saldo ha sido bloqueado hasta que se procese.'
      });
    } catch (error) {
      logger.error('Error in create withdrawal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al crear retiro'
      });
    }
  }

  async getAll(req, res) {
    try {
      const { status, userId } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (userId) filters.userId = userId;

      const withdrawals = await withdrawalService.findAll(filters);

      res.json({
        success: true,
        data: withdrawals
      });
    } catch (error) {
      logger.error('Error in getAll withdrawals:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener retiros'
      });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;

      const withdrawal = await withdrawalService.findById(id);

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Retiro no encontrado'
        });
      }

      if (req.user.role !== 'ADMIN' && withdrawal.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para ver este retiro'
        });
      }

      res.json({
        success: true,
        data: withdrawal
      });
    } catch (error) {
      logger.error('Error in getById withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener retiro'
      });
    }
  }

  async process(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const withdrawal = await withdrawalService.process(id, adminId);

      res.json({
        success: true,
        data: withdrawal,
        message: 'Retiro marcado como en proceso'
      });
    } catch (error) {
      logger.error('Error in process withdrawal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al procesar retiro'
      });
    }
  }

  async complete(req, res) {
    try {
      const { id } = req.params;
      const { reference, notes } = req.body;
      const adminId = req.user.id;

      if (!reference) {
        return res.status(400).json({
          success: false,
          error: 'Debes proporcionar la referencia del pago realizado'
        });
      }

      const withdrawal = await withdrawalService.complete(id, adminId, reference, notes);

      res.json({
        success: true,
        data: withdrawal,
        message: 'Retiro completado y saldo descontado'
      });
    } catch (error) {
      logger.error('Error in complete withdrawal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al completar retiro'
      });
    }
  }

  async reject(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user.id;

      if (!notes) {
        return res.status(400).json({
          success: false,
          error: 'Debes proporcionar una razón para rechazar el retiro'
        });
      }

      const withdrawal = await withdrawalService.reject(id, adminId, notes);

      res.json({
        success: true,
        data: withdrawal,
        message: 'Retiro rechazado y saldo desbloqueado'
      });
    } catch (error) {
      logger.error('Error in reject withdrawal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al rechazar retiro'
      });
    }
  }

  async cancel(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const withdrawal = await withdrawalService.cancel(id, userId);

      res.json({
        success: true,
        data: withdrawal,
        message: 'Retiro cancelado y saldo desbloqueado'
      });
    } catch (error) {
      logger.error('Error in cancel withdrawal:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al cancelar retiro'
      });
    }
  }

  async getMyWithdrawals(req, res) {
    try {
      const userId = req.user.id;

      const withdrawals = await withdrawalService.getUserWithdrawals(userId);

      res.json({
        success: true,
        data: withdrawals
      });
    } catch (error) {
      logger.error('Error in getMyWithdrawals:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tus retiros'
      });
    }
  }
}

export default new WithdrawalController();
