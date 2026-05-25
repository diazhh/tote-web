import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { resolveApiSystemFilter } from './monitor.service.js';

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
  async getAccountingReport({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null, useMaterialized = false } = {}) {
    if (useMaterialized) {
      return this._getAccountingReportMaterialized({ dateFrom, dateTo, gameId, source, apiSystemId });
    }
    return this._getAccountingReportLegacy({ dateFrom, dateTo, gameId, source, apiSystemId });
  }

  /**
   * LEGACY branch — verbatim move of pre-refactor getAccountingReport body.
   * Only the apiSystem PULL/PUSH/SCRAPE resolution block is replaced with the shared
   * resolveApiSystemFilter helper — same downstream behavior.
   */
  async _getAccountingReportLegacy({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null } = {}) {
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

    // apiSystemId: resolve PUSH/SCRAPE vs PULL providers via shared helper.
    let pushProviderFilter = false;
    if (apiSystemId) {
      const resolved = await resolveApiSystemFilter(apiSystemId);
      if (resolved.pushProviderFilter) {
        pushProviderFilter = true;
      } else {
        // PULL providers: filter draws by ApiDrawMapping
        if (resolved.drawIdsForPull.length === 0) {
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
        drawWhere.id = { in: resolved.drawIdsForPull };
      }
    }

    // Filtro Ticket: respeta proveedor/fuente
    const ticketFilter = { status: { not: 'CANCELLED' } };
    if (pushProviderFilter) {
      ticketFilter.apiSystemId = apiSystemId;
    } else if (source) {
      ticketFilter.source = source;
    }

    const draws = await prisma.draw.findMany({
      where: drawWhere,
      include: { game: { select: { id: true, name: true } } },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }],
    });

    // Atribución por TicketDetail.drawId (NO por Ticket.drawId). Esto evita
    // el bug donde un ticket multi-sorteo (ej. virtuales que apuesta el
    // mismo número en 5 sorteos consecutivos) atribuía toda su venta y
    // su premio al sorteo "ancla", distorsionando el P/L por sorteo.
    const drawIdsAll = draws.map((d) => d.id);
    const detailsAll = drawIdsAll.length > 0
      ? await prisma.ticketDetail.findMany({
          where: { drawId: { in: drawIdsAll }, ticket: ticketFilter },
          include: {
            ticket: { select: { id: true, source: true, providerData: true } },
          },
        })
      : [];

    // Index: drawId → { totalSales, ticketIds:Set, regularPrize }
    const detailsByDraw = new Map();
    for (const d of detailsAll) {
      const t = d.ticket;
      const isExternalTripleta = t.source === 'EXTERNAL_API' && t.providerData?.type === 'TRIPLETA';
      let entry = detailsByDraw.get(d.drawId);
      if (!entry) {
        entry = { totalSales: 0, ticketIds: new Set(), regularPrize: 0 };
        detailsByDraw.set(d.drawId, entry);
      }
      entry.totalSales += parseFloat(d.amount);
      entry.ticketIds.add(t.id);
      if (!isExternalTripleta) {
        entry.regularPrize += parseFloat(d.prize || 0);
      }
    }

    // Premios de tripletas externas atribuidos por prizeDrawId.
    // Sólo aplican cuando el filtro de fuente las incluye (sin filtro o EXTERNAL_API).
    // Si se filtra por un apiSystemId PUSH/SCRAPE no hay tripletas externas (SRQ es PULL).
    const tripletaPrizeByDraw = {};
    const includesTripletaPrizes = !pushProviderFilter && (!source || source === 'EXTERNAL_API');
    if (includesTripletaPrizes && draws.length > 0) {
      const tripletaWinners = await prisma.ticket.findMany({
        where: { prizeDrawId: { in: drawIdsAll }, status: 'WON' },
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
      const entry = detailsByDraw.get(draw.id) || { totalSales: 0, ticketIds: new Set(), regularPrize: 0 };
      const totalSales = entry.totalSales;
      const ticketCount = entry.ticketIds.size;
      const totalPrize = entry.regularPrize + (tripletaPrizeByDraw[draw.id] || 0);

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
      row.ticketCount += ticketCount;
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
   * MATERIALIZED branch — aggregates from DrawFinancial (+ DrawFinancialProvider) per (date, gameId).
   *
   * Response shape identical to _getAccountingReportLegacy (FIN-REPORT-03).
   *
   * Falls back to legacy when:
   *   - `source` filter is set: per-ticket source is not preserved by materialized aggregates
   */
  async _getAccountingReportMaterialized({ dateFrom, dateTo, gameId = null, source = null, apiSystemId = null } = {}) {
    if (source) {
      logger.warn(`[accounting-report.service] _getAccountingReportMaterialized: source filter '${source}' not supported — falling back to legacy`);
      return this._getAccountingReportLegacy({ dateFrom, dateTo, gameId, source, apiSystemId });
    }

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

    const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
    const toDate   = new Date(`${dateTo}T00:00:00.000Z`);

    // Resolve apiSystem filter via shared helper.
    const resolved = await resolveApiSystemFilter(apiSystemId);
    if (apiSystemId && !resolved.pushProviderFilter && resolved.drawIdsForPull.length === 0) {
      return {
        dateFrom, dateTo,
        gameId: gameId || null,
        source: null,
        apiSystemId,
        rows: [],
        totals: { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
      };
    }

    const gameFilter = gameId
      ? Prisma.sql`AND d."gameId" = ${gameId}`
      : Prisma.empty;
    const pullDrawFilter = (apiSystemId && !resolved.pushProviderFilter)
      ? Prisma.sql`AND d.id IN (${Prisma.join(resolved.drawIdsForPull)})`
      : Prisma.empty;

    // When a PUSH/SCRAPE apiSystem filter is active, swap the join target so we
    // aggregate the per-provider row instead of the whole-draw row.
    const aggregateRows = (apiSystemId && resolved.pushProviderFilter)
      ? await prisma.$queryRaw`
          SELECT to_char(d."drawDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD')         AS "date",
                 d."gameId"                                                      AS "gameId",
                 g.name                                                          AS "game",
                 COALESCE(SUM(dfp."totalSales"), 0)::numeric(12,2)               AS "totalSales",
                 COALESCE(SUM(dfp."totalPrize"), 0)::numeric(12,2)               AS "totalPrize",
                 (COALESCE(SUM(dfp."totalSales"), 0)
                    - COALESCE(SUM(dfp."totalPrize"), 0))::numeric(12,2)         AS "utility",
                 COALESCE(SUM(dfp."ticketCount"), 0)::int                        AS "ticketCount"
          FROM   "Draw" d
          JOIN   "Game" g                  ON g.id = d."gameId"
          LEFT JOIN "DrawFinancialProvider" dfp ON dfp."drawId" = d.id AND dfp."apiSystemId" = ${apiSystemId}
          WHERE  d."drawDate" >= ${fromDate}
            AND  d."drawDate" <= ${toDate}
            ${gameFilter}
            ${pullDrawFilter}
          GROUP  BY 1, 2, 3
          ORDER  BY 1 ASC, 3 ASC
        `
      : await prisma.$queryRaw`
          SELECT to_char(d."drawDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD')         AS "date",
                 d."gameId"                                                      AS "gameId",
                 g.name                                                          AS "game",
                 COALESCE(SUM(df."totalSales"), 0)::numeric(12,2)                AS "totalSales",
                 COALESCE(SUM(df."totalPrize"), 0)::numeric(12,2)                AS "totalPrize",
                 (COALESCE(SUM(df."totalSales"), 0)
                    - COALESCE(SUM(df."totalPrize"), 0))::numeric(12,2)          AS "utility",
                 COALESCE(SUM(df."ticketCount"), 0)::int                         AS "ticketCount"
          FROM   "Draw" d
          JOIN   "Game" g            ON g.id = d."gameId"
          LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
          WHERE  d."drawDate" >= ${fromDate}
            AND  d."drawDate" <= ${toDate}
            ${gameFilter}
            ${pullDrawFilter}
          GROUP  BY 1, 2, 3
          ORDER  BY 1 ASC, 3 ASC
        `;

    const rows = aggregateRows.map((r) => ({
      date:        r.date,
      gameId:      r.gameId,
      game:        r.game,
      totalSales:  parseFloat(r.totalSales),
      totalPrize:  parseFloat(r.totalPrize),
      utility:     parseFloat(r.utility),
      ticketCount: parseInt(r.ticketCount, 10),
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        totalPrize: acc.totalPrize + r.totalPrize,
        utility:    acc.utility    + r.utility,
        ticketCount: acc.ticketCount + r.ticketCount,
      }),
      { totalSales: 0, totalPrize: 0, utility: 0, ticketCount: 0 },
    );

    return {
      dateFrom,
      dateTo,
      gameId: gameId || null,
      source: null,
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
