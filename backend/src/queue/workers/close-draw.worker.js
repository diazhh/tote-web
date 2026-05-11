import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { emitToAll, emitToGame } from '../../lib/socket.js';
import apiIntegrationService from '../../services/api-integration.service.js';
import maxplayService from '../../services/maxplay.service.js';
import adminNotificationService from '../../services/admin-notification.service.js';
import prewinnerSelectionService from '../../services/prewinner-selection.service.js';
import pdfReportService from '../../services/pdf-report.service.js';
import systemConfigService from '../../services/system-config.service.js';
import drawPauseService from '../../services/draw-pause.service.js';
import { startOfDay } from 'date-fns';

async function getUsedItemsToday(gameId, referenceDate) {
  const drawsToday = await prisma.draw.findMany({
    where: {
      gameId,
      drawDate: referenceDate,
      OR: [
        { preselectedItemId: { not: null } },
        { winnerItemId: { not: null } },
      ],
    },
    select: { preselectedItemId: true, winnerItemId: true },
  });

  const usedItems = new Set();
  for (const d of drawsToday) {
    if (d.preselectedItemId) usedItems.add(d.preselectedItemId);
    if (d.winnerItemId) usedItems.add(d.winnerItemId);
  }
  return usedItems;
}

export async function closeDrawWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // 1. Optimistic locking: solo actualiza si sigue en SCHEDULED
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: {
      game: { include: { items: { where: { isActive: true } } } },
      preselectedItem: true,
    },
  });

  if (!draw) {
    logger.warn(`[close-draw] Draw ${drawId} no encontrado`);
    return { skipped: true, reason: 'not_found' };
  }

  if (draw.status !== 'SCHEDULED') {
    logger.info(`[close-draw] Draw ${drawId} ya en estado ${draw.status}, saltando`);
    return { skipped: true, reason: 'already_processed', currentStatus: draw.status };
  }

  // Verificar parada de emergencia
  const isEmergencyStop = await systemConfigService.isEmergencyStop();
  if (isEmergencyStop) {
    logger.warn(`[close-draw] 🚨 Draw ${drawId} OMITIDO: parada de emergencia activa`);
    return { skipped: true, reason: 'emergency_stop' };
  }

  // Verificar pausa programada del juego
  const isPaused = await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate);
  if (isPaused) {
    logger.warn(`[close-draw] ⏸️ Draw ${drawId} (${draw.game.name}) OMITIDO: juego pausado`);
    return { skipped: true, reason: 'game_paused' };
  }

  const items = draw.game.items;
  if (items.length === 0) {
    throw new Error(`No hay items activos para el juego ${draw.game.name}`);
  }

  let selectedItem;
  let pdfPath = null;
  let selectionMethod = 'random';

  // Per-source ingestion status — passed to Telegram notification so admins can see
  // which providers contributed (or failed) for this draw.
  const sourceStatus = {
    srq:     { ok: false, imported: 0, reason: null },
    maxplay: { ok: false, imported: 0, reason: null },
  };

  // 2. Respetar pre-ganador manual del admin
  if (draw.preselectedItemId) {
    selectedItem = items.find(i => i.id === draw.preselectedItemId);
    if (selectedItem) {
      selectionMethod = 'admin';
      logger.info(`[close-draw] Pre-ganador admin: ${selectedItem.number} - ${selectedItem.name}`);
    }
  }

  // 3. Selección automática si no hay pre-ganador de admin
  if (!selectedItem) {
    // Importar tickets — SRQ + Maxplay en paralelo. Falla aislada por fuente.
    const [srqResult, maxplayResult] = await Promise.allSettled([
      apiIntegrationService.importSRQTickets(draw.id),
      maxplayService.importMaxplayTickets(draw.id),
    ]);

    if (srqResult.status === 'fulfilled') {
      sourceStatus.srq.ok = true;
      sourceStatus.srq.imported = srqResult.value?.imported || 0;
      logger.info(`[close-draw] SRQ importados: ${sourceStatus.srq.imported}`);
    } else {
      sourceStatus.srq.reason = srqResult.reason?.message || String(srqResult.reason);
      logger.warn(`[close-draw] No se pudieron importar SRQ: ${sourceStatus.srq.reason}`);
    }

    if (maxplayResult.status === 'fulfilled' && maxplayResult.value?.ok) {
      sourceStatus.maxplay.ok = true;
      sourceStatus.maxplay.imported = maxplayResult.value.imported || 0;
      sourceStatus.maxplay.reason = maxplayResult.value.reason || null; // e.g. 'maxplay_disabled'
      logger.info(`[close-draw] Maxplay importados: ${sourceStatus.maxplay.imported} (${sourceStatus.maxplay.reason || 'ok'})`);
    } else {
      const errMsg = maxplayResult.status === 'rejected'
        ? (maxplayResult.reason?.message || String(maxplayResult.reason))
        : (maxplayResult.value?.reason || 'unknown_error');
      sourceStatus.maxplay.reason = errMsg;
      logger.warn(`[close-draw] No se pudo traer Maxplay: ${errMsg}`);
    }

    // hasTickets debe basarse en conteo REAL de DB, no solo en imports de
    // este call. Tickets pueden venir de syncs previos (Maxplay scrape T-5min,
    // webhooks, online). Sin esto caemos a aleatoria aunque sí haya datos.
    const ticketCount = await prisma.ticket.count({
      where: { drawId: draw.id, status: { not: 'CANCELLED' } }
    });
    const hasTickets = ticketCount > 0;
    logger.info(`[close-draw] Tickets en DB: ${ticketCount} → ${hasTickets ? 'optimizer' : 'aleatoria'}`);

    // Selección inteligente si hay tickets
    if (hasTickets) {
      try {
        selectedItem = await prewinnerSelectionService.selectPrewinner(draw.id);
        if (selectedItem) {
          selectionMethod = 'intelligent';
          const updatedDraw = await prisma.draw.findUnique({
            where: { id: draw.id },
            include: { game: true, preselectedItem: true },
          });
          emitToAll('draw:closed', {
            drawId: updatedDraw.id,
            game: { name: updatedDraw.game.name, slug: updatedDraw.game.slug },
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            preselectedItem: { number: selectedItem.number, name: selectedItem.name },
          });
          emitToGame(updatedDraw.game.slug, 'draw:closed', {
            drawId: updatedDraw.id,
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            preselectedItem: { number: selectedItem.number, name: selectedItem.name },
          });
          logger.info(`[close-draw] Cerrado con selección inteligente: ${selectedItem.number}`);
          return { success: true, drawId, method: 'intelligent' };
        }
      } catch (err) {
        logger.warn(`[close-draw] Error en selección inteligente: ${err.message}`);

        // DEFENSIVO: el optimizer pudo haber persistido antes del error.
        // Si ya quedó persistido, respetar y NO sobreescribir con aleatorio.
        // Causa del incidente 2026-05-11 (TRIPLE PANTERA 08:00 → 100, -153K).
        const current = await prisma.draw.findUnique({
          where: { id: draw.id },
          select: { status: true, preselectedItemId: true, preselectedItem: true, game: true, drawDate: true, drawTime: true }
        });
        if (current?.status === 'CLOSED' && current.preselectedItemId) {
          logger.info(
            `[close-draw] Optimizer ya persistió ${current.preselectedItem.number} ` +
            `antes del error — respetando selección inteligente`
          );
          emitToAll('draw:closed', {
            drawId: draw.id,
            game: { name: draw.game.name, slug: draw.game.slug },
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            preselectedItem: { number: current.preselectedItem.number, name: current.preselectedItem.name },
          });
          emitToGame(draw.game.slug, 'draw:closed', {
            drawId: draw.id,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            preselectedItem: { number: current.preselectedItem.number, name: current.preselectedItem.name },
          });
          return { success: true, drawId, method: 'intelligent_recovered' };
        }
        logger.warn(`[close-draw] cayendo a selección aleatoria`);
      }
    }

    // Selección aleatoria (fallback)
    const usedItemsToday = await getUsedItemsToday(draw.gameId, draw.drawDate);
    let available = items.filter(i => !usedItemsToday.has(i.id));
    if (available.length === 0) available = items;
    selectedItem = available[Math.floor(Math.random() * available.length)];
    selectionMethod = 'random';
  }

  // 4. Actualizar sorteo con optimistic locking
  const result = await prisma.draw.updateMany({
    where: { id: draw.id, status: 'SCHEDULED' },
    data: { status: 'CLOSED', preselectedItemId: selectedItem.id, closedAt: new Date() },
  });

  if (result.count === 0) {
    logger.info(`[close-draw] Draw ${drawId} fue cerrado por otro proceso, saltando`);
    return { skipped: true, reason: 'race_condition' };
  }

  const updatedDraw = await prisma.draw.findUnique({
    where: { id: draw.id },
    include: { game: true, preselectedItem: true },
  });

  // 5. WebSocket
  emitToAll('draw:closed', {
    drawId: updatedDraw.id,
    game: { name: updatedDraw.game.name, slug: updatedDraw.game.slug },
    drawDate: updatedDraw.drawDate,
    drawTime: updatedDraw.drawTime,
    preselectedItem: { number: selectedItem.number, name: selectedItem.name },
  });
  emitToGame(updatedDraw.game.slug, 'draw:closed', {
    drawId: updatedDraw.id,
    drawDate: updatedDraw.drawDate,
    drawTime: updatedDraw.drawTime,
    preselectedItem: { number: selectedItem.number, name: selectedItem.name },
  });

  // 6. Audit log
  await prisma.auditLog.create({
    data: {
      action: 'DRAW_CLOSED',
      entity: 'Draw',
      entityId: draw.id,
      changes: {
        status: 'CLOSED',
        preselectedItemId: selectedItem.id,
        preselectedNumber: selectedItem.number,
        preselectedName: selectedItem.name,
        method: selectionMethod,
      },
    },
  });

  // 7. PDF de cierre
  try {
    pdfPath = await pdfReportService.generateDrawClosingReport({
      drawId: draw.id,
      game: updatedDraw.game,
      drawDate: updatedDraw.drawDate,
      drawTime: updatedDraw.drawTime,
      prewinnerItem: selectedItem,
      totalSales: 0,
      maxPayout: 0,
      potentialPayout: 0,
      allItems: items,
      salesByItem: {},
      candidates: [],
    });
    logger.info(`[close-draw] PDF: ${pdfPath}`);
  } catch (err) {
    logger.warn(`[close-draw] Error generando PDF: ${err.message}`);
  }

  // 8. Tripleta risk top 5
  let tripletaRiskTop5 = [];
  try {
    tripletaRiskTop5 = await prewinnerSelectionService.calculateTripletaRiskTop5(draw.gameId, draw.id);
  } catch (err) {
    logger.warn(`[close-draw] Error calculando riesgo tripletas: ${err.message}`);
  }

  // 9. Notificación admin
  try {
    await adminNotificationService.notifyPrewinnerSelected({
      drawId: updatedDraw.id,
      game: updatedDraw.game,
      drawDate: updatedDraw.drawDate,
      drawTime: updatedDraw.drawTime,
      prewinnerItem: updatedDraw.preselectedItem,
      totalSales: 0,
      maxPayout: 0,
      potentialPayout: 0,
      salesByItem: null,
      pdfPath,
      tripletaRiskTop5,
      sourceStatus,
    });
  } catch (err) {
    logger.warn(`[close-draw] Error notificando admin: ${err.message}`);
  }

  logger.info(`[close-draw] Sorteo ${drawId} cerrado correctamente (${selectionMethod})`);
  return { success: true, drawId, method: selectionMethod };
}
