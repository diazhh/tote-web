import systemPagoMovilService from '../services/system-pago-movil.service.js';
import logger from '../lib/logger.js';

class SystemPagoMovilController {
  async create(req, res) {
    try {
      const { bankCode, bankName, phone, cedula, holderName, isActive, priority } = req.body;

      if (!bankCode || !bankName || !phone || !cedula || !holderName) {
        return res.status(400).json({
          success: false,
          error: 'Todos los campos son requeridos: bankCode, bankName, phone, cedula, holderName'
        });
      }

      const account = await systemPagoMovilService.create({
        bankCode,
        bankName,
        phone,
        cedula,
        holderName,
        isActive,
        priority
      });

      res.status(201).json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error in create SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al crear cuenta Pago Móvil del sistema'
      });
    }
  }

  async getAll(req, res) {
    try {
      const { isActive } = req.query;
      
      const filters = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }

      const accounts = await systemPagoMovilService.findAll(filters);

      res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      logger.error('Error in getAll SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener cuentas Pago Móvil del sistema'
      });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;

      const account = await systemPagoMovilService.findById(id);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Cuenta Pago Móvil no encontrada'
        });
      }

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error in getById SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener cuenta Pago Móvil'
      });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const account = await systemPagoMovilService.update(id, updateData);

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error in update SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al actualizar cuenta Pago Móvil'
      });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;

      await systemPagoMovilService.delete(id);

      res.json({
        success: true,
        message: 'Cuenta Pago Móvil eliminada correctamente'
      });
    } catch (error) {
      logger.error('Error in delete SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al eliminar cuenta Pago Móvil'
      });
    }
  }

  async getActive(req, res) {
    try {
      const accounts = await systemPagoMovilService.getActiveAccounts();

      res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      logger.error('Error in getActive SystemPagoMovil:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener cuentas activas'
      });
    }
  }
}

export default new SystemPagoMovilController();
