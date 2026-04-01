/**
 * Controlador para el Monitor de Sorteos
 */

import monitorService from '../services/monitor.service.js';
import logger from '../lib/logger.js';

class MonitorController {
  /**
   * GET /api/monitor/bancas/:drawId
   * Obtener estadísticas por banca para un sorteo
   */
  async getBancaStats(req, res) {
    try {
      const { drawId } = req.params;
      const stats = await monitorService.getBancaStats(drawId);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error en getBancaStats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/monitor/items/:drawId
   * Obtener estadísticas por número/item para un sorteo
   */
  async getItemStats(req, res) {
    try {
      const { drawId } = req.params;
      const stats = await monitorService.getItemStats(drawId);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error en getItemStats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/monitor/reporte
   * Obtener reporte de sorteos.
   * Query params:
   *   date       YYYY-MM-DD (legacy single day — sets dateFrom=dateTo=date)
   *   dateFrom   YYYY-MM-DD start of range (BACK-01)
   *   dateTo     YYYY-MM-DD end of range (BACK-01)
   *   gameId     UUID (optional game filter)
   *   source     TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH (BACK-02)
   *   apiSystemId UUID (optional ApiSystem filter — BACK-02)
   */
  async getDailyReport(req, res) {
    try {
      const { date, gameId, dateFrom, dateTo, source, apiSystemId } = req.query;

      // Resolve date range — support legacy single-date param
      let resolvedFrom = dateFrom || null;
      let resolvedTo   = dateTo   || null;

      if (!resolvedFrom && !resolvedTo && date) {
        resolvedFrom = date;
        resolvedTo   = date;
      } else if (!resolvedFrom && !resolvedTo) {
        // No date at all — default to today in Venezuela (UTC-4)
        const today = new Date();
        today.setUTCHours(today.getUTCHours() - 4); // shift to Caracas
        const todayStr = today.toISOString().split('T')[0];
        resolvedFrom = todayStr;
        resolvedTo   = todayStr;
      }

      const report = await monitorService.getDailyReport({
        dateFrom:    resolvedFrom,
        dateTo:      resolvedTo,
        gameId:      gameId      || null,
        source:      source      || null,
        apiSystemId: apiSystemId || null
      });
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Error en getDailyReport:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/monitor/tickets-by-banca/:drawId/:bancaId
   * Obtener tickets de una banca específica
   */
  async getTicketsByBanca(req, res) {
    try {
      const { drawId, bancaId } = req.params;
      const tickets = await monitorService.getTicketsByBanca(drawId, parseInt(bancaId));
      res.json({ success: true, data: tickets });
    } catch (error) {
      logger.error('Error en getTicketsByBanca:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/monitor/tickets-by-item/:drawId/:itemId
   * Obtener tickets de un item específico
   */
  async getTicketsByItem(req, res) {
    try {
      const { drawId, itemId } = req.params;
      const tickets = await monitorService.getTicketsByItem(drawId, itemId);
      res.json({ success: true, data: tickets });
    } catch (error) {
      logger.error('Error en getTicketsByItem:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/monitor/tripletas-by-item/:drawId/:itemId
   * Obtener tripletas que incluyen un item específico
   */
  async getTripletasByItem(req, res) {
    try {
      const { drawId, itemId } = req.params;
      const tripletas = await monitorService.getTripletasByItem(drawId, itemId);
      res.json({ success: true, data: tripletas });
    } catch (error) {
      logger.error('Error en getTripletasByItem:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new MonitorController();
