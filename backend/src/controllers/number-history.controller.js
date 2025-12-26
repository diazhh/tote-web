import numberHistoryService from '../services/number-history.service.js';
import logger from '../lib/logger.js';

class NumberHistoryController {
  /**
   * Get last seen info for a specific number
   * GET /api/number-history/:gameId/:number/last-seen
   */
  async getLastSeen(req, res) {
    try {
      const { gameId, number } = req.params;
      
      const result = await numberHistoryService.getNumberLastSeen(gameId, number);
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in getLastSeen:', error);
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo última aparición del número'
      });
    }
  }

  /**
   * Get history (last 10 wins) for a specific number
   * GET /api/number-history/:gameId/:number/history
   */
  async getHistory(req, res) {
    try {
      const { gameId, number } = req.params;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await numberHistoryService.getNumberHistory(gameId, number, limit);
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in getHistory:', error);
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo historial del número'
      });
    }
  }

  /**
   * Get last seen info for all numbers in a game
   * GET /api/number-history/:gameId/all
   */
  async getAllLastSeen(req, res) {
    try {
      const { gameId } = req.params;
      
      const result = await numberHistoryService.getAllNumbersLastSeen(gameId);
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in getAllLastSeen:', error);
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo información de números'
      });
    }
  }
}

export default new NumberHistoryController();
