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
