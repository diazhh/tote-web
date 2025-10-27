import instagramService from '../services/instagram.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador para gestionar instancias de Instagram
 */
class InstagramController {
  /**
   * Crear nueva instancia de Instagram
   * POST /api/instagram/instances
   */
  async createInstance(req, res) {
    try {
      const { instanceId, name, appId, appSecret, redirectUri } = req.body;

      if (!instanceId || !name || !appId || !appSecret || !redirectUri) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos: instanceId, name, appId, appSecret, redirectUri'
        });
      }

      const result = await instagramService.createInstance(
        instanceId,
        name,
        appId,
        appSecret,
        redirectUri
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al crear instancia de Instagram:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Autorizar instancia con código OAuth
   * POST /api/instagram/instances/:instanceId/authorize
   */
  async authorizeInstance(req, res) {
    try {
      const { instanceId } = req.params;
      const { code, redirectUri } = req.body;

      if (!code || !redirectUri) {
        return res.status(400).json({
          success: false,
          message: 'code y redirectUri son requeridos'
        });
      }

      const result = await instagramService.exchangeCodeForToken(instanceId, code, redirectUri);

      res.json(result);
    } catch (error) {
      logger.error('Error al autorizar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Listar todas las instancias
   * GET /api/instagram/instances
   */
  async listInstances(req, res) {
    try {
      const instances = await instagramService.listInstances();

      res.json({
        success: true,
        instances
      });
    } catch (error) {
      logger.error('Error al listar instancias de Instagram:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener instancia específica
   * GET /api/instagram/instances/:instanceId
   */
  async getInstance(req, res) {
    try {
      const { instanceId } = req.params;
      const instance = await instagramService.getInstance(instanceId);

      res.json({
        success: true,
        instance: {
          ...instance,
          appSecret: '***hidden***',
          accessToken: instance.accessToken ? '***hidden***' : null
        }
      });
    } catch (error) {
      logger.error('Error al obtener instancia:', error);
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener media del usuario
   * GET /api/instagram/instances/:instanceId/media
   */
  async getUserMedia(req, res) {
    try {
      const { instanceId } = req.params;
      const { limit } = req.query;

      const result = await instagramService.getUserMedia(instanceId, parseInt(limit) || 25);

      res.json(result);
    } catch (error) {
      logger.error('Error al obtener media:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Refrescar token de acceso
   * POST /api/instagram/instances/:instanceId/refresh-token
   */
  async refreshToken(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await instagramService.refreshAccessToken(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al refrescar token:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Probar conexión
   * POST /api/instagram/instances/:instanceId/test
   */
  async testConnection(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await instagramService.testConnection(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al probar conexión:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Desconectar instancia
   * POST /api/instagram/instances/:instanceId/disconnect
   */
  async disconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await instagramService.disconnectInstance(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al desconectar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Eliminar instancia
   * DELETE /api/instagram/instances/:instanceId
   */
  async deleteInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await instagramService.deleteInstance(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al eliminar instancia:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new InstagramController();
