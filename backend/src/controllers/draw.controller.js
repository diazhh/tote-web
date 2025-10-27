/**
 * Controlador para gestión de sorteos
 */

import drawService from '../services/draw.service.js';

export class DrawController {
  /**
   * GET /api/draws
   */
  async getDraws(req, res, next) {
    try {
      const filters = {
        gameId: req.query.gameId,
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        orderBy: req.query.orderBy || 'desc',
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        skip: req.query.skip ? parseInt(req.query.skip) : undefined,
      };

      const { draws, total } = await drawService.getDraws(filters);

      res.json({
        success: true,
        data: draws,
        count: draws.length,
        total: total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/:id
   */
  async getDrawById(req, res, next) {
    try {
      const { id } = req.params;
      const draw = await drawService.getDrawById(id);

      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado',
        });
      }

      res.json({
        success: true,
        data: draw,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/today
   */
  async getTodayDraws(req, res, next) {
    try {
      const gameId = req.query.gameId;
      const draws = await drawService.getTodayDraws(gameId);

      res.json({
        success: true,
        data: draws,
        count: draws.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/next
   */
  async getNextDraw(req, res, next) {
    try {
      const gameId = req.query.gameId;
      const draw = await drawService.getNextDraw(gameId);

      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'No hay sorteos próximos',
        });
      }

      res.json({
        success: true,
        data: draw,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws
   */
  async createDraw(req, res, next) {
    try {
      const draw = await drawService.createDraw(req.body);

      res.status(201).json({
        success: true,
        data: draw,
        message: 'Sorteo creado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/draws/:id
   */
  async updateDraw(req, res, next) {
    try {
      const { id } = req.params;
      const draw = await drawService.updateDraw(id, req.body);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo actualizado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/close
   */
  async closeDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { preselectedItemId } = req.body;

      if (!preselectedItemId) {
        return res.status(400).json({
          success: false,
          error: 'preselectedItemId es requerido',
        });
      }

      const draw = await drawService.closeDraw(id, preselectedItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo cerrado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/execute
   */
  async executeDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { winnerItemId } = req.body;

      const draw = await drawService.executeDraw(id, winnerItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo ejecutado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/preselect
   */
  async preselectWinner(req, res, next) {
    try {
      const { id } = req.params;
      const { itemId } = req.body;

      const draw = await drawService.preselectWinner(id, itemId);

      res.json({
        success: true,
        data: draw,
        message: 'Ganador preseleccionado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/change-winner
   */
  async changeWinner(req, res, next) {
    try {
      const { id } = req.params;
      const { newWinnerItemId } = req.body;

      if (!newWinnerItemId) {
        return res.status(400).json({
          success: false,
          error: 'newWinnerItemId es requerido',
        });
      }

      const draw = await drawService.changeWinner(id, newWinnerItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Ganador cambiado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/cancel
   */
  async cancelDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const draw = await drawService.cancelDraw(id, reason || 'Sin razón especificada');

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo cancelado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/stats
   */
  async getDrawStats(req, res, next) {
    try {
      const { gameId, dateFrom, dateTo } = req.query;
      const stats = await drawService.getDrawStats(gameId, dateFrom, dateTo);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new DrawController();
