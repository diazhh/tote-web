import * as cashFlow from '../services/cash-flow.service.js';
import logger from '../lib/logger.js';

function parseRange(req) {
  const { from, to, accountId } = req.query;
  if (!from || !to) {
    const err = new Error('from y to son requeridos (YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const err = new Error('from o to inválido');
    err.statusCode = 400;
    throw err;
  }
  return { fromDate, toDate, accountId: accountId || undefined };
}

class CashFlowController {
  async getJson(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      res.json({ success: true, data: report });
    } catch (err) {
      logger.error('[cash-flow.controller] getJson', err);
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }

  async getExcel(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      const buffer = await cashFlow.buildExcel(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="flujo-caja-${report.from}-${report.to}.xlsx"`);
      res.send(buffer);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }

  async getPdf(req, res) {
    try {
      const { fromDate, toDate, accountId } = parseRange(req);
      const report = await cashFlow.getReport({ from: fromDate, to: toDate, accountId });
      const buffer = await cashFlow.buildPdf(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="flujo-caja-${report.from}-${report.to}.pdf"`);
      res.send(buffer);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ success: false, error: err.message });
    }
  }
}

export default new CashFlowController();
