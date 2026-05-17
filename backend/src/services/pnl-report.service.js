/**
 * Phase 14 Plan 14-03 — Weekly P&L Aggregation Service.
 *
 * Computes a single ISO-week row joining three Phase 11/12/13 data sources:
 *   - DrawFinancial / DrawFinancialProvider (Phase 11) — income + prizes
 *   - ProviderWeeklySettlement              (Phase 12) — commissions
 *   - AccountingEntry                       (Phase 13) — expenses + other income
 * Plus an ExchangeRate lookup for USD column display (D-01 — "most recent
 * rate AS OF Monday of the week"; DIFFERS from Phase 13 D-01 same-day pick).
 *
 * Formula (D-02):
 *   weekIncome       = SUM(DrawFinancial.totalSales)
 *   weekPrizes       = SUM(DrawFinancial.totalPrize)
 *   weekGrossUtility = weekIncome - weekPrizes
 *   weekCommissions  = SUM(ProviderWeeklySettlement.amount)        (matching isoYear+isoWeek)
 *   weekExpenses     = SUM(AccountingEntry.amountBsF) WHERE type='EXPENSE'  (D-02 — PAYMENT EXCLUDED to avoid double-count of commissions; P-B)
 *   weekNet          = weekGrossUtility - weekCommissions - weekExpenses
 *
 * Other Income is a separate row, NOT netted into weekNet:
 *   otherIncome      = SUM(AccountingEntry.amountBsF) WHERE type='INCOME'
 *
 * Provider-filtered mode (apiSystemId set, D-04):
 *   - income/prizes computed from DrawFinancialProvider scoped to apiSystemId
 *   - commissions = that provider's settlement for the week
 *   - expenses + otherIncome = null (EXPENSE entries are not per-provider)
 *
 * Empty week (P-C): every SUM aggregate is COALESCE-wrapped so the response
 * is a clean zero row, NOT a 500.
 *
 * Monetary precision: decimal.js ROUND_HALF_UP (Phase 11/12 convention).
 * Wire format: all monetary fields rendered as "N.NN" strings via toFixed(2).
 *
 * SQL safety: every $queryRaw fragment uses Prisma.sql template; no string
 * concatenation (Tampering mitigation T-14-03-01).
 *
 * @module pnl-report.service
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getMondayOfISOWeek } from '../lib/dateUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirname, '../assets/multiloterias-logo.png');

// Datos bancarios de Multiloterias — destino de pagos
const COMPANY_BANK = {
  razonSocial: 'Multiloterias C.A.',
  rif: 'J-503837420',
  banco: 'B.N.C',
  cuenta: '0191-0151-70-2100217182',
};

// F-4 — lock ROUND_HALF_UP at module load. All monetary math goes through decimal.js.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

class PnlReportService {
  /**
   * Compute the weekly P&L row for a single ISO week.
   *
   * @param {object} opts
   * @param {number} opts.isoYear  - 4-digit ISO week-numbering year (e.g., 2026)
   * @param {number} opts.isoWeek  - 1..53
   * @param {string} [opts.apiSystemId] - optional provider UUID; when set,
   *   restricts income/prizes/commissions to that provider and zeroes out
   *   the cross-provider expense bucket (D-04).
   *
   * @returns {Promise<object>} response shape (see plan <interfaces>)
   */
  async getWeeklyPnl({ isoYear, isoWeek, apiSystemId = null } = {}) {
    try {
      // Window — Monday 00:00 VE → next Monday 00:00 VE (exclusive)
      const windowStartUtc = getMondayOfISOWeek(isoYear, isoWeek);
      const windowEndUtc = new Date(windowStartUtc.getTime() + WEEK_MS);

      const isProviderFiltered = !!apiSystemId;

      // ── Parallel data fetch ────────────────────────────────────────
      // weekCommissions: sumar del ledger en vivo (refleja cada totalización
      // inmediatamente). ProviderWeeklySettlement queda como tabla de
      // "liquidación congelada" pero NO es la fuente del reporte.
      const [drawAggRows, commissionsAgg, settlementIdRows, expensesAgg, expenseIdRows, otherIncomeAgg, otherIncomeIdRows, rateRow] = await Promise.all([
        this._fetchDrawAggregate({ windowStartUtc, windowEndUtc, apiSystemId }),
        prisma.$queryRaw`
          SELECT COALESCE(SUM(pcl.amount), 0)::numeric(18,8) AS amount
          FROM   "ProviderCommissionLedger" pcl
          JOIN   "Draw" d ON d.id = pcl."drawId"
          WHERE  d."drawnAt" >= ${windowStartUtc}
            AND  d."drawnAt" <  ${windowEndUtc}
            AND  d."drawnAt" IS NOT NULL
            ${apiSystemId ? Prisma.sql`AND pcl."apiSystemId" = ${apiSystemId}` : Prisma.empty}
        `,
        prisma.providerWeeklySettlement.findMany({
          where: { isoYear, isoWeek, ...(apiSystemId && { apiSystemId }) },
          select: { id: true },
        }),
        // Expenses + other-income aggregates are only meaningful when NOT
        // provider-filtered (D-04). Issue cheap no-op-ish queries either way
        // and discard them in the provider-filtered case so the Promise.all
        // shape stays stable.
        isProviderFiltered
          ? Promise.resolve({ _sum: { amountBsF: null } })
          : prisma.accountingEntry.aggregate({
              where: { type: 'EXPENSE', entryDate: { gte: windowStartUtc, lt: windowEndUtc } },
              _sum: { amountBsF: true },
            }),
        isProviderFiltered
          ? Promise.resolve([])
          : prisma.accountingEntry.findMany({
              where: { type: 'EXPENSE', entryDate: { gte: windowStartUtc, lt: windowEndUtc } },
              select: { id: true },
            }),
        isProviderFiltered
          ? Promise.resolve({ _sum: { amountBsF: null } })
          : prisma.accountingEntry.aggregate({
              where: { type: 'INCOME', entryDate: { gte: windowStartUtc, lt: windowEndUtc } },
              _sum: { amountBsF: true },
            }),
        isProviderFiltered
          ? Promise.resolve([])
          : prisma.accountingEntry.findMany({
              where: { type: 'INCOME', entryDate: { gte: windowStartUtc, lt: windowEndUtc } },
              select: { id: true },
            }),
        this._getRateAsOfDate(windowStartUtc),
      ]);

      // ── Decimal arithmetic ─────────────────────────────────────────
      const drawAgg = drawAggRows[0] ?? { weekIncome: '0', weekPrizes: '0' };
      const weekIncome = new Decimal((drawAgg.weekIncome ?? 0).toString());
      const weekPrizes = new Decimal((drawAgg.weekPrizes ?? 0).toString());
      const weekGrossUtility = weekIncome.minus(weekPrizes);

      // commissionsAgg ahora viene del $queryRaw como [{amount}] (no _sum.amount).
      const weekCommissions = new Decimal(
        (commissionsAgg?.[0]?.amount ?? 0).toString(),
      );

      let weekExpenses = null;     // null when provider-filtered (D-04)
      let otherIncome = null;
      if (!isProviderFiltered) {
        weekExpenses = new Decimal((expensesAgg?._sum?.amountBsF ?? 0).toString());
        otherIncome = new Decimal((otherIncomeAgg?._sum?.amountBsF ?? 0).toString());
      }

      const weekNet = isProviderFiltered
        ? weekGrossUtility.minus(weekCommissions)
        : weekGrossUtility.minus(weekCommissions).minus(weekExpenses);

      // ── USD column ────────────────────────────────────────────────
      let rate = null;
      let usdEquivalent = null;
      if (rateRow) {
        rate = {
          id: rateRow.id,
          rateBsPerUsd: new Decimal(rateRow.rateBsPerUsd.toString()).toString(),
          rateType: rateRow.rateType,
          // Date — render as YYYY-MM-DD (the DB stores as DATE).
          date: rateRow.date instanceof Date
            ? rateRow.date.toISOString().slice(0, 10)
            : String(rateRow.date).slice(0, 10),
        };
        const rateDec = new Decimal(rate.rateBsPerUsd);
        if (!rateDec.isZero()) {
          usdEquivalent = weekNet.dividedBy(rateDec).toFixed(2);
        }
      }

      // ── byProvider breakdown (only when not provider-filtered) ─────
      const byProvider = isProviderFiltered
        ? []
        : await this._fetchByProvider({ windowStartUtc, windowEndUtc, isoYear, isoWeek });

      // ── Response shape ─────────────────────────────────────────────
      return {
        isoYear,
        isoWeek,
        apiSystemId: apiSystemId || null,
        windowStartUtc,
        windowEndUtc,
        weekIncome:       weekIncome.toFixed(2),
        weekPrizes:       weekPrizes.toFixed(2),
        weekGrossUtility: weekGrossUtility.toFixed(2),
        weekCommissions:  weekCommissions.toFixed(2),
        weekExpenses:     weekExpenses ? weekExpenses.toFixed(2) : null,
        weekNet:          weekNet.toFixed(2),
        otherIncome:      otherIncome ? otherIncome.toFixed(2) : null,
        rate,
        usdEquivalent,
        drillDown: {
          commissionsSettlementIds: settlementIdRows.map((r) => r.id),
          expenseEntryIds:          isProviderFiltered ? [] : expenseIdRows.map((r) => r.id),
          otherIncomeEntryIds:      isProviderFiltered ? [] : otherIncomeIdRows.map((r) => r.id),
        },
        byProvider,
      };
    } catch (error) {
      logger.error('[pnl-report.service] getWeeklyPnl failed', { isoYear, isoWeek, apiSystemId, error: error?.message, stack: error?.stack });
      const err = new Error('Error calculando P&L semanal');
      err.cause = error;
      throw err;
    }
  }

  /**
   * Draw income+prizes aggregation. When apiSystemId is null, sums DrawFinancial
   * across the week; when set, sums DrawFinancialProvider scoped to apiSystemId.
   *
   * @private
   * @returns {Promise<Array<{ weekIncome: string|number, weekPrizes: string|number }>>}
   */
  async _fetchDrawAggregate({ windowStartUtc, windowEndUtc, apiSystemId }) {
    if (apiSystemId) {
      return prisma.$queryRaw`
        SELECT COALESCE(SUM(dfp."totalSales"), 0)::numeric(12,2) AS "weekIncome",
               COALESCE(SUM(dfp."totalPrize"), 0)::numeric(12,2) AS "weekPrizes"
        FROM   "DrawFinancialProvider" dfp
        JOIN   "Draw" d ON d.id = dfp."drawId"
        WHERE  d."drawnAt" >= ${windowStartUtc}
          AND  d."drawnAt" <  ${windowEndUtc}
          AND  d."drawnAt" IS NOT NULL
          AND  dfp."apiSystemId" = ${apiSystemId}
      `;
    }
    return prisma.$queryRaw`
      SELECT COALESCE(SUM(df."totalSales"), 0)::numeric(12,2) AS "weekIncome",
             COALESCE(SUM(df."totalPrize"), 0)::numeric(12,2) AS "weekPrizes"
      FROM   "DrawFinancial" df
      JOIN   "Draw" d ON d.id = df."drawId"
      WHERE  d."drawnAt" >= ${windowStartUtc}
        AND  d."drawnAt" <  ${windowEndUtc}
        AND  d."drawnAt" IS NOT NULL
        AND  df."totalizedAt" IS NOT NULL
    `;
  }

  /**
   * Per-game breakdown for a single provider in a given window. Used by the
   * provider-facing PDF to render one row per game (Ventas, Premios,
   * Utilidad, Comisión prorrateada, Neto) plus a TOTAL row.
   *
   * La comisión semanal del proveedor se prorratea proporcional a las ventas
   * del juego sobre las ventas totales del proveedor en la semana.
   *
   * @private
   * @returns {Promise<Array<{gameId, gameName, totalSales, totalPrize, grossUtility, commission, net}>>}
   */
  async _fetchByGameForProvider({ windowStartUtc, windowEndUtc, apiSystemId, totalCommission, totalSales }) {
    // 1) Ventas y premios reales por juego (desde DrawFinancialProvider)
    const rows = await prisma.$queryRaw`
      SELECT g.id                                                AS "gameId",
             g.name                                              AS "gameName",
             COALESCE(SUM(dfp."totalSales"), 0)::numeric(12,2)   AS "totalSales",
             COALESCE(SUM(dfp."totalPrize"), 0)::numeric(12,2)   AS "totalPrize",
             COALESCE(SUM(dfp."ticketCount"), 0)::int            AS "ticketCount"
      FROM   "DrawFinancialProvider" dfp
      JOIN   "Draw" d ON d.id = dfp."drawId"
      JOIN   "Game" g ON g.id = d."gameId"
      WHERE  d."drawnAt" >= ${windowStartUtc}
        AND  d."drawnAt" <  ${windowEndUtc}
        AND  d."drawnAt" IS NOT NULL
        AND  dfp."apiSystemId" = ${apiSystemId}
      GROUP  BY g.id, g.name
      ORDER  BY "totalSales" DESC
    `;

    // 2) Comisión real por juego (desde ProviderCommissionLedger).
    //    Si el ledger tiene rows para este (provider, week), usamos esos números
    //    (refleja configs específicos por juego con la regla "más específico gana").
    //    Si no hay ledger, fallback: prorratear el totalCommission proporcional a ventas.
    const ledgerByGame = await prisma.$queryRaw`
      SELECT d."gameId"                                            AS "gameId",
             COALESCE(SUM(pcl."amount"), 0)::numeric(18, 8)        AS "commission"
      FROM   "ProviderCommissionLedger" pcl
      JOIN   "Draw" d ON d.id = pcl."drawId"
      WHERE  d."drawnAt" >= ${windowStartUtc}
        AND  d."drawnAt" <  ${windowEndUtc}
        AND  d."drawnAt" IS NOT NULL
        AND  pcl."apiSystemId" = ${apiSystemId}
      GROUP  BY d."gameId"
    `;
    const ledgerCommissionByGame = new Map(
      ledgerByGame.map((r) => [r.gameId, new Decimal((r.commission ?? 0).toString())]),
    );
    const hasLedger = ledgerByGame.length > 0;

    const totalSalesDec = new Decimal((totalSales ?? 0).toString());
    const totalCommissionDec = new Decimal((totalCommission ?? 0).toString());

    return rows.map((r) => {
      const sales = new Decimal((r.totalSales ?? 0).toString());
      const prize = new Decimal((r.totalPrize ?? 0).toString());
      const grossUtility = sales.minus(prize);
      let commission;
      if (hasLedger) {
        // Comisión real desde el ledger (refleja config por juego cuando aplique)
        commission = ledgerCommissionByGame.get(r.gameId) ?? new Decimal(0);
      } else {
        // Fallback: prorrateo proporcional a ventas (compat con weeks pre-ledger)
        commission = totalSalesDec.isZero()
          ? new Decimal(0)
          : totalCommissionDec.times(sales).dividedBy(totalSalesDec);
      }
      const net = grossUtility.minus(commission);
      return {
        gameId: r.gameId,
        gameName: r.gameName,
        totalSales: sales.toFixed(2),
        totalPrize: prize.toFixed(2),
        grossUtility: grossUtility.toFixed(2),
        commission: commission.toFixed(2),
        net: net.toFixed(2),
        ticketCount: parseInt(r.ticketCount, 10),
      };
    });
  }

  /**
   * Per-provider breakdown (D-03). Sums DrawFinancialProvider rows grouped by
   * apiSystemId, then joins ProviderWeeklySettlement for that (apiSystemId,
   * isoYear, isoWeek) tuple to attach the commission amount. NULL apiSystemId
   * is rendered as the "Taquilla / Online" bucket (Phase 11 D-06/D-07).
   *
   * @private
   */
  async _fetchByProvider({ windowStartUtc, windowEndUtc, isoYear, isoWeek }) {
    const rows = await prisma.$queryRaw`
      SELECT dfp."apiSystemId"                                       AS "apiSystemId",
             a.name                                                  AS "apiSystemName",
             a.slug                                                  AS "apiSystemSlug",
             COALESCE(SUM(dfp."totalSales"), 0)::numeric(12,2)       AS "weekIncome",
             COALESCE(SUM(dfp."totalPrize"), 0)::numeric(12,2)       AS "weekPrizes",
             COALESCE(SUM(dfp."ticketCount"), 0)::int                AS "ticketCount"
      FROM   "DrawFinancialProvider" dfp
      JOIN   "Draw" d ON d.id = dfp."drawId"
      LEFT JOIN "ApiSystem" a ON a.id = dfp."apiSystemId"
      WHERE  d."drawnAt" >= ${windowStartUtc}
        AND  d."drawnAt" <  ${windowEndUtc}
        AND  d."drawnAt" IS NOT NULL
      GROUP  BY dfp."apiSystemId", a.name, a.slug
      ORDER  BY "weekIncome" DESC
    `;

    if (rows.length === 0) return [];

    // Comisión en vivo: sumar ProviderCommissionLedger del rango por provider.
    // Refleja inmediatamente cada totalización; no depende del weekly snapshot.
    const commissionRows = await prisma.$queryRaw`
      SELECT pcl."apiSystemId"                                  AS "apiSystemId",
             COALESCE(SUM(pcl.amount), 0)::numeric(18,8)         AS amount
      FROM   "ProviderCommissionLedger" pcl
      JOIN   "Draw" d ON d.id = pcl."drawId"
      WHERE  d."drawnAt" >= ${windowStartUtc}
        AND  d."drawnAt" <  ${windowEndUtc}
        AND  d."drawnAt" IS NOT NULL
      GROUP  BY pcl."apiSystemId"
    `;
    const commissionByProvider = new Map(
      commissionRows.map((r) => [r.apiSystemId, new Decimal((r.amount ?? 0).toString())]),
    );

    return rows.map((r) => {
      const income = new Decimal((r.weekIncome ?? 0).toString());
      const prizes = new Decimal((r.weekPrizes ?? 0).toString());
      const commission = commissionByProvider.get(r.apiSystemId) ?? new Decimal(0);
      const net = income.minus(prizes).minus(commission);
      return {
        apiSystemId:   r.apiSystemId, // null = Taquilla / Online bucket
        apiSystemName: r.apiSystemId ? r.apiSystemName : 'Taquilla / Online',
        apiSystemSlug: r.apiSystemId ? r.apiSystemSlug : null,
        weekIncome:      income.toFixed(2),
        weekPrizes:      prizes.toFixed(2),
        weekCommissions: commission.toFixed(2),
        weekNet:         net.toFixed(2),
        ticketCount:     parseInt(r.ticketCount, 10),
      };
    });
  }

  /**
   * D-01 — "most recent ExchangeRate AS OF a target date" lookup.
   * Returns null when the table is empty for any date <= target (D-01 fallback —
   * USD column shows "—"; service does NOT throw).
   *
   * INTENTIONALLY different semantics from Phase 13 D-01 ("createdAt DESC for the
   * SAME date") — see 14-CONTEXT D-01 note.
   *
   * @private
   * @param {Date} targetDate
   */
  async _getRateAsOfDate(targetDate) {
    const rows = await prisma.$queryRaw`
      SELECT id, "rateBsPerUsd", "rateType", date, "createdAt"
      FROM   "ExchangeRate"
      WHERE  date <= ${targetDate}::date
      ORDER  BY date DESC, "createdAt" DESC
      LIMIT  1
    `;
    return rows[0] ?? null;
  }

  /**
   * Build an Excel workbook Buffer for the weekly P&L row.
   *
   * Auditable: totals use {formula: ...} cells (not pre-computed literals).
   * Mirrors the pattern from accounting-report.service.js:248-261 /
   * commission.service.js:374-377.
   *
   * @param {object} opts - same shape as getWeeklyPnl
   * @returns {Promise<Buffer>}
   */
  async buildPnlExcel(opts) {
    const report = await this.getWeeklyPnl(opts);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tote — P&L Semanal';
    wb.created = new Date();

    const tag = `${report.isoYear}-W${String(report.isoWeek).padStart(2, '0')}`;
    const ws = wb.addWorksheet('P&L Semanal');

    // ── Title row ─────────────────────────────────────────────────
    ws.mergeCells('A1:C1');
    const titleCell = ws.getCell('A1');
    const filterSuffix = report.apiSystemId
      ? ` (proveedor: ${report.apiSystemId})`
      : '';
    titleCell.value = `P&L Semanal — ISO ${tag}${filterSuffix}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    ws.addRow([]); // separator

    // ── Header row ────────────────────────────────────────────────
    const headerRow = ws.addRow(['Métrica', 'BsF', 'USD eq']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // ── Data rows ─────────────────────────────────────────────────
    // We track row numbers because the TOTAL row uses formula cells that
    // reference these positions.
    const num = (s) => (s === null || s === undefined ? null : Number(s));
    const incomeRow   = ws.addRow(['Ingresos',         num(report.weekIncome)]);
    const prizesRow   = ws.addRow(['Premios',          num(report.weekPrizes)]);
    // Utilidad bruta — formula = Ingresos - Premios (auditable)
    const utilityRow  = ws.addRow([
      'Utilidad bruta',
      { formula: `B${incomeRow.number} - B${prizesRow.number}` },
    ]);
    const commissionsRow = ws.addRow(['Comisiones',    num(report.weekCommissions)]);
    const expensesRow    = ws.addRow([
      'Gastos',
      report.weekExpenses === null ? '—' : num(report.weekExpenses),
    ]);
    // Neto — formula = utilidad - comisiones - gastos (when expenses are numeric)
    const netFormula = report.weekExpenses === null
      ? { formula: `B${utilityRow.number} - B${commissionsRow.number}` }
      : { formula: `B${utilityRow.number} - B${commissionsRow.number} - B${expensesRow.number}` };
    const netRow = ws.addRow(['Neto', netFormula]);

    ws.addRow([]); // separator

    const otherIncomeRow = ws.addRow([
      'Otros ingresos',
      report.otherIncome === null ? '—' : num(report.otherIncome),
    ]);

    // ── Rate / USD column ─────────────────────────────────────────
    // Write the rate in a dedicated cell so USD cells can reference it
    // (operator can edit the rate and the spreadsheet re-totals).
    ws.addRow([]); // separator
    const rateLabelRow = ws.addRow([
      'Tasa',
      report.rate
        ? Number(report.rate.rateBsPerUsd)
        : '—',
      report.rate
        ? `${report.rate.rateType} de ${report.rate.date}`
        : 'no disponible',
    ]);

    // USD column on each monetary row references the rate cell.
    if (report.rate) {
      const rateCell = `B${rateLabelRow.number}`;
      [incomeRow, prizesRow, utilityRow, commissionsRow, expensesRow, netRow, otherIncomeRow].forEach((row) => {
        const bVal = row.getCell(2).value;
        // Skip cells that hold "—" placeholders for N/A rows (Gastos / Otros under provider filter).
        if (bVal === '—' || bVal === null) {
          row.getCell(3).value = '—';
        } else {
          row.getCell(3).value = { formula: `B${row.number} / ${rateCell}` };
        }
      });
    } else {
      [incomeRow, prizesRow, utilityRow, commissionsRow, expensesRow, netRow, otherIncomeRow].forEach((row) => {
        row.getCell(3).value = '—';
      });
    }

    // ── Column widths + currency formatting ───────────────────────
    ws.getColumn(1).width = 24; // Métrica
    ws.getColumn(2).width = 18; // BsF
    ws.getColumn(3).width = 18; // USD eq

    // Currency format for B and C from row 4 (incomeRow) down to otherIncomeRow.
    const startCur = incomeRow.number;
    const endCur = otherIncomeRow.number;
    for (let r = startCur; r <= endCur; r++) {
      ['B', 'C'].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        if (typeof cell.value === 'number' || (cell.value && cell.value.formula)) {
          cell.numFmt = '#,##0.00';
        }
      });
    }
    // The rate cell itself
    ws.getCell(`B${rateLabelRow.number}`).numFmt = '#,##0.0000';
    // Bold the totals (utility + net + otherIncome) for readability
    utilityRow.font = { bold: true };
    netRow.font = { bold: true };
    netRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Build a PDF Buffer for the weekly P&L row.
   *
   * Reuses the drawTable inline-helper pattern from monitor.controller.js:141-157.
   * Stream-to-buffer: collect chunks → Buffer.concat.
   *
   * @param {object} opts - same shape as getWeeklyPnl
   * @returns {Promise<Buffer>}
   */
  async buildPnlPdf(opts) {
    const report = await this.getWeeklyPnl(opts);

    // Lazy-import PDFKit to keep startup fast (same pattern as monitor.controller).
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
      bufferPages: true,
    });

    // Collect chunks
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const endPromise = new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    // Currency formatter (BsF)
    const fmt = (n) => {
      if (n === null || n === undefined) return '—';
      return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency: 'VES',
        minimumFractionDigits: 2,
      }).format(Number(n));
    };
    const fmtUsd = (bsString) => {
      if (!report.rate || bsString === null) return '—';
      const dec = new Decimal(bsString).dividedBy(new Decimal(report.rate.rateBsPerUsd));
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(Number(dec.toFixed(2)));
    };

    // drawTable helper — inlined from monitor.controller.js:141-157
    function drawTable(headers, colWidths, rows, startX = 50) {
      if (doc.y > 680) doc.addPage();
      let x = startX;
      let y = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
        x += colWidths[i];
      });
      y += 16;
      doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
      y += 6;
      doc.fontSize(10).font('Helvetica');
      for (const row of rows) {
        if (y > 720) { doc.addPage(); y = 50; }
        x = startX;
        row.forEach((cell, i) => {
          doc.text(String(cell), x, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
          x += colWidths[i];
        });
        y += 14;
      }
      doc.y = y + 10;
    }

    // ── Title block ──────────────────────────────────────────────
    const tag = `${report.isoYear}-W${String(report.isoWeek).padStart(2, '0')}`;
    const filterSuffix = report.apiSystemId ? ` (proveedor: ${report.apiSystemId})` : '';
    doc.fontSize(18).font('Helvetica-Bold').text(`P&L Semanal — ISO ${tag}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(filterSuffix || 'Total compañía', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor('#888').text(`Generado: ${new Date().toLocaleString('es-VE')}`, { align: 'center' });
    doc.fillColor('black').moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Main table ───────────────────────────────────────────────
    const rows = [
      ['Ingresos',         fmt(report.weekIncome),      fmtUsd(report.weekIncome)],
      ['Premios',          fmt(report.weekPrizes),      fmtUsd(report.weekPrizes)],
      ['Utilidad bruta',   fmt(report.weekGrossUtility), fmtUsd(report.weekGrossUtility)],
      ['Comisiones',       fmt(report.weekCommissions), fmtUsd(report.weekCommissions)],
      ['Gastos',           fmt(report.weekExpenses),    fmtUsd(report.weekExpenses)],
      ['Neto',             fmt(report.weekNet),         fmtUsd(report.weekNet)],
    ];

    drawTable(
      ['Métrica', 'BsF', 'USD eq'],
      [220, 150, 130],
      rows,
    );

    doc.moveDown(0.5);

    // ── Other income (separate row) ──────────────────────────────
    if (!report.apiSystemId) {
      doc.fontSize(11).font('Helvetica-Bold').text('Otros ingresos (no incluido en Neto)');
      doc.moveDown(0.3);
      drawTable(
        ['Métrica', 'BsF', 'USD eq'],
        [220, 150, 130],
        [['Otros ingresos', fmt(report.otherIncome), fmtUsd(report.otherIncome)]],
      );
      doc.moveDown(0.5);
    }

    // ── Rate footer ──────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica').fillColor('#444');
    if (report.rate) {
      doc.text(`Tasa: ${report.rate.rateBsPerUsd} ${report.rate.rateType} de ${report.rate.date}`, 50);
    } else {
      doc.text('Tasa: no disponible (USD eq = —)', 50);
    }
    doc.fillColor('black');

    doc.end();
    await endPromise;
    return Buffer.concat(chunks);
  }

  /**
   * Build a provider-facing branded PDF (Multiloterias header, week range,
   * sales/prizes/utility breakdown, provider commission, settlement amount
   * with direction, and company bank details).
   *
   * Requires apiSystemId. Reuses getWeeklyPnl with provider scope so the
   * numbers are identical to the on-screen PnL view.
   *
   * @param {object} opts
   * @param {number} opts.isoYear
   * @param {number} opts.isoWeek
   * @param {string} opts.apiSystemId  — REQUIRED
   * @returns {Promise<Buffer>}
   */
  async buildProviderPdf({ isoYear, isoWeek, apiSystemId }) {
    if (!apiSystemId) {
      const err = new Error('apiSystemId requerido para PDF de proveedor');
      err.statusCode = 400;
      throw err;
    }

    const [report, apiSystem] = await Promise.all([
      this.getWeeklyPnl({ isoYear, isoWeek, apiSystemId }),
      prisma.apiSystem.findUnique({
        where: { id: apiSystemId },
        select: { id: true, name: true, slug: true, mode: true },
      }),
    ]);

    if (!apiSystem) {
      const err = new Error('Proveedor no encontrado');
      err.statusCode = 404;
      throw err;
    }

    // Window: Monday → Sunday (inclusive) en hora Venezuela.
    const monday = getMondayOfISOWeek(isoYear, isoWeek);
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
    const windowEndUtc = new Date(monday.getTime() + WEEK_MS);

    // Desglose por juego (Ventas, Premios, Utilidad, Comisión prorrateada, Neto)
    const byGame = await this._fetchByGameForProvider({
      windowStartUtc: monday,
      windowEndUtc,
      apiSystemId,
      totalCommission: report.weekCommissions,
      totalSales: report.weekIncome,
    });
    const fmtDayEs = (d) =>
      new Intl.DateTimeFormat('es-VE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Caracas',
      }).format(d);
    const fmtTag = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const rangeLabel = `${fmtDayEs(monday)} al ${fmtDayEs(sunday)}`;

    const fmtBsF = (n) => {
      if (n === null || n === undefined) return '—';
      return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency: 'VES',
        minimumFractionDigits: 2,
      }).format(Number(n));
    };
    // Versión compacta sin "Bs.S " (para celdas estrechas en la tabla por juego)
    const fmtNum = (n) => {
      if (n === null || n === undefined) return '—';
      return new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(n));
    };

    // Cálculo del neto: utilidad bruta - comisión del proveedor.
    // Para el TOTAL preferimos la suma del ledger por juego (que ya refleja
    // configs específicos por juego cuando aplica). El report.weekCommissions
    // viene de ProviderWeeklySettlement (snapshot semanal que se corre los lunes)
    // — puede estar atrás del ledger en tiempo real.
    const grossUtility = new Decimal(report.weekGrossUtility);
    const ledgerSum = byGame.reduce(
      (acc, g) => acc.plus(new Decimal(g.commission)),
      new Decimal(0),
    );
    const settlementSum = new Decimal(report.weekCommissions);
    // Si hay ledger rows usamos esa suma; si no, caemos al settlement.
    const commission = ledgerSum.greaterThan(0) ? ledgerSum : settlementSum;
    const netDec = grossUtility.minus(commission);
    const directionToUs = netDec.greaterThanOrEqualTo(0);
    const absNet = netDec.abs();

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `Liquidación ${apiSystem.name} — ${fmtTag}`,
        Author: 'Multiloterias C.A.',
        Subject: 'Liquidación semanal de proveedor',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const endPromise = new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const rightX = doc.page.width - doc.page.margins.right;

    // ── Header — barra navy con logo + título ──────────────────────
    // El logo tiene texto blanco sobre fondo transparente, así que pintamos
    // una barra oscura para que se lea correctamente.
    const HEADER_TOP = 0;
    const HEADER_H = 110;
    doc.rect(0, HEADER_TOP, doc.page.width, HEADER_H).fill('#0F172A');
    // Acento amarillo (alusión al color del logo)
    doc.rect(0, HEADER_TOP + HEADER_H, doc.page.width, 4).fill('#F59E0B');

    const LOGO_W = 90;
    const LOGO_H = 90;
    if (existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, leftX, HEADER_TOP + 10, { fit: [LOGO_W, LOGO_H], align: 'center', valign: 'top' });
      } catch (e) {
        logger.warn('[pnl-report] no se pudo embeber el logo', { error: e?.message });
      }
    }
    const titleX = leftX + LOGO_W + 14;
    const titleW = pageWidth - LOGO_W - 14;
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF')
      .text('Liquidación Semanal', titleX, HEADER_TOP + 30, { width: titleW });
    doc.fontSize(13).font('Helvetica').fillColor('#CBD5E1')
      .text('Reporte de Proveedor — Multiloterias C.A.', titleX, HEADER_TOP + 56, { width: titleW });
    doc.fontSize(9).fillColor('#94A3B8')
      .text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`,
        titleX, HEADER_TOP + 78, { width: titleW });

    doc.y = HEADER_H + 24;
    doc.fillColor('black');

    // ── Provider + week box ────────────────────────────────────────
    const infoTop = doc.y;
    doc.rect(leftX, infoTop, pageWidth, 64).fillAndStroke('#F3F4F6', '#E5E7EB');
    doc.fillColor('#374151');

    doc.fontSize(9).font('Helvetica-Bold').text('PROVEEDOR', leftX + 14, infoTop + 10);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text(apiSystem.name, leftX + 14, infoTop + 22, { width: pageWidth / 2 - 20 });
    doc.fontSize(8).font('Helvetica').fillColor('#6B7280')
      .text(`Modo: ${apiSystem.mode}  ·  Slug: ${apiSystem.slug ?? '—'}`, leftX + 14, infoTop + 44);

    const wkX = leftX + pageWidth / 2 + 10;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
      .text('SEMANA ISO', wkX, infoTop + 10);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text(fmtTag, wkX, infoTop + 22);
    doc.fontSize(9).font('Helvetica').fillColor('#374151')
      .text(`Del ${rangeLabel}`, wkX, infoTop + 44, { width: pageWidth / 2 - 20 });

    doc.y = infoTop + 80;
    doc.moveDown(0.5);

    // ── Breakdown table — por juego + total ─────────────────────────
    doc.fillColor('#111827').fontSize(13).font('Helvetica-Bold')
      .text('Desglose por juego', leftX);
    doc.fillColor('#6B7280').fontSize(8).font('Helvetica-Oblique')
      .text('Montos en Bs.S (Bolívar Soberano)', leftX, doc.y + 2);
    doc.fillColor('#111827');
    doc.moveDown(0.5);

    // Columnas: Juego | Ventas | Premios | Utilidad | Comisión | Neto
    // Juego ocupa 22%, los 5 valores monetarios reparten el resto
    const juegoW = Math.floor(pageWidth * 0.22);
    const valueW = Math.floor((pageWidth - juegoW) / 5);
    const colW = [juegoW, valueW, valueW, valueW, valueW, pageWidth - juegoW - valueW * 4];

    const colX = [leftX];
    for (let i = 1; i < colW.length; i++) colX.push(colX[i - 1] + colW[i - 1]);

    // Header row
    const headerY = doc.y;
    doc.rect(leftX, headerY, pageWidth, 22).fill('#1F2937');
    doc.fillColor('#F9FAFB').font('Helvetica-Bold').fontSize(9);
    const headers = ['Juego', 'Ventas', 'Premios', 'Utilidad', 'Comisión', 'Neto'];
    headers.forEach((h, i) => {
      doc.text(h, colX[i] + 4, headerY + 7, {
        width: colW[i] - 8,
        align: i === 0 ? 'left' : 'right',
      });
    });
    doc.y = headerY + 22;

    // Data rows
    const drawGameRow = (cells, opts = {}) => {
      const y = doc.y;
      if (opts.fill) {
        doc.rect(leftX, y, pageWidth, 20).fill(opts.fill);
      }
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      cells.forEach((c, i) => {
        const color = opts.colors?.[i] || opts.color || '#1F2937';
        doc.fillColor(color);
        doc.text(c, colX[i] + 4, y + 6, {
          width: colW[i] - 8,
          align: i === 0 ? 'left' : 'right',
          lineBreak: false,
          ellipsis: true,
        });
      });
      doc.y = y + 20;
      doc.moveTo(leftX, doc.y).lineTo(rightX, doc.y).strokeColor('#E5E7EB').stroke();
    };

    if (byGame.length === 0) {
      const y = doc.y;
      doc.rect(leftX, y, pageWidth, 28).fill('#FAFAFA');
      doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(10)
        .text('Sin actividad para este proveedor en la semana.',
          leftX + 6, y + 9, { width: pageWidth - 12, align: 'center' });
      doc.y = y + 28;
    } else {
      byGame.forEach((g, idx) => {
        const netPositive = new Decimal(g.net).greaterThanOrEqualTo(0);
        drawGameRow(
          [
            g.gameName,
            fmtNum(g.totalSales),
            fmtNum(g.totalPrize),
            fmtNum(g.grossUtility),
            fmtNum(g.commission),
            fmtNum(g.net),
          ],
          {
            fill: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
            colors: [
              '#1F2937',
              '#1F2937',
              '#B91C1C',
              '#1F2937',
              '#B91C1C',
              netPositive ? '#047857' : '#B91C1C',
            ],
          },
        );
      });
    }

    // Total row
    drawGameRow(
      [
        'TOTAL',
        fmtNum(report.weekIncome),
        fmtNum(report.weekPrizes),
        fmtNum(grossUtility.toFixed(2)),
        fmtNum(commission.toFixed(2)),
        fmtNum(netDec.toFixed(2)),
      ],
      {
        bold: true,
        fill: '#EFF6FF',
        colors: [
          '#0F172A',
          '#0F172A',
          '#991B1B',
          '#0F172A',
          '#991B1B',
          netDec.greaterThanOrEqualTo(0) ? '#047857' : '#B91C1C',
        ],
      },
    );

    doc.moveDown(0.8);
    doc.fillColor('#6B7280').font('Helvetica-Oblique').fontSize(8)
      .text('La comisión por juego refleja la configuración vigente (config específica del juego o config global del proveedor).', leftX);
    doc.fillColor('#1F2937');
    doc.moveDown(0.8);

    // ── Settlement banner ─────────────────────────────────────────
    const bannerTop = doc.y;
    const bannerColor = directionToUs ? '#047857' : '#B45309';
    const bannerFill = directionToUs ? '#ECFDF5' : '#FFFBEB';
    const bannerLabel = directionToUs
      ? `Monto a cobrar al proveedor`
      : `Monto a pagar al proveedor`;
    doc.rect(leftX, bannerTop, pageWidth, 70).fillAndStroke(bannerFill, bannerColor);
    doc.fillColor(bannerColor).fontSize(10).font('Helvetica-Bold')
      .text(bannerLabel.toUpperCase(), leftX + 16, bannerTop + 12);
    doc.fillColor('#111827').fontSize(26).font('Helvetica-Bold')
      .text(fmtBsF(absNet.toFixed(2)), leftX + 16, bannerTop + 28);
    doc.fillColor('#6B7280').fontSize(9).font('Helvetica')
      .text(directionToUs
        ? `El proveedor debe transferir este monto a Multiloterias C.A.`
        : `Multiloterias C.A. debe transferir este monto al proveedor.`,
        leftX + 16, bannerTop + 56);

    doc.y = bannerTop + 80;
    doc.moveDown(0.5);

    // ── Bank details ──────────────────────────────────────────────
    doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
      .text('Datos bancarios para el pago', leftX);
    doc.moveDown(0.3);

    const bankTop = doc.y;
    doc.rect(leftX, bankTop, pageWidth, 88).fillAndStroke('#FFFFFF', '#D1D5DB');

    const bankLine = (label, value, idx) => {
      const y = bankTop + 10 + idx * 18;
      doc.fillColor('#6B7280').fontSize(9).font('Helvetica-Bold')
        .text(label, leftX + 14, y, { width: 130 });
      doc.fillColor('#111827').fontSize(11).font('Helvetica')
        .text(value, leftX + 150, y - 1, { width: pageWidth - 160 });
    };
    bankLine('Razón social:', COMPANY_BANK.razonSocial, 0);
    bankLine('RIF:',          COMPANY_BANK.rif,          1);
    bankLine('Banco:',        COMPANY_BANK.banco,        2);
    bankLine('Cuenta:',       COMPANY_BANK.cuenta,       3);

    doc.y = bankTop + 100;

    // ── Footer ────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica')
      .text(
        `Multiloterias C.A. · ${COMPANY_BANK.rif}  ·  Documento generado automáticamente — válido sin firma`,
        leftX, footerY, { width: pageWidth, align: 'center' }
      );

    doc.end();
    await endPromise;
    return Buffer.concat(chunks);
  }
}

export default new PnlReportService();
export { PnlReportService };
