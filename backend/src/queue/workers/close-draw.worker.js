import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { emitToAll, emitToGame } from '../../lib/socket.js';
import apiIntegrationService from '../../services/api-integration.service.js';
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
    // Importar tickets SRQ
    let hasTickets = false;
    try {
      const importResult = await apiIntegrationService.importSRQTickets(draw.id);
      logger.info(`[close-draw] Importados: ${importResult.imported} tickets`);
      hasTickets = importResult.imported > 0;
    } catch (err) {
      logger.warn(`[close-draw] No se pudieron importar ventas: ${err.message}`);
    }

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
        logger.warn(`[close-draw] Error en selección inteligente, usando aleatoria: ${err.message}`);
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
    });
  } catch (err) {
    logger.warn(`[close-draw] Error notificando admin: ${err.message}`);
  }

  logger.info(`[close-draw] Sorteo ${drawId} cerrado correctamente (${selectionMethod})`);
  return { success: true, drawId, method: selectionMethod };
}
