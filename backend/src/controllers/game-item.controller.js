/**
 * Controlador para gestión de items de juegos
 */

import gameItemService from '../services/game-item.service.js';

export class GameItemController {
  /**
   * GET /api/games/:gameId/items
   */
  async getItemsByGame(req, res, next) {
    try {
      const { gameId } = req.params;
      const filters = {
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      };

      const items = await gameItemService.getItemsByGame(gameId, filters);

      res.json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/items/:id
   */
  async getItemById(req, res, next) {
    try {
      const { id } = req.params;
      const item = await gameItemService.getItemById(id);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Item no encontrado',
        });
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:gameId/items/:number
   */
  async getItemByNumber(req, res, next) {
    try {
      const { gameId, number } = req.params;
      const item = await gameItemService.getItemByNumber(gameId, number);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Item no encontrado',
        });
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/items
   */
  async createItem(req, res, next) {
    try {
      const item = await gameItemService.createItem(req.body);

      res.status(201).json({
        success: true,
        data: item,
        message: 'Item creado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/items/:id
   */
  async updateItem(req, res, next) {
    try {
      const { id } = req.params;
      const item = await gameItemService.updateItem(id, req.body);

      res.json({
        success: true,
        data: item,
        message: 'Item actualizado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/items/:id
   */
  async deleteItem(req, res, next) {
    try {
      const { id } = req.params;
      const item = await gameItemService.deleteItem(id);

      res.json({
        success: true,
        data: item,
        message: 'Item eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:gameId/items/random
   */
  async getRandomItem(req, res, next) {
    try {
      const { gameId } = req.params;
      const item = await gameItemService.getRandomItem(gameId);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'No hay items disponibles',
        });
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/games/:gameId/items/winners
   */
  async getMostWinningItems(req, res, next) {
    try {
      const { gameId } = req.params;
      const limit = parseInt(req.query.limit) || 10;
      const items = await gameItemService.getMostWinningItems(gameId, limit);

      res.json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new GameItemController();
