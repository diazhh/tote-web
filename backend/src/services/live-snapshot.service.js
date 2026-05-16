import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import logger from '../lib/logger.js';

const D = Prisma.Decimal;

/**
 * Aggregate active tickets for a draw and UPSERT DrawLiveSnapshot.
 * Excludes CANCELLED tickets. Source-aware: each provider entry preserves
 * the ticket-level TicketSource so daily aggregates can rollup per source
 * without losing PUSH vs SCRAPE vs PULL distinctions.
 */
export async function computeDrawLiveSnapshot(drawId) {
  const tickets = await prisma.ticket.findMany({
    where: { drawId, status: { not: 'CANCELLED' } },
    select: {
      amount: true,
      source: true,
      apiSystemId: true,
      apiSystem: { select: { name: true } },
    },
  });

  let totalSales = new D(0);
  const byProviderMap = new Map();

  for (const t of tickets) {
    const amt = new D(t.amount);
    totalSales = totalSales.plus(amt);
    const key = `${t.apiSystemId || '__taquilla__'}|${t.source}`;
    if (!byProviderMap.has(key)) {
      byProviderMap.set(key, {
        apiSystemId: t.apiSystemId || null,
        source: t.source,
        name: t.apiSystem?.name || 'TAQUILLA',
        sales: new D(0),
        count: 0,
      });
    }
    const entry = byProviderMap.get(key);
    entry.sales = entry.sales.plus(amt);
    entry.count += 1;
  }

  const byProvider = Array.from(byProviderMap.values()).map((p) => ({
    apiSystemId: p.apiSystemId,
    source: p.source,
    name: p.name,
    sales: Number(p.sales.toFixed(2)),
    count: p.count,
  }));

  const data = {
    totalSales: totalSales.toFixed(2),
    ticketCount: tickets.length,
    byProvider,
    refreshedAt: new Date(),
  };

  await prisma.drawLiveSnapshot.upsert({
    where: { drawId },
    create: { drawId, ...data },
    update: data,
  });

  logger.info(`[live-snapshot] draw=${drawId} totalSales=${data.totalSales} tickets=${data.ticketCount} providers=${byProvider.length}`);

  return data;
}

// Default resolver: reads from prisma.drawLiveSnapshot.
const _defaultLiveSnapResolver = async (drawId) => {
  const row = await prisma.drawLiveSnapshot.findUnique({
    where: { drawId },
    include: { draw: { select: { gameId: true } } },
  });
  if (!row) return null;
  return {
    drawId: row.drawId,
    gameId: row.draw?.gameId || null,
    totalSales: new D(row.totalSales),
    ticketCount: row.ticketCount,
    byProvider: row.byProvider || [],
  };
};

// Test seam: lets unit tests inject a live-snapshot lookup. Passing null
// (or omitting the argument) restores the default — tests should do that
// in beforeEach to prevent state leaks between cases.
let _liveSnapResolver = _defaultLiveSnapResolver;

export function __setLiveSnapResolver(fn) {
  _liveSnapResolver = fn ?? _defaultLiveSnapResolver;
}

function startOfDay(d) {
  // The workers pass a Date already at UTC midnight (via getVenezuelaDateAsUTC).
  // We use UTC accessors so calling this on a Caracas-local Date object also
  // produces a stable UTC-midnight result independent of the running TZ.
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function bucketKey(gameId, source, apiSystemId) {
  return `${gameId || 'null'}|${source || 'null'}|${apiSystemId || 'null'}`;
}

function modeToSource(mode) {
  // ApiSystemMode enum is PULL | PUSH | SCRAPE. Map to TicketSource.
  if (mode === 'PUSH') return 'WEBHOOK_PUSH';
  if (mode === 'SCRAPE') return 'EXTERNAL_SCRAPE';
  // PULL (legacy SRQ) and unknown → EXTERNAL_API
  return 'EXTERNAL_API';
}

/**
 * Aggregate the day's results per (gameId, source, apiSystemId).
 *
 * Reads:
 *   - DrawFinancial for draws DRAWN today (authoritative). Source is resolved
 *     from the joined ApiSystem.mode.
 *   - DrawLiveSnapshot for draws not yet DRAWN today. Source is carried in
 *     byProvider entries (set by computeDrawLiveSnapshot from Ticket.source).
 *
 * Writes a row per non-empty bucket into DailyAggregateSnapshot.
 *
 * Race-safe: deleteMany(date) + upsert — idempotent across re-runs.
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

  function addToBucket(gameId, source, apiSystemId, sales, count, prize) {
    const k = bucketKey(gameId, source, apiSystemId);
    const acc = buckets.get(k) || {
      gameId, source, apiSystemId,
      totalSales: new D(0),
      ticketCount: 0,
      prizeTotal: new D(0),
    };
    acc.totalSales = acc.totalSales.plus(sales);
    acc.ticketCount += count;
    acc.prizeTotal = acc.prizeTotal.plus(prize);
    buckets.set(k, acc);
  }

  if (drawnIds.length > 0) {
    const finRows = await prisma.drawFinancial.findMany({
      where: { drawId: { in: drawnIds } },
      include: {
        draw: { select: { gameId: true } },
        providers: { include: { apiSystem: { select: { mode: true } } } },
      },
    });

    for (const fr of finRows) {
      const gameId = fr.draw?.gameId;
      for (const p of fr.providers || []) {
        const source = p.apiSystemId ? modeToSource(p.apiSystem?.mode) : 'TAQUILLA_ONLINE';
        addToBucket(
          gameId,
          source,
          p.apiSystemId,
          new D(p.totalSales),
          p.ticketCount,
          new D(p.totalPrize),
        );
      }
    }
  }

  for (const drawId of liveIds) {
    const live = await _liveSnapResolver(drawId);
    if (!live) continue;
    for (const p of live.byProvider || []) {
      addToBucket(
        live.gameId,
        p.source || (p.apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE'), // fallback for snapshot rows written before this fix
        p.apiSystemId,
        new D(p.sales),
        p.count,
        new D(0), // prize unknown for non-DRAWN draws
      );
    }
  }

  await prisma.dailyAggregateSnapshot.deleteMany({ where: { date: day } });

  const now = new Date();
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
        totalSales: acc.totalSales.toFixed(2),
        ticketCount: acc.ticketCount,
        prizeTotal: acc.prizeTotal.toFixed(2),
        refreshedAt: now,
      },
      update: {
        totalSales: acc.totalSales.toFixed(2),
        ticketCount: acc.ticketCount,
        prizeTotal: acc.prizeTotal.toFixed(2),
        refreshedAt: now,
      },
    });
  }

  logger.info(`[daily-snapshot] date=${day.toISOString().slice(0,10)} buckets=${buckets.size}`);

  return { bucketsWritten: buckets.size };
}
