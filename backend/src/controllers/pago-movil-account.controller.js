import pagoMovilAccountService from '../services/pago-movil-account.service.js';
import logger from '../lib/logger.js';

class PagoMovilAccountController {
  async create(req, res) {
    try {
      const userId = req.user.id;
      const { bankCode, bankName, phone, cedula, holderName, isDefault } = req.body;

      if (!bankCode || !bankName || !phone || !cedula || !holderName) {
        return res.status(400).json({
          success: false,
          error: 'Todos los campos son requeridos: bankCode, bankName, phone, cedula, holderName'
        });
      }

      const account = await pagoMovilAccountService.create(userId, {
        bankCode,
        bankName,
        phone,
        cedula,
        holderName,
        isDefault
      });

      res.status(201).json({
        success: true,
        data: account,
        message: 'Cuenta Pago Móvil agregada exitosamente'
      });
    } catch (error) {
      logger.error('Error in create PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al crear cuenta Pago Móvil'
      });
    }
  }

  async getMyAccounts(req, res) {
    try {
      const userId = req.user.id;

      const accounts = await pagoMovilAccountService.findAll(userId);

      res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      logger.error('Error in getMyAccounts:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tus cuentas'
      });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const account = await pagoMovilAccountService.findById(id);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Cuenta no encontrada'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para ver esta cuenta'
        });
      }

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error in getById PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener cuenta'
      });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { bankCode, bankName, phone, cedula, holderName } = req.body;

      if (!bankCode || !bankName || !phone || !cedula || !holderName) {
        return res.status(400).json({
          success: false,
          error: 'Todos los campos son requeridos: bankCode, bankName, phone, cedula, holderName'
        });
      }

      const account = await pagoMovilAccountService.update(id, userId, {
        bankCode,
        bankName,
        phone,
        cedula,
        holderName
      });

      res.json({
        success: true,
        data: account,
        message: 'Cuenta actualizada exitosamente'
      });
    } catch (error) {
      logger.error('Error in update PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al actualizar cuenta'
      });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      await pagoMovilAccountService.delete(id, userId);

      res.json({
        success: true,
        message: 'Cuenta eliminada exitosamente'
      });
    } catch (error) {
      logger.error('Error in delete PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al eliminar cuenta'
      });
    }
  }

  async setDefault(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const account = await pagoMovilAccountService.setDefault(id, userId);

      res.json({
        success: true,
        data: account,
        message: 'Cuenta marcada como predeterminada'
      });
    } catch (error) {
      logger.error('Error in setDefault PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al marcar cuenta como predeterminada'
      });
    }
  }

  async getDefault(req, res) {
    try {
      const userId = req.user.id;

      const account = await pagoMovilAccountService.getDefault(userId);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'No tienes una cuenta predeterminada'
        });
      }

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error in getDefault PagoMovil account:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener cuenta predeterminada'
      });
    }
  }
}

export default new PagoMovilAccountController();
