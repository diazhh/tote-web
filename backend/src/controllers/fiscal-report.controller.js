import fiscalReportService from '../services/fiscal-report.service.js';
import logger from '../lib/logger.js';

class FiscalReportController {
  /**
   * GET /api/fiscal/report
   * Query: dateFrom, dateTo, gameIds (CSV), apiSystemIds (CSV), includeTaquilla (bool)
   */
  async getReport(req, res) {
    try {
      const { dateFrom, dateTo, gameIds, apiSystemIds, includeTaquilla } = req.query;
      const parseCsv = (v) =>
        typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
      const result = await fiscalReportService.getReport({
        dateFrom,
        dateTo,
        gameIds: parseCsv(gameIds),
        apiSystemIds: parseCsv(apiSystemIds),
        includeTaquilla: includeTaquilla === 'false' ? false : true,
        scope: req.fiscalScope,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ success: false, error: err.message });
      }
      logger.error('[fiscal-report] getReport error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** GET /api/fiscal/scope — devuelve juegos y proveedores visibles + flags. */
  async getScope(req, res) {
    try {
      const [games, apiSystems] = await Promise.all([
        fiscalReportService.getVisibleGames(req.fiscalScope),
        fiscalReportService.getVisibleApiSystems(req.fiscalScope),
      ]);
      res.json({
        success: true,
        data: {
          games,
          apiSystems,
          includeTaquilla: req.fiscalScope.includeTaquilla,
        },
      });
    } catch (err) {
      logger.error('[fiscal-report] getScope error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new FiscalReportController();
