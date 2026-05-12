import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const MAX_RANGE_DAYS = 365;

class AccountingReportService {
  /**
   * Genera el reporte contable agregado por (fecha, juego).
   *
   * @param {Object} opts
   * @param {string} opts.dateFrom - YYYY-MM-DD (inclusive)
   * @param {string} opts.dateTo   - YYYY-MM-DD (inclusive)
   * @param {string} [opts.gameId] - opcional, filtra un solo juego
   * @param {string} [opts.source] - TAQUILLA_ONLINE | EXTERNAL_API | WEBHOOK_PUSH | EXTERNAL_SCRAPE
   * @param {string} [opts.apiSystemId] - UUID del ApiSystem (filtra por proveedor)
   *
   * @returns {Promise<{
   *   dateFrom: string,
   *   dateTo: string,
   *   gameId: string|null,
   *   source: string|null,
   *   apiSystemId: string|null,
   *   rows: Array<{
   *     date: string,           // YYYY-MM-DD
   *     gameId: string,
   *     game: string,
   *     totalSales: number,
   *     totalPrize: number,
   *     utility: number,
   *     ticketCount: number,
   *   }>,
   *   totals: { totalSales, totalPrize, utility, ticketCount }
   * }>}
   */
  async getAccountingReport({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null } = {}) {
    this._validateInputs({ dateFrom, dateTo, gameId });

    if (gameId) {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true },
      });
      if (!game) {
        const err = new Error(`Game ${gameId} no encontrado`);
        err.statusCode = 400;
        throw err;
      }
    }

    const drawWhere = {
      drawDate: {
        gte: new Date(`${dateFrom}T00:00:00.000Z`),
        lte: new Date(`${dateTo}T00:00:00.000Z`),
      },
      ...(gameId && { gameId }),
    };

    // apiSystemId: resolve PUSH/SCRAPE vs PULL providers
    // (mismo patrón que monitor.service.getDailyReport)
    let pushProviderFilter = false;
    if (apiSystemId) {
      const apiSystem = await prisma.apiSystem.findUnique({
        where: { id: apiSystemId },
        select: { mode: true },
      });
      if (apiSystem?.mode === 'PUSH' || apiSystem?.mode === 'SCRAPE') {
        pushProviderFilter = true;
      } else {
        // PULL providers: filter draws by ApiDrawMapping
        const mappings = await prisma.apiDrawMapping.findMany({
          where: { apiConfig: { apiSystemId } },
          select: { drawId: true },
        });
        if (mappings.length === 0) {
          return {
            dateFrom,
            dateTo,
            gameId: gameId || null,
            source: source || null,
            apiSystemId,
            rows: [],
            totals: { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
          };
        }
        drawWhere.id = { in: mappings.map((m) => m.drawId) };
      }
    }

    const ticketsInclude = {
      where: { status: { not: 'CANCELLED' } },
      select: { totalAmount: true, totalPrize: true, source: true, providerData: true },
    };
    if (pushProviderFilter) {
      ticketsInclude.where.apiSystemId = apiSystemId;
    } else if (source) {
      ticketsInclude.where.source = source;
    }

    const draws = await prisma.draw.findMany({
      where: drawWhere,
      include: {
        game: { select: { id: true, name: true } },
        tickets: ticketsInclude,
      },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }],
    });

    // Premios de tripletas externas atribuidos por prizeDrawId.
    // Sólo aplican cuando el filtro de fuente las incluye (sin filtro o EXTERNAL_API).
    // Si se filtra por un apiSystemId PUSH/SCRAPE no hay tripletas externas (SRQ es PULL).
    const tripletaPrizeByDraw = {};
    const includesTripletaPrizes = !pushProviderFilter && (!source || source === 'EXTERNAL_API');
    if (includesTripletaPrizes && draws.length > 0) {
      const drawIds = draws.map((d) => d.id);
      const tripletaWinners = await prisma.ticket.findMany({
        where: { prizeDrawId: { in: drawIds }, status: 'WON' },
        select: { prizeDrawId: true, totalPrize: true },
      });
      for (const t of tripletaWinners) {
        tripletaPrizeByDraw[t.prizeDrawId] =
          (tripletaPrizeByDraw[t.prizeDrawId] || 0) + parseFloat(t.totalPrize);
      }
    }

    // Agregar en Map keyed por `${YYYY-MM-DD}|${gameId}`
    const byDayGame = new Map();

    for (const draw of draws) {
      const tickets = draw.tickets || [];
      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

      const regularPrize = tickets
        .filter((t) => !(t.source === 'EXTERNAL_API' && t.providerData?.type === 'TRIPLETA'))
        .reduce((sum, t) => sum + parseFloat(t.totalPrize), 0);
      const totalPrize = regularPrize + (tripletaPrizeByDraw[draw.id] || 0);

      const dateKey = draw.drawDate.toISOString().split('T')[0];
      const key = `${dateKey}|${draw.gameId}`;

      if (!byDayGame.has(key)) {
        byDayGame.set(key, {
          date: dateKey,
          gameId: draw.gameId,
          game: draw.game.name,
          totalSales: 0,
          totalPrize: 0,
          utility: 0,
          ticketCount: 0,
        });
      }
      const row = byDayGame.get(key);
      row.totalSales += totalSales;
      row.totalPrize += totalPrize;
      row.utility += totalSales - totalPrize;
      row.ticketCount += tickets.length;
    }

    const rows = Array.from(byDayGame.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.game.localeCompare(b.game);
    });

    const totals = rows.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        totalPrize: acc.totalPrize + r.totalPrize,
        utility: acc.utility + r.utility,
        ticketCount: acc.ticketCount + r.ticketCount,
      }),
      { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
    );

    return {
      dateFrom,
      dateTo,
      gameId: gameId || null,
      source: source || null,
      apiSystemId: apiSystemId || null,
      rows,
      totals,
    };
  }

  /**
   * Genera el Excel del reporte contable como Buffer.
   *
   * @param {Object} opts - igual que getAccountingReport
   * @returns {Promise<Buffer>}
   */
  async buildAccountingExcel(opts) {
    const report = await this.getAccountingReport(opts);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tote — Reporte Contable';
    wb.created = new Date();

    const ws = wb.addWorksheet('Reporte Contable');

    // Encabezado: rango y filtros aplicados
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    const filterParts = [];
    if (report.gameId) {
      filterParts.push(`juego: ${report.rows[0]?.game ?? report.gameId}`);
    }
    if (report.apiSystemId) {
      filterParts.push(`proveedor: ${report.apiSystemId}`);
    } else if (report.source) {
      filterParts.push(`fuente: ${report.source}`);
    }
    const filterSuffix = filterParts.length > 0
      ? ` (${filterParts.join(' · ')})`
      : ' (todos los juegos)';
    titleCell.value = `Reporte Contable — ${report.dateFrom} a ${report.dateTo}${filterSuffix}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    ws.addRow([]); // fila en blanco

    // Cabeceras
    const headers = ['Fecha', 'Juego', 'Ventas', 'Premios', 'Utilidad', 'Tickets'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Datos
    const dataStartRow = headerRow.number + 1;
    for (const row of report.rows) {
      ws.addRow([
        row.date,
        row.game,
        row.totalSales,
        row.totalPrize,
        row.utility,
        row.ticketCount,
      ]);
    }
    const dataEndRow = dataStartRow + report.rows.length - 1;

    // Fila TOTAL con fórmulas (auditable)
    ws.addRow([]); // separador
    const totalRow = ws.addRow([
      'TOTAL',
      '',
      report.rows.length > 0 ? { formula: `SUM(C${dataStartRow}:C${dataEndRow})` } : 0,
      report.rows.length > 0 ? { formula: `SUM(D${dataStartRow}:D${dataEndRow})` } : 0,
      report.rows.length > 0 ? { formula: `SUM(E${dataStartRow}:E${dataEndRow})` } : 0,
      report.rows.length > 0 ? { formula: `SUM(F${dataStartRow}:F${dataEndRow})` } : 0,
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    // Formato de columnas
    ws.getColumn(1).width = 12; // Fecha
    ws.getColumn(2).width = 22; // Juego
    ws.getColumn(3).width = 16; // Ventas
    ws.getColumn(4).width = 16; // Premios
    ws.getColumn(5).width = 16; // Utilidad
    ws.getColumn(6).width = 10; // Tickets

    // Formato moneda en columnas C, D, E (filas de datos + total)
    for (let r = dataStartRow; r <= totalRow.number; r++) {
      ['C', 'D', 'E'].forEach((col) => {
        ws.getCell(`${col}${r}`).numFmt = '#,##0.00';
      });
      ws.getCell(`F${r}`).numFmt = '#,##0';
    }

    // Borde inferior en última fila de datos
    if (report.rows.length > 0) {
      for (let c = 1; c <= 6; c++) {
        ws.getRow(dataEndRow).getCell(c).border = {
          bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        };
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ---------- Helpers ----------

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

export default new AccountingReportService();
