/**
 * Desglose de comisión por proveedor para una semana ISO.
 *
 * Reusa commission.service.js para mantener una única fuente de verdad sobre
 * las fórmulas. Las cantidades de comisión calculadas aquí DEBEN coincidir
 * (al céntimo) con SUM(ProviderCommissionLedger.amount) para los sorteos de
 * la semana — si difieren agregamos warning, no bloqueamos.
 *
 * @module pnl-provider-breakdown.service
 */
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getMondayOfISOWeek } from '../lib/dateUtils.js';
import {
  findEffectiveConfig,
  computeCommission,
  getCumulativeWeeklySales,
} from './commission.service.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fmt(dec) {
  return new Decimal(dec ?? 0).toFixed(2);
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

  return {
    isoYear,
    isoWeek,
    weekStart: windowStartUtc.toISOString().slice(0, 10),
    weekEnd: new Date(windowEndUtc.getTime() - 1).toISOString().slice(0, 10),
    apiSystemId: apiSystem.id,
    apiSystemName: apiSystem.name,
    configs: [],
    byGame: [],
    totals: {
      sales: fmt(0),
      prizes: fmt(0),
      gross: fmt(0),
      salesCommission: fmt(0),
      utilityCommission: fmt(0),
      totalCommission: fmt(0),
      netToHouse: fmt(0),
    },
    warnings: [],
  };
}
