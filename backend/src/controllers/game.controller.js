/**
 * Controlador para gestión de juegos
 */

import gameService from '../services/game.service.js';

export class GameController {
  /**
   * GET /api/games
   */
  async getAllGames(req, res, next) {
    try {
      const filters = {
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        type: req.query.type,
      };

      const games = await gameService.getAllGames(filters);
      
      res.json({
        success: true,
        data: games,
        count: games.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:id
   */
  async getGameById(req, res, next) {
    try {
      const { id } = req.params;
      const game = await gameService.getGameById(id);

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Juego no encontrado',
        });
      }

      res.json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/slug/:slug
   */
  async getGameBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const game = await gameService.getGameBySlug(slug);

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Juego no encontrado',
        });
      }

      res.json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/games
   */
  async createGame(req, res, next) {
    try {
      const game = await gameService.createGame(req.body);

      res.status(201).json({
        success: true,
        data: game,
        message: 'Juego creado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/games/:id
   */
  async updateGame(req, res, next) {
    try {
      const { id } = req.params;
      const game = await gameService.updateGame(id, req.body);

      res.json({
        success: true,
        data: game,
        message: 'Juego actualizado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/games/:id
   */
  async deleteGame(req, res, next) {
    try {
      const { id } = req.params;
      const game = await gameService.deleteGame(id);

      res.json({
        success: true,
        data: game,
        message: 'Juego eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:id/stats
   */
  async getGameStats(req, res, next) {
    try {
      const { id } = req.params;
      const stats = await gameService.getGameStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:id/items
   */
  async getGameItems(req, res, next) {
    try {
      const { id } = req.params;
      const items = await gameService.getGameItems(id);

      res.json({
        success: true,
        data: {
          items: items,
          total: items.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new GameController();
