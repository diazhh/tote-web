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
   * GET /api/monitor/reporte/pdf
   * Generar y descargar reporte de sorteos como PDF.
   * Query params: same as getDailyReport (date, dateFrom, dateTo, gameId, source, apiSystemId)
   */
  async getReportePdf(req, res) {
    try {
      const { date, gameId, dateFrom, dateTo, source, apiSystemId } = req.query;

      // Resolve date range — identical logic to getDailyReport
      let resolvedFrom = dateFrom || null;
      let resolvedTo   = dateTo   || null;

      if (!resolvedFrom && !resolvedTo && date) {
        resolvedFrom = date;
        resolvedTo   = date;
      } else if (!resolvedFrom && !resolvedTo) {
        const today = new Date();
        today.setUTCHours(today.getUTCHours() - 4);
        const todayStr = today.toISOString().split('T')[0];
        resolvedFrom = todayStr;
        resolvedTo   = todayStr;
      }

      // Build filter summary string
      const SOURCE_LABELS = { TAQUILLA_ONLINE: 'Online', EXTERNAL_API: 'SRQ / API', WEBHOOK_PUSH: 'Webhook' };
      const filterParts = [
        `Período: ${resolvedFrom} al ${resolvedTo}`,
        gameId      ? `Juego ID: ${gameId}`                              : null,
        source      ? `Fuente: ${SOURCE_LABELS[source] ?? source}`       : null,
        apiSystemId ? `Proveedor ID: ${apiSystemId}`                     : null,
      ].filter(Boolean);
      const filterLabel = filterParts.join(' | ');

      // Fetch report data
      const report = await monitorService.getDailyReport({
        dateFrom:    resolvedFrom,
        dateTo:      resolvedTo,
        gameId:      gameId      || null,
        source:      source      || null,
        apiSystemId: apiSystemId || null,
      });

      // Currency formatter
      const fmt = (n) =>
        new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(n ?? 0);

      // Stream PDF response
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 70, left: 50, right: 50 }, bufferPages: true });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-${resolvedFrom}-${resolvedTo}.pdf"`);
      doc.pipe(res);

      // Table rendering helper
      function drawTable(doc, headers, colWidths, rows, startX = 50) {
        if (doc.y > 680) { doc.addPage(); }
        let x = startX, y = doc.y;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => { doc.text(h, x, y, { width: colWidths[i], align: 'left' }); x += colWidths[i]; });
        y += 14;
        doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
        y += 4;
        doc.fontSize(8).font('Helvetica');
        for (const row of rows) {
          if (y > 720) { doc.addPage(); y = 50; }
          x = startX;
          row.forEach((cell, i) => { doc.text(String(cell), x, y, { width: colWidths[i], align: 'left' }); x += colWidths[i]; });
          y += 12;
        }
        doc.y = y + 10;
      }

      // Title block
      doc.fontSize(18).font('Helvetica-Bold').text('REPORTE DE SORTEOS', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(filterLabel, { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(8).fillColor('#888').text(`Generado: ${new Date().toLocaleString('es-VE')}`, { align: 'center' });
      doc.fillColor('black').moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Resumen section
      const t = report.totals || {};
      doc.fontSize(12).font('Helvetica-Bold').text('RESUMEN');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      const col1 = 60, col2 = 280;
      let y = doc.y;
      doc.text('Ventas Totales:', col1, y);   doc.text(fmt(t.totalSales), col2, y);
      y += 16;
      doc.text('Premios Pagados:', col1, y);  doc.text(fmt(t.totalPrize), col2, y);
      y += 16;
      doc.text('Balance:', col1, y);          doc.text(fmt(t.totalBalance), col2, y);
      y += 16;
      doc.text('Sorteos:', col1, y);          doc.text(String(t.drawCount ?? 0), col2, y);
      y += 16;
      doc.text('Tickets:', col1, y);          doc.text(String(t.totalTickets ?? 0), col2, y);
      doc.y = y + 20;
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Desglose por Juego table
      doc.fontSize(12).font('Helvetica-Bold').text('DESGLOSE POR JUEGO'); doc.moveDown(0.3);
      drawTable(doc,
        ['Juego', 'Ventas', 'Premios', 'Balance', 'Sort.'],
        [150, 90, 90, 90, 40],
        (report.byGame || []).map(row => [row.game, fmt(row.totalSales), fmt(row.totalPrize), fmt(row.totalBalance), String(row.drawCount)])
      );
      doc.moveDown(0.5);

      // Desglose por Fuente table
      doc.fontSize(12).font('Helvetica-Bold').text('DESGLOSE POR FUENTE'); doc.moveDown(0.3);
      drawTable(doc,
        ['Fuente', 'Ventas', 'Tickets'],
        [200, 150, 100],
        (report.bySource || []).map(row => [SOURCE_LABELS[row.source] ?? row.source, fmt(row.totalSales), String(row.ticketCount)])
      );
      doc.moveDown(0.5);

      // Detalle por Sorteo table
      const sortedDraws = [...(report.draws || [])].sort((a, b) =>
        (a.drawDate + a.drawTime).localeCompare(b.drawDate + b.drawTime)
      );
      doc.fontSize(12).font('Helvetica-Bold').text('DETALLE POR SORTEO'); doc.moveDown(0.3);
      drawTable(doc,
        ['Fecha', 'Hora', 'Juego', 'Estado', 'Ganador', 'Ventas', 'Premios', 'Balance', 'Tickets'],
        [60, 40, 90, 60, 100, 65, 65, 65, 40],
        sortedDraws.map(draw => [
          draw.drawDate,
          draw.drawTime ?? '—',
          draw.game,
          draw.status,
          draw.winnerItem ? `${draw.winnerItem.number} - ${draw.winnerItem.name}` : '—',
          fmt(draw.totalSales),
          fmt(draw.totalPrize),
          fmt(draw.balance),
          String(draw.ticketCount),
        ])
      );

      // Footer on all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.save();
        doc.moveTo(50, 740).lineTo(562, 740).stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#555')
           .text(`Generado: ${new Date().toLocaleString('es-VE')} | Página ${i - range.start + 1} de ${range.count}`,
                 50, 745, { align: 'center', width: 512 });
        doc.fillColor('black').restore();
      }
      doc.end();

    } catch (error) {
      logger.error('Error en getReportePdf:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  /**
   * GET /api/monitor/items/:drawId/filtered
   * Obtener estadísticas por número filtradas por fuente/proveedor
   */
  async getItemStatsFiltered(req, res) {
    try {
      const { drawId } = req.params;
      const { source, apiSystemId } = req.query;
      const stats = await monitorService.getItemStatsFiltered(drawId, {
        source: source || null,
        apiSystemId: apiSystemId || null,
      });
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error en getItemStatsFiltered:', error);
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
  /**
   * GET /api/monitor/tickets
   * Listar tickets con filtros y paginación
   */
  async getTicketList(req, res) {
    try {
      const { dateFrom, dateTo, gameId, source, apiSystemId, page, pageSize } = req.query;
      const result = await monitorService.getTicketList({
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        gameId: gameId || null,
        source: source || null,
        apiSystemId: apiSystemId || null,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 50,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error en getTicketList:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new MonitorController();
