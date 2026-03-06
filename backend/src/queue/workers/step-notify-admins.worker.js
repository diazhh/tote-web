import logger from '../../lib/logger.js';
import adminNotificationService from '../../services/admin-notification.service.js';
import { prisma } from '../../lib/prisma.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

async function getPeriodStats(gameId, startDate, endDate) {
  const draws = await prisma.draw.findMany({
    where: { gameId, drawDate: { gte: startDate, lte: endDate }, status: 'DRAWN' },
    include: { winnerItem: true, tickets: { include: { details: true } } },
  });

  let sales = 0;
  let payouts = 0;
  for (const d of draws) {
    const drawSales = d.tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
    sales += drawSales;
    if (d.winnerItemId && d.winnerItem) {
      let winnerSales = 0;
      d.tickets.forEach(t => t.details.forEach(det => {
        if (det.gameItemId === d.winnerItemId) winnerSales += parseFloat(det.amount);
      }));
      payouts += winnerSales * parseFloat(d.winnerItem.multiplier || 30);
    }
  }
  return { sales, payouts, profit: sales - payouts };
}

export async function stepNotifyAdminsWorker(job) {
  const { drawId, imagePath, imageError } = job.data;
  logger.info(`[step-notify-admins] Notificando admins para draw ${drawId}`);

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true, winnerItem: true },
  });

  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  const now = new Date();
  const tickets = await prisma.ticket.findMany({ where: { drawId }, include: { details: true } });
  const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);

  let winnerSales = 0;
  tickets.forEach(t => t.details.forEach(d => {
    if (d.gameItemId === draw.winnerItemId) winnerSales += parseFloat(d.amount);
  }));
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
