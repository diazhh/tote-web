import conciliacionService from '../services/conciliacion.service.js';
import logger from '../lib/logger.js';

class ConciliacionController {
  /**
   * GET /api/conciliacion
   * Query params: dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD), gameIds[] (UUID[])
   */
  async getReport(req, res) {
    try {
      const { dateFrom, dateTo } = req.query;
      // Express's `qs` parser strips the `[]` suffix, so gameIds[]=a&gameIds[]=b
      // lands on req.query.gameIds. Fallback covers older parsers that preserve it.
      const raw = req.query.gameIds ?? req.query['gameIds[]'];
      const gameIds = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);

      const data = await conciliacionService.getConciliacion({ dateFrom, dateTo, gameIds });
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error en getReport conciliacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new ConciliacionController();
