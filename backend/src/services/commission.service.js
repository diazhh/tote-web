/**
 * Phase 12 — Provider Commission Engine compute + upsert service.
 *
 * Named exports:
 *   - findEffectiveConfig(apiSystemId, drawnAt)       → ProviderCommissionConfig | null
 *   - computeCommission(config, providerRow, cum)     → string (.toFixed(8))
 *   - getCumulativeWeeklySales(apiSystemId, drawnAt)  → string
 *   - computeAndUpsertLedgerForDraw(drawId)           → { providersProcessed, skipped }
 *   - computeSettlementForWeek(apiSystemId, isoYear, isoWeek) → { total, ledgerRowCount }
 *   - getSettlementWithLedger(settlementId)           → { settlement, ledgerRows }
 *   - buildSettlementExcel(settlementId)              → Buffer
 *   - getSettlementPdfData(settlementId)              → { settlement, ledgerRows, totals }
 *   - class DrawFinancialNotReadyError
 *
 * Design notes:
 *   - decimal.js with ROUND_HALF_UP locked at module load (F-4 — never use JS
 *     Number for monetary math; .toFixed(8) for transport into Prisma Decimal).
 *   - F-5 append-only: this module NEVER updates the ProviderCommissionConfig table.
 *   - D-01: silent skip when no effective config exists at drawnAt — warning log,
 *     no ledger row, no phantom SKIPPED bucket.
 *   - D-04: TIERED brackets resolve against cumulative weekly sales (ISO week VE).
 *   - D-08 explicit findFirst + update/create (no upsert call) for consistency
 *     with draw-financial.service.js even though the @@unique([drawId, apiSystemId])
 *     in Plan 12-01 has both columns NOT NULL.
 *   - configSnapshot Json denormalized onto every ledger row for reproducibility.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { setISOWeekYear, setISOWeek, startOfISOWeek, endOfISOWeek } from 'date-fns';
import {
  getISOWeekVE,
  startOfISOWeekVE,
  endOfISOWeekVE,
} from '../lib/dateUtils.js';

// F-4 — lock ROUND_HALF_UP at module load. All monetary math goes through decimal.js.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Thrown by the commission worker when DrawFinancial.totalizedAt is still NULL at the
 * moment commission compute fires (Pitfall 7 race condition). Worker rethrows so
 * pg-boss retries 3× with backoff — by which time the PRIZES phase will have committed.
 */
export class DrawFinancialNotReadyError extends Error {
  constructor(drawId) {
    super(`DrawFinancial not ready for ${drawId} — retrying`);
    this.name = 'DrawFinancialNotReadyError';
  }
}

/**
 * Find the ProviderCommissionConfig that was effective for `apiSystemId` at the
 * given `drawnAt`, prefiriendo configs específicos del juego sobre globales.
 *
 * Regla "más específico gana":
 *   1. Si existe un config con `gameId === draw.gameId` y `effectiveFrom <= drawnAt`,
 *      retorna el más reciente.
 *   2. Si no, cae al config con `gameId IS NULL` (global del proveedor).
 *   3. Si tampoco hay, retorna null (provider sin config → skip silencioso aguas arriba).
 *
 * @param {string} apiSystemId
 * @param {Date} drawnAt
 * @param {string} [gameId] - opcional; cuando se pasa, prioriza configs ligados a ese juego
 * @returns {Promise<object|null>} config row con `tiers` incluido, o null
 */
export async function findEffectiveConfig(apiSystemId, drawnAt, gameId = null) {
  if (gameId) {
    const gameSpecific = await prisma.providerCommissionConfig.findFirst({
      where: { apiSystemId, gameId, effectiveFrom: { lte: drawnAt } },
      orderBy: { effectiveFrom: 'desc' },
      include: { tiers: { orderBy: { minSales: 'asc' } } },
    });
    if (gameSpecific) return gameSpecific;
  }
  return prisma.providerCommissionConfig.findFirst({
    where: { apiSystemId, gameId: null, effectiveFrom: { lte: drawnAt } },
    orderBy: { effectiveFrom: 'desc' },
    include: { tiers: { orderBy: { minSales: 'asc' } } },
  });
}

/**
 * Pure compute — evaluate a commission for one provider on one draw given the
 * effective config row, the provider's per-draw row, and (TIERED only) the
 * cumulative weekly sales for bracket lookup.
 *
 * @param {object} config           - ProviderCommissionConfig (with `tiers` for TIERED)
 * @param {object} providerRow      - { totalSales, totalPrize } (Decimal | string | number)
 * @param {string|number} cumulativeWeeklySales - only consulted for TIERED
 * @returns {string} commission amount as `.toFixed(8)` string
 */
export function computeCommission(config, providerRow, cumulativeWeeklySales) {
  const sales = new Decimal((providerRow.totalSales ?? 0).toString());
  const prize = new Decimal((providerRow.totalPrize ?? 0).toString());
  const utility = sales.minus(prize);

  switch (config.formulaType) {
    case 'SALES_PCT':
      return sales.times(config.salesRate.toString()).dividedBy(100).toFixed(8);
    case 'UTILITY_PCT':
      return utility.times(config.utilityRate.toString()).dividedBy(100).toFixed(8);
    case 'SALES_AND_UTILITY_PCT': {
      // Modelo cascada (2026-05-22):
      //   1. comisiónVenta    = ventas × salesRate%
      //   2. baseUtilidad     = ventas − comisiónVenta − premios
      //   3. comisiónUtilidad = baseUtilidad × utilityRate%
      //   total = comisiónVenta + comisiónUtilidad
      //
      // Antes se calculaba comisiónUtilidad sobre (ventas − premios), lo cual
      // no respetaba que la comisión de venta YA salió de las ventas antes de
      // medir la "ganancia". Diferencia conceptual: ahora el porcentaje sobre
      // ganancia opera sobre la ganancia *neta de comisión de venta*.
      const salesCommission = sales.times(config.salesRate.toString()).dividedBy(100);
      const utilityBaseCascade = sales.minus(salesCommission).minus(prize);
      const utilityCommission = utilityBaseCascade
        .times(config.utilityRate.toString())
        .dividedBy(100);
      return salesCommission.plus(utilityCommission).toFixed(8);
    }
    case 'TIERED': {
      const cum = new Decimal((cumulativeWeeklySales ?? 0).toString());
      const bracket = config.tiers.find((t) => {
        const min = new Decimal(t.minSales.toString());
        if (cum.lt(min)) return false;
        if (t.maxSales === null || t.maxSales === undefined) return true;
        const max = new Decimal(t.maxSales.toString());
        return cum.lt(max);
      });
      if (!bracket) {
        throw new Error(
          `No tier matches cumulative sales ${cumulativeWeeklySales} for config ${config.id}`,
        );
      }
      return sales.times(bracket.rate.toString()).dividedBy(100).toFixed(8);
    }
    default:
      throw new Error(`Unknown formulaType: ${config.formulaType}`);
  }
}

/**
 * Cumulative weekly sales for one provider through `drawnAt` (inclusive).
 * SUM(DrawFinancialProvider.totalSales) over draws whose drawnAt falls inside
 * the same ISO week (Venezuela time) and is ≤ the reference drawnAt.
 *
 * JOINs Draw because DrawFinancialProvider does not store drawnAt.
 *
 * @returns {Promise<string>} cumulative as string (decimal-safe)
 */
export async function getCumulativeWeeklySales(apiSystemId, drawnAt) {
  const weekStart = startOfISOWeekVE(drawnAt);
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(dfp."totalSales"), 0)::numeric(18,8) AS cumulative
    FROM   "DrawFinancialProvider" dfp
    JOIN   "Draw" d ON d.id = dfp."drawId"
    WHERE  dfp."apiSystemId" = ${apiSystemId}
      AND  d."drawnAt" >= ${weekStart}
      AND  d."drawnAt" <= ${drawnAt}
  `;
  return rows[0]?.cumulative?.toString() ?? '0';
}

/**
 * Compute + upsert commission ledger rows for every provider that participated
 * in the given draw. Reads from DrawFinancialProvider (Phase 11 materialized
 * aggregate — NOT raw TicketDetail).
 *
 * D-01: providers without an effective config at drawnAt are silently skipped
 * with a structured warning log. No phantom rows.
 *
 * D-08: explicit findFirst + update/create (no upsert call).
 *
 * Idempotent: re-running on the same drawId updates the existing rows.
 *
 * @param {string} drawId
 * @returns {Promise<{ providersProcessed: number, skipped: number }>}
 */
export async function computeAndUpsertLedgerForDraw(drawId) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { drawnAt: true, gameId: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  // Phase 11 materialized aggregate. Skip the TAQUILLA_ONLINE bucket (apiSystemId IS NULL).
  const providers = await prisma.drawFinancialProvider.findMany({
    where: { drawId, apiSystemId: { not: null } },
    include: { apiSystem: { select: { id: true, name: true, slug: true } } },
  });

  let providersProcessed = 0;
  let skipped = 0;

  for (const row of providers) {
    // Prefiere config específico por juego; cae al global si no existe.
    const config = await findEffectiveConfig(row.apiSystemId, draw.drawnAt, draw.gameId);
    if (!config) {
      // D-01 — silent skip, structured warning, no row written.
      logger.warn('[commission] no_config_at_drawnAt', {
        drawId,
        apiSystemId: row.apiSystemId,
        gameId: draw.gameId,
        reason: 'no_config_at_drawnAt',
      });
      skipped++;
      continue;
    }

    const cumulativeSales =
      config.formulaType === 'TIERED'
        ? await getCumulativeWeeklySales(row.apiSystemId, draw.drawnAt)
        : '0';

    const amount = computeCommission(config, row, cumulativeSales);

    const sales = new Decimal((row.totalSales ?? 0).toString()).toFixed(8);
    const utility = new Decimal((row.totalSales ?? 0).toString())
      .minus((row.totalPrize ?? 0).toString())
      .toFixed(8);

    // Denormalized snapshot — every ledger row carries the exact rates/tiers used.
    const configSnapshot = {
      formulaType: config.formulaType,
      salesRate: config.salesRate?.toString() ?? null,
      utilityRate: config.utilityRate?.toString() ?? null,
      tiers: (config.tiers ?? []).map((t) => ({
        minSales: t.minSales.toString(),
        maxSales: t.maxSales?.toString() ?? null,
        rate: t.rate.toString(),
      })),
    };

    // D-08 explicit findFirst + update/create (no upsert call).
    const existing = await prisma.providerCommissionLedger.findFirst({
      where: { drawId, apiSystemId: row.apiSystemId },
    });
    if (existing) {
      await prisma.providerCommissionLedger.update({
        where: { id: existing.id },
        data: {
          amount,
          salesBase: sales,
          utilityBase: utility,
          configId: config.id,
          configSnapshot,
        },
      });
    } else {
      await prisma.providerCommissionLedger.create({
        data: {
          drawId,
          apiSystemId: row.apiSystemId,
          amount,
          salesBase: sales,
          utilityBase: utility,
          configId: config.id,
          configSnapshot,
        },
      });
    }
    providersProcessed++;
  }

  // Materializar la comisión total del sorteo en DrawFinancial.commission para
  // que /admin/reportes pueda leerla en un SELECT directo sin recomputar.
  // Best-effort: si DrawFinancial no existe (caso defensivo), no se rompe.
  try {
    const sumRows = await prisma.providerCommissionLedger.aggregate({
      where: { drawId },
      _sum: { amount: true },
    });
    const totalCommission = new Decimal((sumRows._sum.amount ?? 0).toString()).toFixed(2);
    await prisma.drawFinancial.update({
      where: { drawId },
      data: { commission: totalCommission },
    });
  } catch (err) {
    logger.warn(
      `[commission] DrawFinancial.commission update fallido drawId=${drawId}: ${err.message}`,
    );
  }

  logger.info(
    `[commission] computeAndUpsertLedgerForDraw drawId=${drawId} processed=${providersProcessed} skipped=${skipped}`,
  );
  return { providersProcessed, skipped };
}

/**
 * Compute total + row count for a settlement (no write — used by admin recompute
 * endpoint in Plan 12-03 and the backfill in Plan 12-04). The snapshot worker
 * owns writes.
 *
 * Build the week boundary by anchoring a date inside the target ISO week via
 * setISOWeekYear → setISOWeek → startOfISOWeek. Then wrap that with the VE ISO
 * week helpers for the actual UTC range used by the JOIN to Draw.
 */
export async function computeSettlementForWeek(apiSystemId, isoYear, isoWeek) {
  // Anchor: any date inside the target ISO week. date-fns operates on local time;
  // because we only use it to pick a Monday inside the week, the host TZ is fine —
  // the VE wrappers below convert to UTC bounds.
  let anchor = setISOWeekYear(new Date(), isoYear);
  anchor = setISOWeek(anchor, isoWeek);
  anchor = startOfISOWeek(anchor); // Monday 00:00 local — passed through VE helpers next.

  const start = startOfISOWeekVE(anchor);
  const end = endOfISOWeekVE(anchor);

  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(cl.amount), 0)::numeric(18,8) AS total,
           COUNT(*)::int                              AS rows
    FROM   "ProviderCommissionLedger" cl
    JOIN   "Draw" d ON d.id = cl."drawId"
    WHERE  cl."apiSystemId" = ${apiSystemId}
      AND  d."drawnAt" >= ${start}
      AND  d."drawnAt" <= ${end}
  `;
  const r = rows[0] ?? { total: '0', rows: 0 };
  return {
    total: r.total?.toString() ?? '0',
    ledgerRowCount: Number(r.rows ?? 0),
  };
}

/**
 * Load a settlement and the ledger rows that fed it. Used by Excel + PDF builders.
 *
 * Ledger rows are scoped via JOIN to Draw on the ISO week's drawnAt range, mirroring
 * computeSettlementForWeek (single source of truth for "what's in this settlement").
 */
export async function getSettlementWithLedger(settlementId) {
  const settlement = await prisma.providerWeeklySettlement.findUnique({
    where: { id: settlementId },
    include: { apiSystem: { select: { id: true, name: true, slug: true } } },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} no encontrado`);

  let anchor = setISOWeekYear(new Date(), settlement.isoYear);
  anchor = setISOWeek(anchor, settlement.isoWeek);
  anchor = startOfISOWeek(anchor);
  const start = startOfISOWeekVE(anchor);
  const end = endOfISOWeekVE(anchor);

  const ledgerRows = await prisma.providerCommissionLedger.findMany({
    where: {
      apiSystemId: settlement.apiSystemId,
      draw: { drawnAt: { gte: start, lte: end } },
    },
    include: {
      draw: { select: { id: true, drawDate: true, drawTime: true, drawnAt: true } },
    },
    orderBy: [{ draw: { drawnAt: 'asc' } }],
  });

  return { settlement, ledgerRows };
}

/**
 * Build an Excel workbook (xlsx) Buffer for a settlement.
 *
 * Audit-grade — totals are SUM formulas (not pre-computed values) so the
 * workbook re-totals correctly if a reviewer edits a cell.
 *
 * Header / column / SUM-formula / currency formatting mirrors accounting-report.service.js.
 */
export async function buildSettlementExcel(settlementId) {
  const { settlement, ledgerRows } = await getSettlementWithLedger(settlementId);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tote — Liquidación Semanal de Comisiones';
  wb.created = new Date();

  const tag = `${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`;
  const ws = wb.addWorksheet(tag);

  // Title
  ws.mergeCells('A1:E1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Liquidación ${settlement.apiSystem.name} — ${tag}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };
  ws.addRow([]);

  // Column headers — copied colors from accounting-report.service.js
  const headers = ['Sorteo', 'Fecha', 'Ventas', 'Premios', 'Comisión'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  const dataStartRow = headerRow.number + 1;
  for (const row of ledgerRows) {
    const sales = Number(row.salesBase?.toString() ?? 0);
    const utility = Number(row.utilityBase?.toString() ?? 0);
    // "Premios" in the report = salesBase - utilityBase (sales minus utility),
    // surfacing the prize base for the auditor without storing it twice.
    const prizes = Number(new Decimal(sales).minus(utility).toFixed(2));
    ws.addRow([
      row.drawId.slice(0, 8),
      row.draw?.drawnAt ?? null,
      sales,
      prizes,
      Number(row.amount?.toString() ?? 0),
    ]);
  }
  const dataEndRow = dataStartRow + ledgerRows.length - 1;

  // TOTAL row — SUM formulas (auditable). Mirrors accounting-report.service.js
  ws.addRow([]);
  const totalRow = ws.addRow([
    'TOTAL',
    '',
    ledgerRows.length > 0 ? { formula: `SUM(C${dataStartRow}:C${dataEndRow})` } : 0,
    ledgerRows.length > 0 ? { formula: `SUM(D${dataStartRow}:D${dataEndRow})` } : 0,
    ledgerRows.length > 0 ? { formula: `SUM(E${dataStartRow}:E${dataEndRow})` } : 0,
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  };

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;

  // Currency formatting on C/D/E for data + total rows
  const startCur = dataStartRow;
  const endCur = totalRow.number;
  for (let r = startCur; r <= endCur; r++) {
    ['C', 'D', 'E'].forEach((col) => {
      ws.getCell(`${col}${r}`).numFmt = '#,##0.00';
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * PDF data shape — pure data prep, controller (Plan 12-03) owns PDFKit streaming.
 * Totals are decimal.js sums of the ledger columns.
 *
 * @returns {Promise<{ settlement, ledgerRows, totals: { sales, prizes, commission } }>}
 */
export async function getSettlementPdfData(settlementId) {
  const { settlement, ledgerRows } = await getSettlementWithLedger(settlementId);

  let sumSales = new Decimal(0);
  let sumPrizes = new Decimal(0);
  let sumCommission = new Decimal(0);
  for (const r of ledgerRows) {
    const sales = new Decimal((r.salesBase ?? 0).toString());
    const utility = new Decimal((r.utilityBase ?? 0).toString());
    const commission = new Decimal((r.amount ?? 0).toString());
    sumSales = sumSales.plus(sales);
    sumPrizes = sumPrizes.plus(sales.minus(utility));
    sumCommission = sumCommission.plus(commission);
  }

  return {
    settlement,
    ledgerRows,
    totals: {
      sales: sumSales.toFixed(8),
      prizes: sumPrizes.toFixed(8),
      commission: sumCommission.toFixed(8),
    },
  };
}
