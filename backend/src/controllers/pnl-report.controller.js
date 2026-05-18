/**
 * Phase 14 Plan 14-03 — Weekly P&L REST controller.
 *
 * Three GET endpoints (all admin-gated at the route layer):
 *   GET /api/reportes/pnl/semanal            — JSON
 *   GET /api/reportes/pnl/semanal/excel      — xlsx attachment
 *   GET /api/reportes/pnl/semanal/pdf        — pdf attachment
 *
 * Query string: isoYear (int 2020..2099), isoWeek (int 1..53),
 *               apiSystemId (optional UUID).
 *
 * Validation rejects malformed inputs with 400 (T-14-03-02). Unknown errors
 * return generic 500 with full stack logged via Winston (T-14-03-03).
 *
 * @module pnl-report.controller
 */

import pnlReportService from '../services/pnl-report.service.js';
import logger from '../lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse + validate the (isoYear, isoWeek, apiSystemId) tuple from query string.
 * Throws an Error with statusCode=400 on invalid input.
 *
 * @param {object} query - express req.query
 * @returns {{ isoYear: number, isoWeek: number, apiSystemId: string|null }}
 */
function validateWeekParams(query) {
  const isoYear = parseInt(query.isoYear, 10);
  const isoWeek = parseInt(query.isoWeek, 10);
  const apiSystemId = query.apiSystemId || null;

  if (!Number.isInteger(isoYear) || isoYear < 2020 || isoYear > 2099) {
    const err = new Error('isoYear inválido (esperado entero 2020-2099)');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    const err = new Error('isoWeek inválido (esperado entero 1-53)');
    err.statusCode = 400;
    throw err;
  }
  if (apiSystemId !== null && !UUID_RE.test(apiSystemId)) {
    const err = new Error('apiSystemId no es un UUID válido');
    err.statusCode = 400;
    throw err;
  }

  return { isoYear, isoWeek, apiSystemId };
}

class PnlReportController {
  /**
   * GET /api/reportes/pnl/semanal
   */
  async getWeeklyPnl(req, res) {
    try {
      const params = validateWeekParams(req.query);
      const data = await pnlReportService.getWeeklyPnl(params);
      res.json({ success: true, data });
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] getWeeklyPnl failed', { error: error?.message, stack: error?.stack });
      res.status(500).json({ success: false, error: 'Error obteniendo P&L semanal' });
    }
  }

  /**
   * GET /api/reportes/pnl/semanal/provider-breakdown
   * Requires apiSystemId; per-game commission breakdown for the ISO week.
   */
  async getProviderBreakdown(req, res) {
    try {
      const params = validateWeekParams(req.query);
      if (!params.apiSystemId) {
        return res.status(400).json({
          success: false,
          error: 'apiSystemId es requerido para el desglose por proveedor',
        });
      }
      const { getProviderBreakdownForWeek } = await import(
        '../services/pnl-provider-breakdown.service.js'
      );
      const data = await getProviderBreakdownForWeek({
        apiSystemId: params.apiSystemId,
        isoYear: params.isoYear,
        isoWeek: params.isoWeek,
      });
      res.json({ success: true, data });
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] getProviderBreakdown failed', {
        error: error?.message,
        stack: error?.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Error obteniendo desglose de comisión por proveedor',
      });
    }
  }

  /**
   * GET /api/reportes/pnl/semanal/excel
   */
  async downloadPnlExcel(req, res) {
    try {
      const params = validateWeekParams(req.query);
      const buffer = await pnlReportService.buildPnlExcel(params);
      const tag = `${params.isoYear}-W${String(params.isoWeek).padStart(2, '0')}`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="pnl-${tag}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] downloadPnlExcel failed', { error: error?.message, stack: error?.stack });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error generando Excel de P&L semanal' });
      }
    }
  }

  /**
   * GET /api/reportes/pnl/semanal/pdf
   */
  async downloadPnlPdf(req, res) {
    try {
      const params = validateWeekParams(req.query);
      const buffer = await pnlReportService.buildPnlPdf(params);
      const tag = `${params.isoYear}-W${String(params.isoWeek).padStart(2, '0')}`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="pnl-${tag}.pdf"`);
      res.send(buffer);
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] downloadPnlPdf failed', { error: error?.message, stack: error?.stack });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error generando PDF de P&L semanal' });
      }
    }
  }

  /**
   * GET /api/reportes/pnl/semanal/proveedor/pdf
   * Provider-facing branded PDF — apiSystemId required.
   */
  async downloadProviderPnlPdf(req, res) {
    try {
      const params = validateWeekParams(req.query);
      if (!params.apiSystemId) {
        return res.status(400).json({ success: false, error: 'apiSystemId requerido' });
      }
      const buffer = await pnlReportService.buildProviderPdf(params);
      const tag = `${params.isoYear}-W${String(params.isoWeek).padStart(2, '0')}`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `attachment; filename="liquidacion-proveedor-${tag}.pdf"`);
      res.send(buffer);
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ success: false, error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ success: false, error: error.message });
      }
      logger.error('[pnl-report.controller] downloadProviderPnlPdf failed',
        { error: error?.message, stack: error?.stack });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error generando PDF de proveedor' });
      }
    }
  }
}

export default new PnlReportController();
export { PnlReportController, validateWeekParams };
