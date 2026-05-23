/**
 * Desglose de comisión por proveedor para una semana ISO.
 *
 * A diferencia de `commission.service.js#computeCommission`, que retorna un
 * único monto total, este módulo necesita el desglose por componente
 * (com. ventas + com. utilidad) para la UI. Por eso la fórmula se aplica
 * inline, no reusando computeCommission. La aritmética sigue las mismas
 * reglas y debe cuadrar al céntimo con `SUM(ProviderCommissionLedger.amount)`
 * para los sorteos de la semana — si difieren agregamos un warning, no
 * bloqueamos.
 *
 * @module pnl-provider-breakdown.service
 */
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getMondayOfISOWeek } from '../lib/dateUtils.js';
import {
  findEffectiveConfig,
  getCumulativeWeeklySales,
} from './commission.service.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute the per-row commission breakdown given a row's sales/prizes/gross
 * and the effective config. Returns `{ salesRate, utilityRate, salesCommission,
 * utilityCommission, totalCommission, tierLabel }` where amounts are Decimal
 * (or null), rates are strings (or null), and tierLabel is string (or null).
 *
 * When `config == null`, returns all-null amounts/rates and a zero
 * totalCommission so the no-config path remains arithmetically harmless.
 */
function computeRowBreakdown(sales, prizes, gross, config, cumulativeWeeklySales) {
  let salesRate = null;
  let utilityRate = null;
  let salesCommission = null;
  let utilityCommission = null;
  let tierLabel = null;

  if (!config) {
    return {
      salesRate,
      utilityRate,
      salesCommission,
      utilityCommission,
      totalCommission: new Decimal(0),
      tierLabel,
    };
  }

  const ft = config.formulaType;
  if (ft === 'SALES_PCT' || ft === 'SALES_AND_UTILITY_PCT') {
    salesRate = new Decimal(config.salesRate.toString()).toFixed(2);
    salesCommission = sales.times(config.salesRate.toString()).dividedBy(100);
  }
  if (ft === 'UTILITY_PCT') {
    utilityRate = new Decimal(config.utilityRate.toString()).toFixed(2);
    utilityCommission = gross.times(config.utilityRate.toString()).dividedBy(100);
  } else if (ft === 'SALES_AND_UTILITY_PCT') {
    // Modelo cascada (2026-05-22): base de la comisión sobre utilidad es
    // (ventas − comisiónVenta − premios), no (ventas − premios). Ver
    // commission.service.js:computeCommission para el detalle.
    utilityRate = new Decimal(config.utilityRate.toString()).toFixed(2);
    const utilityBaseCascade = sales.minus(salesCommission ?? new Decimal(0)).minus(prizes);
    utilityCommission = utilityBaseCascade
      .times(config.utilityRate.toString())
      .dividedBy(100);
  }
  if (ft === 'TIERED') {
    const cum = new Decimal(cumulativeWeeklySales);
    const bracket = (config.tiers || []).find((t) => {
      const min = new Decimal(t.minSales.toString());
      if (cum.lt(min)) return false;
      if (t.maxSales == null) return true;
      return cum.lt(new Decimal(t.maxSales.toString()));
    });
    if (!bracket) {
      throw new Error(
        `No matching TIERED bracket for cumulative weekly sales ${cum.toString()}`
      );
    }
    salesRate = new Decimal(bracket.rate.toString()).toFixed(2);
    salesCommission = sales.times(bracket.rate.toString()).dividedBy(100);
    const maxLabel = bracket.maxSales == null ? '∞' : bracket.maxSales.toString();
    tierLabel = `${salesRate}% — tramo [${bracket.minSales.toString()}, ${maxLabel})`;
  }

  const totalCommission = (salesCommission ?? new Decimal(0)).plus(
    utilityCommission ?? new Decimal(0)
  );

  return {
    salesRate,
    utilityRate,
    salesCommission,
    utilityCommission,
    totalCommission,
    tierLabel,
  };
}

/**
 * Build the entry object stored in `configsByKey` for a given effective config.
 * The Map and key computation stay in the main loop; only the entry-object
 * construction is centralized here.
 */
function buildConfigBucketEntry(config) {
  return {
    gameIds: [],
    gameNames: [],
    formulaType: config.formulaType,
    salesRate:
      config.salesRate != null
        ? new Decimal(config.salesRate.toString()).toFixed(2)
        : null,
    utilityRate:
      config.utilityRate != null
        ? new Decimal(config.utilityRate.toString()).toFixed(2)
        : null,
    tiers: (config.tiers || []).map((t) => ({
      minSales: t.minSales.toString(),
      maxSales: t.maxSales == null ? null : t.maxSales.toString(),
      rate: new Decimal(t.rate.toString()).toFixed(2),
    })),
    effectiveFrom:
      config.effectiveFrom instanceof Date
        ? config.effectiveFrom.toISOString().slice(0, 10)
        : String(config.effectiveFrom).slice(0, 10),
  };
}

export async function getProviderBreakdownForWeek({ apiSystemId, isoYear, isoWeek }) {
  const windowStartUtc = getMondayOfISOWeek(isoYear, isoWeek);
  const windowEndUtc = new Date(windowStartUtc.getTime() + WEEK_MS);

  const apiSystem = await prisma.apiSystem.findUnique({
    where: { id: apiSystemId },
    select: { id: true, name: true },
  });
  if (!apiSystem) {
    const err = new Error(`apiSystemId ${apiSystemId} no existe`);
    err.statusCode = 404;
    throw err;
  }

  const rows = await prisma.$queryRaw`
    SELECT d."gameId"           AS "gameId",
           g.name               AS "gameName",
           SUM(dfp."totalSales")::numeric(18,8) AS sales,
           SUM(dfp."totalPrize")::numeric(18,8) AS prizes
    FROM   "DrawFinancialProvider" dfp
    JOIN   "Draw" d ON d.id = dfp."drawId"
    JOIN   "Game" g ON g.id = d."gameId"
    WHERE  dfp."apiSystemId" = ${apiSystemId}
      AND  d."drawnAt" >= ${windowStartUtc}
      AND  d."drawnAt" <  ${windowEndUtc}
    GROUP BY d."gameId", g.name
    ORDER BY g.name
  `;

  const byGame = [];
  const totals = {
    sales: new Decimal(0),
    prizes: new Decimal(0),
    gross: new Decimal(0),
    salesCommission: new Decimal(0),
    utilityCommission: new Decimal(0),
    totalCommission: new Decimal(0),
    netToHouse: new Decimal(0),
  };
  const warnings = [];
  const configsByKey = new Map();

  // Refdate para findEffectiveConfig: último instante de la semana.
  const refDate = new Date(windowEndUtc.getTime() - 1);

  for (const row of rows) {
    const sales = new Decimal((row.sales ?? 0).toString());
    const prizes = new Decimal((row.prizes ?? 0).toString());
    const gross = sales.minus(prizes);

    const config = await findEffectiveConfig(apiSystemId, refDate, row.gameId);
    const cumulativeWeeklySales =
      config?.formulaType === 'TIERED'
        ? await getCumulativeWeeklySales(apiSystemId, refDate)
        : null;

    const {
      salesRate,
      utilityRate,
      salesCommission,
      utilityCommission,
      totalCommission,
      tierLabel,
    } = computeRowBreakdown(sales, prizes, gross, config, cumulativeWeeklySales);

    const configMissing = !config;

    if (config) {
      const key = `${config.formulaType}|${config.salesRate?.toString() ?? ''}|${config.utilityRate?.toString() ?? ''}|${config.effectiveFrom?.toISOString?.() ?? config.effectiveFrom}`;
      if (!configsByKey.has(key)) {
        configsByKey.set(key, buildConfigBucketEntry(config));
      }
      const bucket = configsByKey.get(key);
      bucket.gameIds.push(row.gameId);
      bucket.gameNames.push(row.gameName);
    } else {
      warnings.push(`Sin config vigente para: ${row.gameName}`);
    }

    if (utilityCommission && gross.isNegative() && utilityRate) {
      warnings.push(`Utilidad negativa en ${row.gameName}: el componente de utilidad redujo la comisión`);
    }

    const netToHouse = gross.minus(totalCommission);

    byGame.push({
      gameId: row.gameId,
      gameName: row.gameName,
      sales: sales.toFixed(2),
      prizes: prizes.toFixed(2),
      gross: gross.toFixed(2),
      formulaType: config?.formulaType ?? null,
      salesRate,
      salesCommission: salesCommission ? salesCommission.toFixed(2) : null,
      utilityRate,
      utilityCommission: utilityCommission ? utilityCommission.toFixed(2) : null,
      totalCommission: totalCommission.toFixed(2),
      netToHouse: netToHouse.toFixed(2),
      configMissing,
      tierLabel,
    });

    totals.sales = totals.sales.plus(sales);
    totals.prizes = totals.prizes.plus(prizes);
    totals.gross = totals.gross.plus(gross);
    if (salesCommission) totals.salesCommission = totals.salesCommission.plus(salesCommission);
    if (utilityCommission) totals.utilityCommission = totals.utilityCommission.plus(utilityCommission);
    totals.totalCommission = totals.totalCommission.plus(totalCommission);
    totals.netToHouse = totals.netToHouse.plus(netToHouse);
  }

  return {
    isoYear,
    isoWeek,
    weekStart: windowStartUtc.toISOString().slice(0, 10),
    weekEnd: new Date(windowEndUtc.getTime() - 1).toISOString().slice(0, 10),
    apiSystemId: apiSystem.id,
    apiSystemName: apiSystem.name,
    configs: Array.from(configsByKey.values()),
    byGame,
    totals: {
      sales: totals.sales.toFixed(2),
      prizes: totals.prizes.toFixed(2),
      gross: totals.gross.toFixed(2),
      salesCommission: totals.salesCommission.toFixed(2),
      utilityCommission: totals.utilityCommission.toFixed(2),
      totalCommission: totals.totalCommission.toFixed(2),
      netToHouse: totals.netToHouse.toFixed(2),
    },
    warnings,
  };
}
