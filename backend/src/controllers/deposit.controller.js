import depositService from '../services/deposit.service.js';
import logger from '../lib/logger.js';

class DepositController {
  async create(req, res) {
    try {
      const userId = req.user.id;
      const { systemPagoMovilId, amount, reference, phone, bankCode } = req.body;

      if (!systemPagoMovilId || !amount || !reference || !phone || !bankCode) {
        return res.status(400).json({
          success: false,
          error: 'Todos los campos son requeridos: systemPagoMovilId, amount, reference, phone, bankCode'
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'El monto debe ser mayor a 0'
        });
      }

      const deposit = await depositService.create(userId, {
        systemPagoMovilId,
        amount,
        reference,
        phone,
        bankCode
      });

      res.status(201).json({
        success: true,
        data: deposit
      });
    } catch (error) {
      logger.error('Error in create deposit:', error);
      res.status(500).json({
        success: false,
        error: 'Error al crear depósito'
      });
    }
  }

  async getAll(req, res) {
    try {
      const { status, userId } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (userId) filters.userId = userId;

      const deposits = await depositService.findAll(filters);

      res.json({
        success: true,
        data: deposits
      });
    } catch (error) {
      logger.error('Error in getAll deposits:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener depósitos'
      });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;

      const deposit = await depositService.findById(id);

      if (!deposit) {
        return res.status(404).json({
          success: false,
          error: 'Depósito no encontrado'
        });
      }

      if (req.user.role !== 'ADMIN' && deposit.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para ver este depósito'
        });
      }

      res.json({
        success: true,
        data: deposit
      });
    } catch (error) {
      logger.error('Error in getById deposit:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener depósito'
      });
    }
  }

  async approve(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user.id;

      const deposit = await depositService.approve(id, adminId, notes);

      res.json({
        success: true,
        data: deposit,
        message: 'Depósito aprobado y saldo acreditado'
      });
    } catch (error) {
      logger.error('Error in approve deposit:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al aprobar depósito'
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
          error: 'Debes proporcionar una razón para rechazar el depósito'
        });
      }

      const deposit = await depositService.reject(id, adminId, notes);

      res.json({
        success: true,
        data: deposit,
        message: 'Depósito rechazado'
      });
    } catch (error) {
      logger.error('Error in reject deposit:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al rechazar depósito'
      });
    }
  }

  async getMyDeposits(req, res) {
    try {
      const userId = req.user.id;

      const deposits = await depositService.getUserDeposits(userId);

      res.json({
        success: true,
        data: deposits
      });
    } catch (error) {
      logger.error('Error in getMyDeposits:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tus depósitos'
      });
    }
  }
}

export default new DepositController();
