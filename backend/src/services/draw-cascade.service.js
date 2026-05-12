/**
 * draw-cascade.service.js — derivación TRIPLE → TERMINAL.
 *
 * Reglas de negocio:
 *  - Cuando un sorteo Triple (3 dígitos, ej. "028") se ejecuta, su sorteo
 *    Terminal vinculado (mismo `linkedGameId`, type='TERMINAL', misma
 *    fecha/hora) debe quedar con winnerItemId = item cuyo number = últimos
 *    2 dígitos del Triple (ej. "28").
 *  - El Terminal NO se preselecciona — siempre deriva.
 *  - El optimizer del Triple ya cuenta `terminalPayout` con esta lógica
 *    en `prewinner-optimizer.service.js:432` (calculateTerminalPayout).
 *
 * Esta función reemplaza la `cascadeTerminalDraws` que vivía en el Croner
 * legacy `jobs/execute-draw.job.js`. La migración 2026-05-12 al patrón
 * pg-boss + cron Linux la perdió y eso causó el primer mismatch detectado
 * a las 08:00 VE (Triple=028 pero Terminal=77 por preselect desde SRQ sync).
 *
 * Ejecuta inline:
 *   1) Update Draw a DRAWN con winnerItemId derivado.
 *   2) Emite Socket.io draw:executed.
 *   3) Procesa premios (prizeProcessorService).
 *   4) Notifica admin Telegram.
 *   5) Calcula stats.
 *
 * Idempotente — si el TERMINAL ya está DRAWN con el winner correcto, no
 * hace nada y devuelve { skipped: 'already_drawn' }.
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import prizeProcessorService from './prize-processor.service.js';
import adminNotificationService from './admin-notification.service.js';
import drawStatsService from './draw-stats.service.js';

/**
 * @param {object} tripleDraw - sorteo Triple ya DRAWN, con game + winnerItem incluidos.
 * @returns {Promise<{cascaded: number, results: Array}>}
 */
export async function cascadeTerminalDraws(tripleDraw) {
  if (!tripleDraw?.winnerItem?.number) {
    return { cascaded: 0, results: [], reason: 'triple_no_winner' };
  }

  const terminalGames = await prisma.game.findMany({
    where: { linkedGameId: tripleDraw.gameId, type: 'TERMINAL', isActive: true },
  });

  if (terminalGames.length === 0) {
    return { cascaded: 0, results: [], reason: 'no_terminal_games' };
  }

  const tripleWinnerNumber = tripleDraw.winnerItem.number;        // "028"
  const terminalNumber = tripleWinnerNumber.slice(-2);            // "28"

  const results = [];

  for (const terminalGame of terminalGames) {
    const terminalDraw = await prisma.draw.findFirst({
      where: {
        gameId: terminalGame.id,
        drawDate: tripleDraw.drawDate,
        drawTime: tripleDraw.drawTime,
        status: { in: ['SCHEDULED', 'CLOSED', 'DRAWN'] },
      },
    });

    if (!terminalDraw) {
      logger.warn(`[cascade] No se encontró sorteo Terminal para ${terminalGame.name} ${tripleDraw.drawTime}`);
      results.push({ terminalGameId: terminalGame.id, skipped: 'not_found' });
      continue;
    }

    const winnerItem = await prisma.gameItem.findUnique({
      where: { gameId_number: { gameId: terminalGame.id, number: terminalNumber } },
    });

    if (!winnerItem) {
      logger.error(`[cascade] GameItem ${terminalNumber} no encontrado para ${terminalGame.name}`);
      results.push({ terminalGameId: terminalGame.id, skipped: 'item_not_found' });
      continue;
    }

    // Idempotencia: si ya está DRAWN con el winner correcto, salir.
    if (terminalDraw.status === 'DRAWN' && terminalDraw.winnerItemId === winnerItem.id) {
      logger.info(`[cascade] ${terminalGame.name} ${tripleDraw.drawTime} ya DRAWN con winner ${terminalNumber} — skip`);
      results.push({ terminalDrawId: terminalDraw.id, skipped: 'already_drawn_correct' });
      continue;
    }

    const updatedTerminal = await prisma.draw.update({
      where: { id: terminalDraw.id },
      data: {
        status: 'DRAWN',
        preselectedItemId: winnerItem.id,
        winnerItemId: winnerItem.id,
        closedAt: terminalDraw.closedAt ?? new Date(),
        drawnAt: new Date(),
        pipelineStatus: 'IN_PROGRESS',
      },
      include: { game: true, winnerItem: true },
    });

    logger.info(
      `🎰 [cascade] Terminal ejecutado: ${terminalGame.name} - ${tripleDraw.drawTime} | ` +
      `Ganador: ${terminalNumber} (de Triple ${tripleWinnerNumber})`
    );

    // Socket.io
    emitToAll('draw:executed', {
      drawId: updatedTerminal.id,
      game: { name: updatedTerminal.game.name, slug: updatedTerminal.game.slug },
      drawDate: updatedTerminal.drawDate,
      drawTime: updatedTerminal.drawTime,
      winnerItem: { number: updatedTerminal.winnerItem.number, name: updatedTerminal.winnerItem.name },
    });
    emitToGame(updatedTerminal.game.slug, 'draw:executed', {
      drawId: updatedTerminal.id,
      drawDate: updatedTerminal.drawDate,
      drawTime: updatedTerminal.drawTime,
      winnerItem: { number: updatedTerminal.winnerItem.number, name: updatedTerminal.winnerItem.name },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'DRAW_EXECUTED',
        entity: 'Draw',
        entityId: updatedTerminal.id,
        changes: {
          status: 'DRAWN',
          winnerItemId: winnerItem.id,
          winnerNumber: terminalNumber,
          sourceTripleDrawId: tripleDraw.id,
          sourceTripleNumber: tripleWinnerNumber,
          source: 'draw-cascade.service',
        },
      },
    }).catch(() => { /* best-effort */ });

    // Premios
    let prizes = null;
    try {
      prizes = await prizeProcessorService.processPrizesForDraw(updatedTerminal.id);
      logger.info(
        `💰 [cascade] Premios Terminal: ${prizes.winnersCount} ganadores, ` +
        `$${prizes.totalPrizesAwarded.toFixed(2)} en premios`
      );
    } catch (err) {
      logger.error(`[cascade] Error premios Terminal ${updatedTerminal.id}: ${err.message}`);
    }

    // Notify admin (sin imagen, Terminal no tiene plantilla)
    try {
      const tickets = await prisma.ticket.findMany({
        where: { drawId: updatedTerminal.id },
        include: { details: true },
      });
      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
      let winnerSales = 0;
      tickets.forEach((ticket) => {
        ticket.details.forEach((d) => {
          if (d.gameItemId === updatedTerminal.winnerItemId) {
            winnerSales += parseFloat(d.amount);
          }
        });
      });
      const multiplier = parseFloat(updatedTerminal.winnerItem?.multiplier || 30);
      const totalPayout = winnerSales * multiplier;
      const profit = totalSales - totalPayout;

      await adminNotificationService.notifyDrawResult({
        drawId: updatedTerminal.id,
        game: updatedTerminal.game,
        drawDate: updatedTerminal.drawDate,
        drawTime: updatedTerminal.drawTime,
        winnerItem: updatedTerminal.winnerItem,
        totalSales,
        totalPayout,
        profit,
        isTerminal: true,
        sourceTripleNumber: tripleWinnerNumber,
      });
    } catch (err) {
      logger.error(`[cascade] Error notificando Terminal ${updatedTerminal.id}: ${err.message}`);
    }

    // Stats
    try {
      await drawStatsService.calculateAllStats(updatedTerminal.id);
    } catch (err) {
      logger.error(`[cascade] Error stats Terminal ${updatedTerminal.id}: ${err.message}`);
    }

    // Mark pipeline complete (Terminal has no image/social pipeline)
    await prisma.draw.update({
      where: { id: updatedTerminal.id },
      data: { pipelineStatus: 'COMPLETED' },
    }).catch(() => { /* best-effort */ });

    results.push({
      terminalDrawId: updatedTerminal.id,
      terminalNumber,
      prizes: prizes ? { winnersCount: prizes.winnersCount, totalPrizesAwarded: prizes.totalPrizesAwarded } : null,
    });
  }

  return { cascaded: results.filter((r) => r.terminalDrawId).length, results };
}

export default { cascadeTerminalDraws };
