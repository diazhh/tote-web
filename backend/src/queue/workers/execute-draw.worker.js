import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { emitToAll, emitToGame } from '../../lib/socket.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import systemConfigService from '../../services/system-config.service.js';
import drawPauseService from '../../services/draw-pause.service.js';
import { cascadeTerminalDraws } from '../../services/draw-cascade.service.js';

export async function executeDrawWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true, preselectedItem: true },
  });

  if (!draw) {
    logger.warn(`[execute-draw] Draw ${drawId} no encontrado`);
    return { skipped: true, reason: 'not_found' };
  }

  if (draw.status !== 'CLOSED') {
    logger.info(`[execute-draw] Draw ${drawId} en estado ${draw.status}, saltando`);
    return { skipped: true, reason: 'invalid_state', currentStatus: draw.status };
  }

  // Verificar parada de emergencia
  const isEmergencyStop = await systemConfigService.isEmergencyStop();
  if (isEmergencyStop) {
    logger.warn(`[execute-draw] 🚨 Draw ${drawId} NO EJECUTADO: parada de emergencia activa`);
    return { skipped: true, reason: 'emergency_stop' };
  }

  // Verificar pausa programada del juego
  const isPaused = await drawPauseService.isGamePausedOnDate(draw.gameId, draw.drawDate);
  if (isPaused) {
    logger.warn(`[execute-draw] ⏸️ Draw ${drawId} (${draw.game.name}) NO EJECUTADO: juego pausado`);
    return { skipped: true, reason: 'game_paused' };
  }

  if (!draw.preselectedItemId) {
    throw new Error(`Draw ${drawId} no tiene número preseleccionado`);
  }

  // Marcar como DRAWN e iniciar pipeline
  const updatedDraw = await prisma.draw.update({
    where: { id: drawId },
    data: {
      status: 'DRAWN',
      winnerItemId: draw.preselectedItemId,
      drawnAt: new Date(),
      pipelineJobId: job.id,
      pipelineStatus: 'IN_PROGRESS',
    },
    include: { game: true, winnerItem: true },
  });

  // Emitir evento WebSocket
  emitToAll('draw:executed', {
    drawId: updatedDraw.id,
    game: { name: updatedDraw.game.name, slug: updatedDraw.game.slug },
    drawDate: updatedDraw.drawDate,
    drawTime: updatedDraw.drawTime,
    winnerItem: { number: updatedDraw.winnerItem.number, name: updatedDraw.winnerItem.name },
  });
  emitToGame(updatedDraw.game.slug, 'draw:executed', {
    drawId: updatedDraw.id,
    drawDate: updatedDraw.drawDate,
    drawTime: updatedDraw.drawTime,
    winnerItem: { number: updatedDraw.winnerItem.number, name: updatedDraw.winnerItem.name },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'DRAW_EXECUTED',
      entity: 'Draw',
      entityId: drawId,
      changes: {
        status: 'DRAWN',
        winnerItemId: draw.preselectedItemId,
        winnerNumber: updatedDraw.winnerItem.number,
        winnerName: updatedDraw.winnerItem.name,
      },
    },
  });

  // Encolar primer paso del pipeline
  const boss = getBoss();
  await boss.send(QUEUES.STEP_GENERATE_IMAGE, { drawId }, {
    singletonKey: `img-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.STEP_GENERATE_IMAGE],
  });

  // Cascada TERMINAL: si este Triple tiene un Terminal vinculado, derivar
  // winnerItemId de los últimos 2 dígitos y ejecutar inline (premios +
  // notify + stats). Idempotente. No bloquea si falla — Terminal queda
  // CLOSED y se recupera en el siguiente tick por recoverOrphan*.
  try {
    const cascade = await cascadeTerminalDraws(updatedDraw);
    if (cascade.cascaded > 0) {
      logger.info(`[execute-draw] Draw ${drawId} — cascada Terminal: ${cascade.cascaded} draw(s) actualizados`);
    }
  } catch (err) {
    logger.error(`[execute-draw] Cascada Terminal falló para ${drawId}: ${err.message}`);
  }

  logger.info(`[execute-draw] Draw ${drawId} — pipeline iniciado, step-generate-image encolado`);
  return { success: true, drawId, pipelineStarted: true };
}
