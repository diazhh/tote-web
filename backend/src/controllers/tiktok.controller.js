import tiktokService from '../services/tiktok.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador para gestionar instancias de TikTok
 */
class TikTokController {
  /**
   * Crear nueva instancia de TikTok
   * POST /api/tiktok/instances
   */
  async createInstance(req, res) {
    try {
      const { instanceId, name, clientKey, clientSecret, redirectUri } = req.body;

      if (!instanceId || !name || !clientKey || !clientSecret || !redirectUri) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos: instanceId, name, clientKey, clientSecret, redirectUri'
        });
      }

      const result = await tiktokService.createInstance(
        instanceId,
        name,
        clientKey,
        clientSecret,
        redirectUri
      );

      res.json(result);
    } catch (error) {
      logger.error('Error al crear instancia de TikTok:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Autorizar instancia con código OAuth
   * POST /api/tiktok/instances/:instanceId/authorize
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

      const result = await tiktokService.exchangeCodeForToken(instanceId, code, redirectUri);

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
   * GET /api/tiktok/instances
   */
  async listInstances(req, res) {
    try {
      const instances = await tiktokService.listInstances();

      res.json({
        success: true,
        instances
      });
    } catch (error) {
      logger.error('Error al listar instancias de TikTok:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Obtener instancia específica
   * GET /api/tiktok/instances/:instanceId
   */
  async getInstance(req, res) {
    try {
      const { instanceId } = req.params;
      const instance = await tiktokService.getInstance(instanceId);

      res.json({
        success: true,
        instance: {
          ...instance,
          clientSecret: '***hidden***',
          accessToken: instance.accessToken ? '***hidden***' : null,
          refreshToken: instance.refreshToken ? '***hidden***' : null
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
   * Obtener videos del usuario
   * GET /api/tiktok/instances/:instanceId/videos
   */
  async getUserVideos(req, res) {
    try {
      const { instanceId } = req.params;
      const { limit } = req.query;

      const result = await tiktokService.getUserVideos(instanceId, parseInt(limit) || 20);

      res.json(result);
    } catch (error) {
      logger.error('Error al obtener videos:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Refrescar token de acceso
   * POST /api/tiktok/instances/:instanceId/refresh-token
   */
  async refreshToken(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await tiktokService.refreshAccessToken(instanceId);

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
   * Revocar acceso
   * POST /api/tiktok/instances/:instanceId/revoke
   */
  async revokeAccess(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await tiktokService.revokeAccess(instanceId);

      res.json(result);
    } catch (error) {
      logger.error('Error al revocar acceso:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Probar conexión
   * POST /api/tiktok/instances/:instanceId/test
   */
  async testConnection(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await tiktokService.testConnection(instanceId);

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
   * POST /api/tiktok/instances/:instanceId/disconnect
   */
  async disconnectInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await tiktokService.disconnectInstance(instanceId);

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
   * DELETE /api/tiktok/instances/:instanceId
   */
  async deleteInstance(req, res) {
    try {
      const { instanceId } = req.params;

      const result = await tiktokService.deleteInstance(instanceId);

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

export default new TikTokController();
