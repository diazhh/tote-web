/**
 * close-and-ingest worker — processes ONE draw.
 *
 * Atomic close (updateMany WHERE status=SCHEDULED), then:
 *   - If admin already preselected: emit draw:closed + admin notify + DONE.
 *   - Else (normal path): emit draw:closing + 2 SRQ ingest passes + DONE.
 *
 * Does NOT run the optimizer — that's the preselect worker's job at xx:56.
 * Does NOT call Maxplay — sync-scrape-tickets (Croner) runs in parallel.
 */
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { emitToAll, emitToGame } from '../../lib/socket.js';
import apiIntegrationService from '../../services/api-integration.service.js';
import adminNotificationService from '../../services/admin-notification.service.js';
import systemConfigService from '../../services/system-config.service.js';
import drawPauseService from '../../services/draw-pause.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

async function closeTerminalDraw(draw) {
  const closed = await prisma.draw.updateMany({
    where: { id: draw.id, status: 'SCHEDULED' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  if (closed.count === 0) {
    return { skipped: 'already_closed_by_other' };
  }

  // Import terminal sales (best-effort)
  let imported = 0;
  try {
    const r = await apiIntegrationService.importSRQTickets(draw.id, { allowClosed: true });
    imported = r.imported || 0;
  } catch (e) {
    logger.warn(`[close-and-ingest:terminal] SRQ falló: ${e.message}`);
  }

  emitToAll('draw:closed', {
    drawId: draw.id,
    game: { name: draw.game.name, slug: draw.game.slug },
    drawDate: draw.drawDate,
    drawTime: draw.drawTime,
  });

  try {
    await adminNotificationService.notifyPrewinnerSelected({
      drawId: draw.id,
      game: draw.game,
      drawDate: draw.drawDate,
      drawTime: draw.drawTime,
      prewinnerItem: null,
      totalSales: 0,
      maxPayout: 0,
      potentialPayout: 0,
      salesByItem: null,
      tripletaRiskTop5: [],
      isTerminal: true,
      terminalTickets: imported,
    });
  } catch (e) {
    logger.warn(`[close-and-ingest:terminal] notify falló: ${e.message}`);
  }

  await prisma.auditLog.create({
    data: {
      action: 'DRAW_CLOSED',
      entity: 'Draw',
      entityId: draw.id,
      changes: { status: 'CLOSED', type: 'TERMINAL', terminalTickets: imported, source: 'close-and-ingest-worker' },
    },
  }).catch(() => { /* best-effort */ });

  logger.info(`🔒 [close-and-ingest] ${draw.game.name} - ${draw.drawTime} cerrado | Terminal | ${imported} tickets`);

  // Phase 11 (D-10): fire-and-forget phase-SALES trigger. Never blocks the close.
  try {
    const boss = getBoss();
    await boss.send(
      QUEUES.CALCULATE_DRAW_FINANCIALS,
      { drawId: draw.id, phase: 'SALES' },
      {
        singletonKey: `df-sales-${draw.id}`,
        ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
      },
    );
  } catch (e) {
    logger.warn(`[close-and-ingest] df-sales trigger falló (best-effort) drawId=${draw.id}: ${e.message}`);
  }

  return { closed: true, method: 'terminal', srqIngested: imported };
}

export async function closeAndIngestWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  if (await systemConfigService.isEmergencyStop()) {
    return { skipped: 'emergency_stop' };
  }

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: {
      game: { include: { items: { where: { isActive: true } } } },
      preselectedItem: true,
    },
  });
  if (!draw) {
    logger.warn(`[close-and-ingest] Draw ${drawId} no encontrado`);
    return { skipped: 'draw_not_found' };
  }

  if (draw.status !== 'SCHEDULED') {
    logger.info(`[close-and-ingest] Draw ${drawId} ya en estado ${draw.status}, saltando`);
    return { skipped: `status_is_${draw.status}` };
  }

  if (await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate)) {
    logger.warn(`[close-and-ingest] ⏸️ ${draw.game.name} ${draw.drawTime} OMITIDO: juego pausado`);
    return { skipped: 'game_paused' };
  }

  // TERMINAL: cascade from Triple handles the winner; we just close + import sales.
  if (draw.game.type === 'TERMINAL') {
    return closeTerminalDraw(draw);
  }

  // Atomic close — only proceed if still SCHEDULED.
  const closed = await prisma.draw.updateMany({
    where: { id: drawId, status: 'SCHEDULED' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  if (closed.count === 0) {
    logger.info(`[close-and-ingest] Draw ${drawId} ya cerrado por otro proceso`);
    return { skipped: 'already_closed_by_other' };
  }

  const updated = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true, preselectedItem: true },
  });

  await prisma.auditLog.create({
    data: {
      action: 'DRAW_CLOSED',
      entity: 'Draw',
      entityId: drawId,
      changes: {
        status: 'CLOSED',
        source: 'close-and-ingest-worker',
        adminPreselect: !!updated.preselectedItemId,
      },
    },
  }).catch(() => { /* best-effort */ });

  // Case A1: admin already preselected (set before our close ran).
  if (updated.preselectedItemId && updated.preselectedItem) {
    emitToAll('draw:closed', {
      drawId,
      game: { name: updated.game.name, slug: updated.game.slug },
      drawDate: updated.drawDate,
      drawTime: updated.drawTime,
      preselectedItem: { number: updated.preselectedItem.number, name: updated.preselectedItem.name },
    });
    emitToGame(updated.game.slug, 'draw:closed', {
      drawId,
      drawDate: updated.drawDate,
      drawTime: updated.drawTime,
      preselectedItem: { number: updated.preselectedItem.number, name: updated.preselectedItem.name },
    });

    try {
      await adminNotificationService.notifyPrewinnerSelected({
        drawId,
        game: updated.game,
        drawDate: updated.drawDate,
        drawTime: updated.drawTime,
        prewinnerItem: updated.preselectedItem,
        totalSales: 0,
        maxPayout: 0,
        potentialPayout: 0,
        salesByItem: null,
        tripletaRiskTop5: [],
      });
    } catch (e) {
      logger.warn(`[close-and-ingest] notify admin_preselect falló: ${e.message}`);
    }

    logger.info(`🔒 [close-and-ingest] ${updated.game.name} - ${updated.drawTime} cerrado | admin preselect: ${updated.preselectedItem.number}`);

    // Phase 11 (D-10): fire-and-forget phase-SALES trigger. Never blocks the close.
    try {
      const boss = getBoss();
      await boss.send(
        QUEUES.CALCULATE_DRAW_FINANCIALS,
        { drawId, phase: 'SALES' },
        {
          singletonKey: `df-sales-${drawId}`,
          ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
        },
      );
    } catch (e) {
      logger.warn(`[close-and-ingest] df-sales trigger falló (best-effort) drawId=${drawId}: ${e.message}`);
    }

    return { closed: true, method: 'admin_preselect' };
  }

  // Case A2: normal path — emit closing + 2 SRQ ingest passes.
  emitToAll('draw:closing', {
    drawId,
    game: { name: updated.game.name, slug: updated.game.slug },
    drawDate: updated.drawDate,
    drawTime: updated.drawTime,
  });
  emitToGame(updated.game.slug, 'draw:closing', {
    drawId,
    drawDate: updated.drawDate,
    drawTime: updated.drawTime,
  });

  let srq1 = 0, srq2 = 0;
  try {
    const r = await apiIntegrationService.importSRQTickets(drawId, { allowClosed: true });
    srq1 = r.imported || 0;
  } catch (e) {
    logger.warn(`[close-and-ingest] SRQ pasada 1 falló: ${e.message}`);
  }

  try {
    const r = await apiIntegrationService.importSRQTickets(drawId, { allowClosed: true });
    srq2 = r.imported || 0;
  } catch (e) {
    logger.warn(`[close-and-ingest] SRQ pasada 2 falló: ${e.message}`);
  }

  logger.info(`🔒 [close-and-ingest] ${updated.game.name} - ${updated.drawTime} cerrado | esperando preselect | SRQ ingest: ${srq1}+${srq2}`);

  // Phase 11 (D-10): fire-and-forget phase-SALES trigger. Never blocks the close.
  try {
    const boss = getBoss();
    await boss.send(
      QUEUES.CALCULATE_DRAW_FINANCIALS,
      { drawId, phase: 'SALES' },
      {
        singletonKey: `df-sales-${drawId}`,
        ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
      },
    );
  } catch (e) {
    logger.warn(`[close-and-ingest] df-sales trigger falló (best-effort) drawId=${drawId}: ${e.message}`);
  }

  return { closed: true, method: 'awaiting_preselect', srqIngested: srq1 + srq2 };
}
