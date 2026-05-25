import logger from '../../lib/logger.js';
import adminNotificationService from '../../services/admin-notification.service.js';
import { prisma } from '../../lib/prisma.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

// Atribución por TicketDetail.drawId (NO por Ticket.drawId) — corrige el bug
// que sub-/sobre-reportaba ventas por sorteo cuando un ticket apostaba en
// varios sorteos consecutivos (ej. virtuales multi-sorteo).
async function getPeriodStats(gameId, startDate, endDate) {
  const draws = await prisma.draw.findMany({
    where: { gameId, drawDate: { gte: startDate, lte: endDate }, status: 'DRAWN' },
    select: { id: true, winnerItemId: true, winnerItem: { select: { multiplier: true } } },
  });

  if (draws.length === 0) return { sales: 0, payouts: 0, profit: 0 };

  const drawIds = draws.map(d => d.id);
  const details = await prisma.ticketDetail.findMany({
    where: {
      drawId: { in: drawIds },
      ticket: { status: { not: 'CANCELLED' } }
    },
    select: { drawId: true, gameItemId: true, amount: true },
  });

  const byDraw = new Map();
  for (const detail of details) {
    let entry = byDraw.get(detail.drawId);
    if (!entry) {
      entry = { sales: 0, winnerSales: 0 };
      byDraw.set(detail.drawId, entry);
    }
    const amount = parseFloat(detail.amount);
    entry.sales += amount;
    // El gameItemId ganador se resuelve por draw abajo
    entry._winnerCheck = entry._winnerCheck || (id => false);
  }
  // Resolver winnerSales conociendo el winnerItemId por draw
  const winnerByDraw = new Map(draws.map(d => [d.id, d.winnerItemId]));
  for (const detail of details) {
    if (winnerByDraw.get(detail.drawId) === detail.gameItemId) {
      byDraw.get(detail.drawId).winnerSales += parseFloat(detail.amount);
    }
  }

  let sales = 0;
  let payouts = 0;
  for (const d of draws) {
    const entry = byDraw.get(d.id) || { sales: 0, winnerSales: 0 };
    sales += entry.sales;
    if (d.winnerItemId && d.winnerItem) {
      payouts += entry.winnerSales * parseFloat(d.winnerItem.multiplier || 30);
    }
  }
  return { sales, payouts, profit: sales - payouts };
}

export async function stepNotifyAdminsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId, imagePath, imageError } = job.data;
  logger.info(`[step-notify-admins] Notificando admins para draw ${drawId}`);

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true, winnerItem: true },
  });

  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  const now = new Date();
  // Atribución por TicketDetail.drawId. Antes usaba prisma.ticket.findMany({drawId})
  // que sólo encuentra tickets cuyo Ticket.drawId = drawId, perdiendo las jugadas
  // multi-sorteo de tickets anclados a otros draws.
  const details = await prisma.ticketDetail.findMany({
    where: {
      drawId,
      ticket: { status: { not: 'CANCELLED' } }
    },
    select: { amount: true, gameItemId: true },
  });
  const totalSales = details.reduce((sum, d) => sum + parseFloat(d.amount), 0);

  let winnerSales = 0;
  for (const d of details) {
    if (d.gameItemId === draw.winnerItemId) winnerSales += parseFloat(d.amount);
  }
  const multiplier = parseFloat(draw.winnerItem?.multiplier || 30);
  const totalPayout = winnerSales * multiplier;

  const daily = await getPeriodStats(draw.gameId, startOfDay(now), endOfDay(now));
  const weekly = await getPeriodStats(draw.gameId, startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
  const monthly = await getPeriodStats(draw.gameId, startOfMonth(now), endOfMonth(now));

  // Paso no-crítico: capturar error para no bloquear pipeline
  try {
    await adminNotificationService.notifyDrawResult({
      drawId: draw.id,
      game: draw.game,
      drawDate: draw.drawDate,
      drawTime: draw.drawTime,
      winnerItem: draw.winnerItem,
      totalSales,
      totalPayout,
      profit: totalSales - totalPayout,
      dailyStats: daily,
      weeklyStats: weekly,
      monthlyStats: monthly,
      imagePath: imagePath || null,
    });
    logger.info(`[step-notify-admins] Notificación enviada para draw ${drawId}`);
  } catch (err) {
    logger.error(`[step-notify-admins] Error notificando admins: ${err.message}`);
  }

  // Siempre encolar siguiente paso
  const boss = getBoss();
  await boss.send(QUEUES.STEP_PUBLISH_DRAW, { drawId }, {
    singletonKey: `pub-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.STEP_PUBLISH_DRAW],
  });

  return { success: true, drawId };
}
