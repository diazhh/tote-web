import drawPauseService from '../services/draw-pause.service.js';
import logger from '../lib/logger.js';

class DrawPauseController {
  /**
   * GET /api/pauses
   */
  async getAll(req, res) {
    try {
      const { gameId, isActive } = req.query;
      
      const pauses = await drawPauseService.getAll({
        gameId,
        isActive: isActive !== undefined ? isActive === 'true' : undefined
      });

      res.json({
        success: true,
        data: pauses
      });
    } catch (error) {
      logger.error('Error en getAll pauses:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/pauses/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const pause = await drawPauseService.getById(id);

      res.json({
        success: true,
        data: pause
      });
    } catch (error) {
      logger.error('Error en getById pause:', error);
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/pauses
   */
  async create(req, res) {
    try {
      const { gameId, startDate, endDate, reason } = req.body;

      if (!gameId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'gameId, startDate y endDate son requeridos'
        });
      }

      const pause = await drawPauseService.create({
        gameId,
        startDate,
        endDate,
        reason
      });

      res.status(201).json({
        success: true,
        data: pause
      });
    } catch (error) {
      logger.error('Error en create pause:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PATCH /api/pauses/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const pause = await drawPauseService.update(id, data);

      res.json({
        success: true,
        data: pause
      });
    } catch (error) {
      logger.error('Error en update pause:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/pauses/:id
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      await drawPauseService.delete(id);

      res.json({
        success: true,
        message: 'Pausa eliminada exitosamente'
      });
    } catch (error) {
      logger.error('Error en delete pause:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new DrawPauseController();
