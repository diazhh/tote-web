import playerService from '../services/player.service.js';
import playerMovementService from '../services/player-movement.service.js';
import logger from '../lib/logger.js';

class PlayerController {
  /**
   * GET /api/players
   * Obtener lista de jugadores
   */
  async getPlayers(req, res) {
    try {
      const { search, limit = 50, offset = 0 } = req.query;
      
      const players = await playerService.getPlayers({
        search,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: players
      });
    } catch (error) {
      logger.error('Error in getPlayers:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener jugadores'
      });
    }
  }

  /**
   * GET /api/players/:id
   * Obtener detalles completos de un jugador
   */
  async getPlayerDetails(req, res) {
    try {
      const { id } = req.params;
      
      const details = await playerService.getPlayerDetails(id);

      if (!details) {
        return res.status(404).json({
          success: false,
          error: 'Jugador no encontrado'
        });
      }

      res.json({
        success: true,
        data: details
      });
    } catch (error) {
      logger.error('Error in getPlayerDetails:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener detalles del jugador'
      });
    }
  }

  /**
   * GET /api/players/:id/tickets
   * Obtener tickets de un jugador
   */
  async getPlayerTickets(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, status } = req.query;
      
      const tickets = await playerService.getPlayerTickets(id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status
      });

      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      logger.error('Error in getPlayerTickets:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener tickets del jugador'
      });
    }
  }

  /**
   * GET /api/players/:id/tripletas
   * Obtener apuestas tripleta de un jugador
   */
  async getPlayerTripletas(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, status } = req.query;
      
      const tripletas = await playerService.getPlayerTripletas(id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status
      });

      res.json({
        success: true,
        data: tripletas
      });
    } catch (error) {
      logger.error('Error in getPlayerTripletas:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener tripletas del jugador'
      });
    }
  }

  /**
   * GET /api/players/:id/movements
   * Obtener historial de movimientos de un jugador (trazabilidad tipo banco)
   */
  async getPlayerMovements(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, type, dateFrom, dateTo } = req.query;
      
      const result = await playerMovementService.getPlayerMovements(id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        type,
        dateFrom,
        dateTo
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in getPlayerMovements:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener movimientos del jugador'
      });
    }
  }

  /**
   * GET /api/players/:id/stats
   * Obtener estadísticas acumuladas de un jugador
   */
  async getPlayerStats(req, res) {
    try {
      const { id } = req.params;
      
      const stats = await playerMovementService.getPlayerStats(id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error in getPlayerStats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener estadísticas del jugador'
      });
    }
  }
}

export default new PlayerController();
