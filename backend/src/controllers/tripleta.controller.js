/**
 * Controlador para gestión de apuestas Tripleta
 */

import tripletaService from '../services/tripleta.service.js';

export class TripletaController {
  /**
   * POST /api/tripleta/bet
   * Crear una apuesta tripleta
   */
  async createTripleBet(req, res, next) {
    try {
      const { gameId, item1Id, item2Id, item3Id, amount } = req.body;
      const userId = req.user.id;

      if (!gameId || !item1Id || !item2Id || !item3Id || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Faltan datos requeridos',
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'El monto debe ser mayor a 0',
        });
      }

      const tripleBet = await tripletaService.createTripleBet({
        userId,
        gameId,
        item1Id,
        item2Id,
        item3Id,
        amount: parseFloat(amount),
      });

      res.status(201).json({
        success: true,
        data: tripleBet,
        message: 'Apuesta Tripleta creada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tripleta/my-bets
   * Obtener apuestas tripleta del usuario autenticado
   */
  async getMyTripleBets(req, res, next) {
    try {
      const userId = req.user.id;
      const filters = {
        status: req.query.status,
        gameId: req.query.gameId,
        limit: req.query.limit ? parseInt(req.query.limit) : 50,
        offset: req.query.offset ? parseInt(req.query.offset) : 0,
      };

      const tripleBets = await tripletaService.getUserTripleBets(userId, filters);

      res.json({
        success: true,
        data: tripleBets,
        count: tripleBets.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tripleta/:id
   * Obtener una apuesta tripleta por ID
   */
  async getTripleBetById(req, res, next) {
    try {
      const { id } = req.params;
      const tripleBet = await tripletaService.getTripleBetById(id);

      if (!tripleBet) {
        return res.status(404).json({
          success: false,
          error: 'Apuesta no encontrada',
        });
      }

      // Verificar que el usuario sea el dueño o sea admin
      if (tripleBet.userId !== req.user.id && !['ADMIN', 'TAQUILLA_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para ver esta apuesta',
        });
      }

      res.json({
        success: true,
        data: tripleBet,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tripleta/game/:gameId/stats
   * Obtener estadísticas de tripletas para un juego (solo admin)
   */
  async getGameTripletaStats(req, res, next) {
    try {
      const { gameId } = req.params;
      const stats = await tripletaService.getGameTripletaStats(gameId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/tripleta/check-draw/:drawId
   * Verificar apuestas tripleta para un sorteo (solo admin)
   */
  async checkTripleBetsForDraw(req, res, next) {
    try {
      const { drawId } = req.params;
      const result = await tripletaService.checkTripleBetsForDraw(drawId);

      res.json({
        success: true,
        data: result,
        message: `Verificación completada: ${result.winners} ganadores, ${result.expired} expiradas`,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TripletaController();
