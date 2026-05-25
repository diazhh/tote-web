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
  // maxAmount = 0 → bloqueo duro (cualquier intento de venta excede el cupo).
  // maxAmount > 0 → cupo parcial.
  if (typeof maxAmount !== 'number' || !Number.isFinite(maxAmount) || maxAmount < 0) {
    throw new Error('maxAmount must be a non-negative number');
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

/**
 * Validate a ticket's plays against configured quotas.
 * All-or-nothing: first failing (draw, item) aborts the whole ticket.
 *
 * Must run inside a Prisma transaction (tx) — uses SELECT ... FOR UPDATE
 * on matched quota rows to serialize concurrent webhooks targeting the
 * same (drawId, gameItemId) combination.
 *
 * @param {Array<{drawId:string, gameItemId:string, amount:number}>} plays
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<{ok:true} | {ok:false, reason:string}>}
 */
export async function checkTicketQuotas(plays, tx) {
  if (!tx) throw new Error('tx is required');
  if (!Array.isArray(plays) || plays.length === 0) return { ok: true };

  // Aggregate attempted amount per (drawId, gameItemId) — same ticket may repeat.
  const attempted = new Map(); // key: "drawId|gameItemId" -> { drawId, gameItemId, amount }
  for (const p of plays) {
    const key = `${p.drawId}|${p.gameItemId}`;
    const prev = attempted.get(key);
    if (prev) {
      prev.amount += Number(p.amount);
    } else {
      attempted.set(key, { drawId: p.drawId, gameItemId: p.gameItemId, amount: Number(p.amount) });
    }
  }
  const combos = Array.from(attempted.values());

  // Step 1: Lock and fetch quotas for these combos using raw SQL.
  // Prisma's findMany does not support FOR UPDATE; $queryRaw keeps the lock
  // within the active transaction passed as tx.
  const drawIds = [...new Set(combos.map((c) => c.drawId))];
  const itemIds = [...new Set(combos.map((c) => c.gameItemId))];
  const quotaRows = await tx.$queryRaw`
    SELECT "drawId", "gameItemId", "maxAmount"
    FROM "DrawItemQuota"
    WHERE "drawId" = ANY(${drawIds}::text[])
      AND "gameItemId" = ANY(${itemIds}::text[])
    FOR UPDATE
  `;

  // Index quotas by key, and filter to only combos we actually play in.
  const quotaByKey = new Map();
  for (const q of quotaRows) {
    const key = `${q.drawId}|${q.gameItemId}`;
    if (attempted.has(key)) quotaByKey.set(key, Number(q.maxAmount));
  }

  // Early exit: no quotas apply to this ticket.
  if (quotaByKey.size === 0) return { ok: true };

  // Step 2: Fetch current ACTIVE sold totals for only the capped combos.
  const cappedCombos = combos.filter((c) => quotaByKey.has(`${c.drawId}|${c.gameItemId}`));
  const soldRows = await tx.ticketDetail.groupBy({
    by: ['drawId', 'gameItemId'],
    where: {
      OR: cappedCombos.map((c) => ({ drawId: c.drawId, gameItemId: c.gameItemId })),
      status: 'ACTIVE',
      ticket: { status: 'ACTIVE' },
    },
    _sum: { amount: true },
  });

  const soldByKey = new Map();
  for (const s of soldRows) {
    soldByKey.set(`${s.drawId}|${s.gameItemId}`, Number(s._sum.amount ?? 0));
  }

  // Step 3: Check each capped combo.
  for (const combo of cappedCombos) {
    const key = `${combo.drawId}|${combo.gameItemId}`;
    const max = quotaByKey.get(key);
    const sold = soldByKey.get(key) ?? 0;
    const total = sold + combo.amount;
    if (total > max) {
      const [item, draw] = await Promise.all([
        tx.gameItem.findUnique({
          where: { id: combo.gameItemId },
          select: { number: true, name: true },
        }),
        tx.draw.findUnique({
          where: { id: combo.drawId },
          select: { drawTime: true },
        }),
      ]);
      const itemLabel = item ? `${item.number} (${item.name})` : combo.gameItemId;
      const timeLabel = draw?.drawTime ? draw.drawTime.slice(0, 5) : combo.drawId;
      return {
        ok: false,
        reason: `Cupo excedido para item ${itemLabel} en sorteo ${timeLabel}: vendido ${sold} + intento ${combo.amount} = ${total} > cupo ${max}`,
      };
    }
  }

  return { ok: true };
}

/**
 * Variante de `checkTicketQuotas` para flujo de aceptación parcial.
 *
 * En vez de rechazar el ticket entero al primer (drawId, gameItemId) sin
 * cupo, particiona los plays en `accepted` (entran al ticket) y `rejected`
 * (se descartan silenciosamente). La granularidad es por combinación
 * (drawId, gameItemId): si la suma intentada para esa combo excede el cupo
 * o el item está bloqueado (maxAmount = 0), TODOS los plays que apunten a
 * esa combo se descartan — no se hace split de monto.
 *
 * Debe correr dentro de una transacción (mismo SELECT ... FOR UPDATE).
 *
 * @param {Array} plays - cada play: { drawId, gameItemId, amount, ... }
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<{accepted: Array, rejected: Array<{play, reason}>}>}
 */
export async function partitionByQuota(plays, tx) {
  if (!tx) throw new Error('tx is required');
  if (!Array.isArray(plays) || plays.length === 0) {
    return { accepted: [], rejected: [] };
  }

  // 1. Agregar intentado por combo (drawId, gameItemId).
  const attempted = new Map();
  for (const p of plays) {
    const key = `${p.drawId}|${p.gameItemId}`;
    const prev = attempted.get(key);
    if (prev) {
      prev.amount += Number(p.amount);
    } else {
      attempted.set(key, { drawId: p.drawId, gameItemId: p.gameItemId, amount: Number(p.amount) });
    }
  }
  const combos = Array.from(attempted.values());

  // 2. Lock + fetch quotas para los combos atacados.
  const drawIds = [...new Set(combos.map((c) => c.drawId))];
  const itemIds = [...new Set(combos.map((c) => c.gameItemId))];
  const quotaRows = await tx.$queryRaw`
    SELECT "drawId", "gameItemId", "maxAmount"
    FROM "DrawItemQuota"
    WHERE "drawId" = ANY(${drawIds}::text[])
      AND "gameItemId" = ANY(${itemIds}::text[])
    FOR UPDATE
  `;

  const quotaByKey = new Map();
  for (const q of quotaRows) {
    const key = `${q.drawId}|${q.gameItemId}`;
    if (attempted.has(key)) quotaByKey.set(key, Number(q.maxAmount));
  }

  // Sin cupos configurados → todo pasa.
  if (quotaByKey.size === 0) {
    return { accepted: plays.slice(), rejected: [] };
  }

  // 3. Fetch sold totals para los combos con cupo.
  const cappedCombos = combos.filter((c) => quotaByKey.has(`${c.drawId}|${c.gameItemId}`));
  const soldRows = await tx.ticketDetail.groupBy({
    by: ['drawId', 'gameItemId'],
    where: {
      OR: cappedCombos.map((c) => ({ drawId: c.drawId, gameItemId: c.gameItemId })),
      status: 'ACTIVE',
      ticket: { status: 'ACTIVE' },
    },
    _sum: { amount: true },
  });

  const soldByKey = new Map();
  for (const s of soldRows) {
    soldByKey.set(`${s.drawId}|${s.gameItemId}`, Number(s._sum.amount ?? 0));
  }

  // 4. Marcar combos rechazados (no cabe la suma intentada).
  const rejectedKeys = new Map(); // key → reason
  for (const combo of cappedCombos) {
    const key = `${combo.drawId}|${combo.gameItemId}`;
    const max = quotaByKey.get(key);
    const sold = soldByKey.get(key) ?? 0;
    if (sold + combo.amount > max) {
      const remaining = Math.max(0, max - sold);
      rejectedKeys.set(
        key,
        remaining <= 0
          ? `Item bloqueado o cupo agotado (max=${max}, vendido=${sold})`
          : `Cupo insuficiente (max=${max}, vendido=${sold}, intento=${combo.amount}, disponible=${remaining})`
      );
    }
  }

  // 5. Particionar el array original.
  const accepted = [];
  const rejected = [];
  for (const p of plays) {
    const key = `${p.drawId}|${p.gameItemId}`;
    if (rejectedKeys.has(key)) {
      rejected.push({ play: p, reason: rejectedKeys.get(key) });
    } else {
      accepted.push(p);
    }
  }

  if (rejected.length > 0) {
    logger.info(`[quota] partitionByQuota: ${accepted.length} accepted, ${rejected.length} rejected`);
  }

  return { accepted, rejected };
}
