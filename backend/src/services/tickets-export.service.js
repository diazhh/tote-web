import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';

const MAX_RANGE_DAYS = 365;
const MAX_ROWS = 50000;

const SOURCE_LABELS = {
  TAQUILLA_ONLINE: 'Online',
  EXTERNAL_API: 'SRQ / API',
  WEBHOOK_PUSH: 'Webhook',
  EXTERNAL_SCRAPE: 'Scraping',
};

const STATUS_LABELS = {
  ACTIVE: 'Activo',
  WON: 'Ganador',
  LOST: 'Perdedor',
  CANCELLED: 'Cancelado',
};

class TicketsExportService {
  /**
   * Construye el Excel de tickets como Buffer.
   *
   * Aplica los mismos filtros que getTicketList pero sin paginación.
   *
   * @param {Object} opts
   * @param {string} opts.dateFrom    - YYYY-MM-DD (requerido)
   * @param {string} opts.dateTo      - YYYY-MM-DD (requerido)
   * @param {string} [opts.gameId]
   * @param {string} [opts.source]    - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH | EXTERNAL_SCRAPE
   * @param {string} [opts.apiSystemId]
   *
   * @returns {Promise<Buffer>}
   */
  async buildTicketsExcel({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null, playerSearch = null } = {}) {
    this._validateInputs({ dateFrom, dateTo });

    const where = { status: { not: 'CANCELLED' } };

    const drawWhere = {
      drawDate: {
        gte: new Date(`${dateFrom}T00:00:00.000Z`),
        lte: new Date(`${dateTo}T00:00:00.000Z`),
      },
    };
    if (gameId) drawWhere.gameId = gameId;
    where.draw = drawWhere;

    if (apiSystemId) {
      const sys = await prisma.apiSystem.findUnique({
        where: { id: apiSystemId },
        select: { mode: true },
      });
      if (sys?.mode === 'PUSH' || sys?.mode === 'SCRAPE') {
        where.apiSystemId = apiSystemId;
      } else {
        where.source = 'EXTERNAL_API';
      }
    } else if (source) {
      where.source = source;
    }

    const term = playerSearch ? String(playerSearch).trim() : '';
    if (term) {
      where.OR = [
        { user: { username: { contains: term, mode: 'insensitive' } } },
        { user: { email:    { contains: term, mode: 'insensitive' } } },
        { externalTicketId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const total = await prisma.ticket.count({ where });
    if (total > MAX_ROWS) {
      const err = new Error(
        `El rango seleccionado tiene ${total} tickets y supera el máximo (${MAX_ROWS}) por exportación. Reduce el rango de fechas o aplica más filtros.`,
      );
      err.statusCode = 400;
      throw err;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        draw: { include: { game: true, winnerItem: true } },
        apiSystem: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve filter labels for header
    let providerLabel = null;
    if (apiSystemId) {
      const sys = await prisma.apiSystem.findUnique({ where: { id: apiSystemId }, select: { name: true } });
      providerLabel = sys?.name || apiSystemId;
    }
    let gameLabel = null;
    if (gameId) {
      const game = await prisma.game.findUnique({ where: { id: gameId }, select: { name: true } });
      gameLabel = game?.name || gameId;
    }

    return this._buildWorkbook({
      tickets,
      dateFrom,
      dateTo,
      gameLabel,
      sourceLabel: !apiSystemId && source ? (SOURCE_LABELS[source] || source) : null,
      providerLabel,
    });
  }

  async _buildWorkbook({ tickets, dateFrom, dateTo, gameLabel, sourceLabel, providerLabel }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tote — Reporte de Tickets';
    wb.created = new Date();

    const ws = wb.addWorksheet('Tickets');

    // Header con rango + filtros
    const filterParts = [];
    if (gameLabel) filterParts.push(`juego: ${gameLabel}`);
    if (providerLabel) filterParts.push(`proveedor: ${providerLabel}`);
    else if (sourceLabel) filterParts.push(`fuente: ${sourceLabel}`);
    const filterSuffix = filterParts.length > 0
      ? ` (${filterParts.join(' · ')})`
      : '';

    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `Reporte de Tickets — ${dateFrom} a ${dateTo}${filterSuffix}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    ws.addRow([]);

    const headers = [
      'Ticket',
      'Fecha Sorteo',
      'Hora',
      'Juego',
      'Fuente',
      'Monto',
      'Premio',
      'Estado',
      'Fecha Registro',
    ];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    const dataStartRow = headerRow.number + 1;

    for (const t of tickets) {
      const ticketSourceLabel = t.apiSystem?.name || SOURCE_LABELS[t.source] || t.source;
      const ticketId = t.externalTicketId || `#${t.ticketNumber}`;
      const drawDateStr = t.draw?.drawDate
        ? t.draw.drawDate.toISOString().split('T')[0]
        : '';
      const drawTime = t.draw?.drawTime || '';
      const createdAtStr = t.createdAt
        ? t.createdAt.toISOString().replace('T', ' ').slice(0, 16)
        : '';

      ws.addRow([
        ticketId,
        drawDateStr,
        drawTime,
        t.draw?.game?.name || '',
        ticketSourceLabel,
        parseFloat(t.totalAmount) || 0,
        parseFloat(t.totalPrize) || 0,
        STATUS_LABELS[t.status] || t.status,
        createdAtStr,
      ]);
    }

    const dataEndRow = dataStartRow + tickets.length - 1;

    // TOTAL con fórmula
    ws.addRow([]);
    const totalRow = ws.addRow([
      'TOTAL',
      '',
      '',
      '',
      `${tickets.length} tickets`,
      tickets.length > 0 ? { formula: `SUM(F${dataStartRow}:F${dataEndRow})` } : 0,
      tickets.length > 0 ? { formula: `SUM(G${dataStartRow}:G${dataEndRow})` } : 0,
      '',
      '',
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    // Anchos de columna
    ws.getColumn(1).width = 18; // Ticket
    ws.getColumn(2).width = 12; // Fecha sorteo
    ws.getColumn(3).width = 10; // Hora
    ws.getColumn(4).width = 22; // Juego
    ws.getColumn(5).width = 16; // Fuente
    ws.getColumn(6).width = 14; // Monto
    ws.getColumn(7).width = 14; // Premio
    ws.getColumn(8).width = 12; // Estado
    ws.getColumn(9).width = 18; // Fecha registro

    // Formato moneda en columnas F, G (data + total)
    for (let r = dataStartRow; r <= totalRow.number; r++) {
      ws.getCell(`F${r}`).numFmt = '#,##0.00';
      ws.getCell(`G${r}`).numFmt = '#,##0.00';
    }

    // Borde inferior en última fila de datos
    if (tickets.length > 0) {
      for (let c = 1; c <= 9; c++) {
        ws.getRow(dataEndRow).getCell(c).border = {
          bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        };
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  _validateInputs({ dateFrom, dateTo }) {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFrom || !dateRe.test(dateFrom)) {
      const err = new Error('dateFrom inválido (esperado YYYY-MM-DD)');
      err.statusCode = 400;
      throw err;
    }
    if (!dateTo || !dateRe.test(dateTo)) {
      const err = new Error('dateTo inválido (esperado YYYY-MM-DD)');
      err.statusCode = 400;
      throw err;
    }
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const to = new Date(`${dateTo}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      const err = new Error('dateFrom o dateTo no son fechas válidas');
      err.statusCode = 400;
      throw err;
    }
    if (from > to) {
      const err = new Error('dateFrom no puede ser mayor que dateTo');
      err.statusCode = 400;
      throw err;
    }
    const days = (to - from) / (1000 * 60 * 60 * 24);
    if (days > MAX_RANGE_DAYS) {
      const err = new Error(`Rango máximo permitido: ${MAX_RANGE_DAYS} días`);
      err.statusCode = 400;
      throw err;
    }
  }
}

export default new TicketsExportService();
