/**
 * Quota service — per-item per-draw caps on bet amount.
 *
 * Central service consumed by webhook flow. Designed to extend to
 * online/PULL sources without refactor.
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Return quota + live utilization for every item in the draw's game.
 * Items without a quota get maxAmount = null (no cap configured).
 *
 * @param {string} drawId
 * @returns {Promise<Array<{
 *   gameItemId: string, number: string, name: string,
 *   maxAmount: number|null, soldAmount: number,
 *   availableAmount: number|null, exceeded: boolean
 * }>>}
 */
export async function getDrawQuotas(drawId) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { id: true, gameId: true, status: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} not found`);

  const [items, quotas, sold] = await Promise.all([
    prisma.gameItem.findMany({
      where: { gameId: draw.gameId, isActive: true },
      select: { id: true, number: true, name: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.drawItemQuota.findMany({
      where: { drawId },
      select: { gameItemId: true, maxAmount: true },
    }),
    // Requires TicketDetail.drawId to be populated on all webhook/online/SRQ tickets.
    // Any legacy rows with drawId=null are silently excluded from soldAmount.
    prisma.ticketDetail.groupBy({
      by: ['gameItemId'],
      where: {
        drawId,
        status: 'ACTIVE',
        ticket: { status: 'ACTIVE' },
      },
      _sum: { amount: true },
    }),
  ]);

  const quotaByItem = new Map(quotas.map((q) => [q.gameItemId, Number(q.maxAmount)]));
  const soldByItem = new Map(sold.map((s) => [s.gameItemId, Number(s._sum.amount ?? 0)]));

  return items.map((item) => {
    const maxAmount = quotaByItem.has(item.id) ? quotaByItem.get(item.id) : null;
    const soldAmount = soldByItem.get(item.id) ?? 0;
    const availableAmount = maxAmount === null ? null : maxAmount - soldAmount;
    return {
      gameItemId: item.id,
      number: item.number,
      name: item.name,
      maxAmount,
      soldAmount,
      availableAmount,
      exceeded: maxAmount !== null && soldAmount > maxAmount,
    };
  });
}

/**
 * Set or update a quota for (drawId, gameItemId).
 * @param {object} params
 * @param {string} params.drawId
 * @param {string} params.gameItemId
 * @param {number} params.maxAmount
 * @param {string} [params.userId]
 */
export async function setQuota({ drawId, gameItemId, maxAmount, userId }) {
  if (typeof maxAmount !== 'number' || maxAmount <= 0) {
    throw new Error('maxAmount must be a positive number');
  }
  return prisma.drawItemQuota.upsert({
    where: { drawId_gameItemId: { drawId, gameItemId } },
    create: { drawId, gameItemId, maxAmount, createdBy: userId ?? null },
    update: { maxAmount },
  });
}

/**
 * Remove a quota. Idempotent — swallows Prisma P2025 (record not found).
 */
export async function removeQuota({ drawId, gameItemId }) {
  try {
    await prisma.drawItemQuota.delete({
      where: { drawId_gameItemId: { drawId, gameItemId } },
    });
  } catch (err) {
    if (err.code === 'P2025') return;
    throw err;
  }
}
