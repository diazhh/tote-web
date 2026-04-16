import portalService from '../services/portal.service.js';
import logger from '../lib/logger.js';

const portalController = {
  async getMe(req, res) {
    try {
      const result = await portalService.getMe({ apiSystemId: req.apiSystemId, user: req.user });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getMe:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async listTickets(req, res) {
    try {
      const { dateFrom, dateTo, gameId, status, page, pageSize } = req.query;
      const result = await portalService.listTickets({
        apiSystemId: req.apiSystemId,
        filters: { dateFrom, dateTo, gameId, status },
        page, pageSize,
      });
      return res.json(result);
    } catch (err) {
      logger.error('portal.listTickets:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async getTicket(req, res) {
    try {
      const result = await portalService.getTicket({
        apiSystemId: req.apiSystemId,
        ticketId: req.params.id,
      });
      if (!result) return res.status(404).json({ error: 'No encontrado' });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getTicket:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async listDraws(req, res) {
    try {
      const { dateFrom, dateTo, gameId, page, pageSize } = req.query;
      const result = await portalService.listDraws({
        apiSystemId: req.apiSystemId,
        filters: { dateFrom, dateTo, gameId },
        page, pageSize,
      });
      return res.json(result);
    } catch (err) {
      logger.error('portal.listDraws:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },

  async getDraw(req, res) {
    try {
      const result = await portalService.getDraw({
        apiSystemId: req.apiSystemId,
        drawId: req.params.id,
      });
      if (!result) return res.status(404).json({ error: 'No encontrado' });
      return res.json(result);
    } catch (err) {
      logger.error('portal.getDraw:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  },
};

export default portalController;
