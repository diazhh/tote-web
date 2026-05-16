import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Aggregate active tickets for a draw and UPSERT DrawLiveSnapshot.
 * Excludes CANCELLED tickets. Source-agnostic (webhook + scrape + taquilla
 * all roll up). Per-provider breakdown stored as JSON for cheap reads.
 */
export async function computeDrawLiveSnapshot(drawId) {
  const tickets = await prisma.ticket.findMany({
    where: { drawId, status: { not: 'CANCELLED' } },
    select: {
      amount: true,
      apiSystemId: true,
      apiSystem: { select: { name: true } },
    },
  });

  let totalSales = 0;
  const byProviderMap = new Map();

  for (const t of tickets) {
    const amt = Number(t.amount);
    totalSales += amt;
    const key = t.apiSystemId || '__taquilla__';
    if (!byProviderMap.has(key)) {
      byProviderMap.set(key, {
        apiSystemId: t.apiSystemId || null,
        name: t.apiSystem?.name || 'TAQUILLA',
        sales: 0,
        count: 0,
      });
    }
    const entry = byProviderMap.get(key);
    entry.sales += amt;
    entry.count += 1;
  }

  const byProvider = Array.from(byProviderMap.values()).map((p) => ({
    ...p,
    sales: Number(p.sales.toFixed(2)),
  }));

  const data = {
    totalSales: Number(totalSales.toFixed(2)),
    ticketCount: tickets.length,
    byProvider,
    refreshedAt: new Date(),
  };

  await prisma.drawLiveSnapshot.upsert({
    where: { drawId },
    create: { drawId, ...data },
    update: data,
  });

  return data;
}

// Test seam: lets unit tests inject a live-snapshot lookup. In production this
// is the default resolver which reads from prisma.drawLiveSnapshot.
let _liveSnapResolver = async (drawId) => {
  const row = await prisma.drawLiveSnapshot.findUnique({
    where: { drawId },
    include: { draw: { select: { gameId: true } } },
  });
  if (!row) return null;
  return {
    drawId: row.drawId,
    gameId: row.draw?.gameId || null,
    totalSales: Number(row.totalSales),
    ticketCount: row.ticketCount,
    byProvider: row.byProvider || [],
  };
};

export function __setLiveSnapResolver(fn) {
  _liveSnapResolver = fn;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketKey(gameId, source, apiSystemId) {
  return `${gameId || 'null'}|${source || 'null'}|${apiSystemId || 'null'}`;
}

/**
 * Aggregate the day's results per (gameId, source, apiSystemId).
 *
 * Reads:
 *   - DrawFinancial for draws that are DRAWN today (authoritative).
 *   - DrawLiveSnapshot for draws that are SCHEDULED/CLOSED today (interim).
 *
 * Writes a row per non-empty bucket into DailyAggregateSnapshot.
 *
 * Race-safe: deleteMany(date)+upsert pattern → idempotent across re-runs.
 */
export async function computeDailyAggregateSnapshot(date) {
  const day = startOfDay(date);

  const draws = await prisma.draw.findMany({
    where: { drawDate: day },
    select: { id: true, gameId: true, status: true },
  });

  const drawnIds = draws.filter((d) => d.status === 'DRAWN').map((d) => d.id);
  const liveIds  = draws.filter((d) => d.status !== 'DRAWN').map((d) => d.id);

  const buckets = new Map();

  if (drawnIds.length > 0) {
    const finRows = await prisma.drawFinancial.findMany({
      where: { drawId: { in: drawnIds } },
      include: {
        draw: { select: { gameId: true } },
        providers: true,
      },
    });

    for (const fr of finRows) {
      const gameId = fr.draw?.gameId;
      for (const p of fr.providers || []) {
        // Source heuristic: apiSystemId present → EXTERNAL_API (PUSH/PULL/SCRAPE — coarse);
        // null → TAQUILLA_ONLINE. Per-source detail comes from the apiSystemId column itself.
        const source = p.apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE';
        const k = bucketKey(gameId, source, p.apiSystemId);
        const acc = buckets.get(k) || { gameId, source, apiSystemId: p.apiSystemId, totalSales: 0, ticketCount: 0, prizeTotal: 0 };
        acc.totalSales += Number(p.totalSales);
        acc.ticketCount += p.ticketCount;
        acc.prizeTotal += Number(p.totalPrize);
        buckets.set(k, acc);
      }
    }
  }

  for (const drawId of liveIds) {
    const live = await _liveSnapResolver(drawId);
    if (!live) continue;
    for (const p of live.byProvider || []) {
      const source = p.apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE';
      const k = bucketKey(live.gameId, source, p.apiSystemId);
      const acc = buckets.get(k) || { gameId: live.gameId, source, apiSystemId: p.apiSystemId, totalSales: 0, ticketCount: 0, prizeTotal: 0 };
      acc.totalSales += Number(p.sales);
      acc.ticketCount += p.count;
      // prize for non-DRAWN draws is unknown → stays 0
      buckets.set(k, acc);
    }
  }

  // Wipe-and-write — idempotent, simpler than per-row diff.
  await prisma.dailyAggregateSnapshot.deleteMany({ where: { date: day } });

  for (const acc of buckets.values()) {
    await prisma.dailyAggregateSnapshot.upsert({
      where: {
        date_gameId_source_apiSystemId: {
          date: day,
          gameId: acc.gameId,
          source: acc.source,
          apiSystemId: acc.apiSystemId,
        },
      },
      create: {
        date: day,
        gameId: acc.gameId,
        source: acc.source,
        apiSystemId: acc.apiSystemId,
        totalSales: Number(acc.totalSales.toFixed(2)),
        ticketCount: acc.ticketCount,
        prizeTotal: Number(acc.prizeTotal.toFixed(2)),
        refreshedAt: new Date(),
      },
      update: {
        totalSales: Number(acc.totalSales.toFixed(2)),
        ticketCount: acc.ticketCount,
        prizeTotal: Number(acc.prizeTotal.toFixed(2)),
        refreshedAt: new Date(),
      },
    });
  }

  return { bucketsWritten: buckets.size };
}
