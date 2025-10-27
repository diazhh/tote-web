import drawTemplateService from '../services/draw-template.service.js';
import logger from '../lib/logger.js';

class DrawTemplateController {
  /**
   * GET /api/templates
   */
  async getAll(req, res) {
    try {
      const { gameId, isActive } = req.query;
      
      const templates = await drawTemplateService.getAll({
        gameId,
        isActive: isActive !== undefined ? isActive === 'true' : undefined
      });

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      logger.error('Error en getAll templates:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/templates/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const template = await drawTemplateService.getById(id);

      res.json({
        success: true,
        data: template
      });
    } catch (error) {
      logger.error('Error en getById template:', error);
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/templates
   */
  async create(req, res) {
    try {
      const { gameId, name, description, daysOfWeek, drawTimes } = req.body;

      if (!gameId || !name || !daysOfWeek || !drawTimes) {
        return res.status(400).json({
          success: false,
          error: 'gameId, name, daysOfWeek y drawTimes son requeridos'
        });
      }

      const template = await drawTemplateService.create({
        gameId,
        name,
        description,
        daysOfWeek,
        drawTimes
      });

      res.status(201).json({
        success: true,
        data: template
      });
    } catch (error) {
      logger.error('Error en create template:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PATCH /api/templates/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const template = await drawTemplateService.update(id, data);

      res.json({
        success: true,
        data: template
      });
    } catch (error) {
      logger.error('Error en update template:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/templates/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      await drawTemplateService.delete(id);

      res.json({
        success: true,
        message: 'Plantilla eliminada exitosamente'
      });
    } catch (error) {
      logger.error('Error en delete template:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new DrawTemplateController();
