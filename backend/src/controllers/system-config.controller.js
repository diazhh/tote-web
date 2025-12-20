import systemConfigService from '../services/system-config.service.js';
import logger from '../lib/logger.js';

class SystemConfigController {
  /**
   * GET /api/system/config
   */
  async getAll(req, res) {
    try {
      const configs = await systemConfigService.getAll();

      res.json({
        success: true,
        data: configs
      });
    } catch (error) {
      logger.error('Error en getAll configs:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/system/config/:key
   */
  async get(req, res) {
    try {
      const { key } = req.params;
      const config = await systemConfigService.get(key);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Configuración no encontrada'
        });
      }

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error en get config:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/system/config
   */
  async set(req, res) {
    try {
      const { key, value, description } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({
          success: false,
          error: 'key y value son requeridos'
        });
      }

      const config = await systemConfigService.set(
        key,
        value,
        description,
        req.user?.username
      );

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error en set config:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/system/emergency-stop
   */
  async getEmergencyStop(req, res) {
    try {
      const isActive = await systemConfigService.isEmergencyStop();
      const config = await systemConfigService.get('emergency_stop');

      res.json({
        success: true,
        data: {
          enabled: isActive,
          ...config?.value
        }
      });
    } catch (error) {
      logger.error('Error en getEmergencyStop:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/system/emergency-stop/enable
   */
  async enableEmergencyStop(req, res) {
    try {
      const { reason } = req.body;

      await systemConfigService.enableEmergencyStop(
        reason || 'Parada de emergencia activada',
        req.user?.username
      );

      res.json({
        success: true,
        message: 'Parada de emergencia activada'
      });
    } catch (error) {
      logger.error('Error en enableEmergencyStop:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/system/emergency-stop/disable
   */
  async disableEmergencyStop(req, res) {
    try {
      await systemConfigService.disableEmergencyStop(req.user?.username);

      res.json({
        success: true,
        message: 'Parada de emergencia desactivada'
      });
    } catch (error) {
      logger.error('Error en disableEmergencyStop:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/system/config/:key
   */
  async delete(req, res) {
    try {
      const { key } = req.params;
      await systemConfigService.delete(key);

      res.json({
        success: true,
        message: 'Configuración eliminada'
      });
    } catch (error) {
      logger.error('Error en delete config:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new SystemConfigController();
