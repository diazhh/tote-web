import channelService from '../services/channel.service.js';
import logger from '../lib/logger.js';

class ChannelController {
  /**
   * GET /api/channels
   */
  async getAll(req, res) {
    try {
      const { type, isActive } = req.query;
      
      const channels = await channelService.getAll({
        type,
        isActive: isActive !== undefined ? isActive === 'true' : undefined
      });

      res.json({
        success: true,
        data: channels
      });
    } catch (error) {
      logger.error('Error en getAll channels:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/channels/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const channel = await channelService.getById(id);

      res.json({
        success: true,
        data: channel
      });
    } catch (error) {
      logger.error('Error en getById channel:', error);
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/channels
   */
  async create(req, res) {
    try {
      const { type, name, config } = req.body;

      if (!type || !name || !config) {
        return res.status(400).json({
          success: false,
          error: 'type, name y config son requeridos'
        });
      }

      const channel = await channelService.create({
        type,
        name,
        config
      });

      res.status(201).json({
        success: true,
        data: channel
      });
    } catch (error) {
      logger.error('Error en create channel:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PUT /api/channels/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const channel = await channelService.update(id, data);

      res.json({
        success: true,
        data: channel
      });
    } catch (error) {
      logger.error('Error en update channel:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/channels/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      await channelService.delete(id);

      res.json({
        success: true,
        message: 'Canal eliminado exitosamente'
      });
    } catch (error) {
      logger.error('Error en delete channel:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/channels/:id/test
   */
  async testConnection(req, res) {
    try {
      const { id } = req.params;
      const result = await channelService.testConnection(id);

      res.json({
        success: true,
        data: result,
        message: 'Conexión exitosa'
      });
    } catch (error) {
      logger.error('Error en test channel:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new ChannelController();
