import fiscalReportService from '../services/fiscal-report.service.js';
import logger from '../lib/logger.js';

/**
 * Controlador del rol VIEWER (visor).
 *
 * Reutiliza el mismo motor de cálculo del fiscalizador
 * (fiscalReportService). El visor ve: ventas, premios, utilidad y número de
 * tickets vendidos (solo tickets NO anulados — el service filtra
 * status != CANCELLED). El visor filtra por fecha y por juego; el alcance de
 * proveedores se aplica automáticamente desde su scope (UserApiSystem).
 */
class VisorReportController {
  /**
   * GET /api/visor/report
   * Query: dateFrom, dateTo, gameIds (CSV)
   */
  async getReport(req, res) {
    try {
      const { dateFrom, dateTo, gameIds } = req.query;
      const parseCsv = (v) =>
        typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;

      const full = await fiscalReportService.getReport({
        dateFrom,
        dateTo,
        gameIds: parseCsv(gameIds),
        // El visor no elige proveedores: usa el scope asignado tal cual.
        apiSystemIds: null,
        includeTaquilla: true, // se recorta contra scope.includeTaquilla en el service
        scope: req.fiscalScope,
      });

      // Ventas, premios, utilidad y nº de tickets (solo no anulados).
      const rows = full.rows.map((r) => ({
        date: r.date,
        gameId: r.gameId,
        game: r.game,
        totalSales: r.totalSales,
        totalPrize: r.totalPrize,
        utility: r.utility,
        ticketCount: r.ticketCount,
      }));
      const totals = {
        totalSales: full.totals.totalSales,
        totalPrize: full.totals.totalPrize,
        utility: full.totals.utility,
        ticketCount: full.totals.ticketCount,
      };

      res.json({
        success: true,
        data: { dateFrom: full.dateFrom, dateTo: full.dateTo, rows, totals },
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ success: false, error: err.message });
      }
      logger.error('[visor-report] getReport error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /** GET /api/visor/scope — juegos visibles para el visor. */
  async getScope(req, res) {
    try {
      const games = await fiscalReportService.getVisibleGames(req.fiscalScope);
      res.json({ success: true, data: { games } });
    } catch (err) {
      logger.error('[visor-report] getScope error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new VisorReportController();
