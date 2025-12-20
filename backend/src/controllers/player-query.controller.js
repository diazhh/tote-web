import playerQueryService from '../services/player-query.service.js';
import logger from '../lib/logger.js';

class PlayerQueryController {
  async getBalance(req, res) {
    try {
      const userId = req.user.id;
      const balance = await playerQueryService.getPlayerBalance(userId);

      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      logger.error('Error in getBalance:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener balance'
      });
    }
  }

  async getTransactions(req, res) {
    try {
      const userId = req.user.id;
      const { type, status, limit, offset, startDate, endDate } = req.query;

      const result = await playerQueryService.getPlayerTransactions(userId, {
        type,
        status,
        limit,
        offset,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: result.transactions,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getTransactions:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener transacciones'
      });
    }
  }

  async getStatistics(req, res) {
    try {
      const userId = req.user.id;
      const statistics = await playerQueryService.getPlayerStatistics(userId);

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error in getStatistics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener estadísticas'
      });
    }
  }

  async getTickets(req, res) {
    try {
      const userId = req.user.id;
      const { status, drawId, limit, offset } = req.query;

      const result = await playerQueryService.getPlayerTickets(userId, {
        status,
        drawId,
        limit,
        offset
      });

      res.json({
        success: true,
        data: result.tickets,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getTickets:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener tickets'
      });
    }
  }

  async getDeposits(req, res) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      const result = await playerQueryService.getPlayerDeposits(userId, {
        status,
        limit,
        offset
      });

      res.json({
        success: true,
        data: result.deposits,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getDeposits:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener depósitos'
      });
    }
  }

  async getWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const { status, limit, offset } = req.query;

      const result = await playerQueryService.getPlayerWithdrawals(userId, {
        status,
        limit,
        offset
      });

      res.json({
        success: true,
        data: result.withdrawals,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getWithdrawals:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener retiros'
      });
    }
  }

  async getBalanceHistory(req, res) {
    try {
      const userId = req.user.id;
      const history = await playerQueryService.getBalanceHistory(userId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error in getBalanceHistory:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener historial de balance'
      });
    }
  }
}

export default new PlayerQueryController();
