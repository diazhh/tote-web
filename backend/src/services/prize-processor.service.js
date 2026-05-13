import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import playerNotificationService from './player-notification.service.js';

class PrizeProcessorService {
  /**
   * Process prizes for a draw.
   * @param {string} drawId
   * @param {Object} [opts]
   * @param {boolean} [opts.skipStatusCheck=false]  - Allow PUBLISHED status (for reprocessing)
   * @param {boolean} [opts.skipBalanceUpdate=false] - Skip crediting user.balance (for reprocessing)
   */
  async processPrizesForDraw(drawId, opts = {}) {
    const { skipStatusCheck = false, skipBalanceUpdate = false } = opts;
    try {
      logger.info('Starting prize processing for draw', { drawId, opts });

      return await prisma.$transaction(async (tx) => {
        const draw = await tx.draw.findUnique({
          where: { id: drawId },
          include: {
            game: true,
            winnerItem: true
          }
        });

        if (!draw) {
          throw new Error('Sorteo no encontrado');
        }

        if (!skipStatusCheck && draw.status !== 'DRAWN') {
          throw new Error('El sorteo debe estar en estado DRAWN para procesar premios');
        }

        if (!draw.winnerItemId) {
          throw new Error('El sorteo no tiene un número ganador definido');
        }

        // ── Aproximación config ────────────────────────────────────────────
        const aproxCfg = (draw.game.config || {}).aproximacion;
        const hasAprox = aproxCfg?.enabled === true;
        const aproxMultiplier = hasAprox ? parseFloat(aproxCfg.multiplier) : 0;
        const neighborIds = new Set();

        if (hasAprox && draw.winnerItem) {
          const winNum = parseInt(draw.winnerItem.number, 10);
          const max    = 999;
          const n1Str  = String(winNum === 0 ? max : winNum - 1).padStart(3, '0');
          const n2Str  = String(winNum === max ? 0 : winNum + 1).padStart(3, '0');
          const neighbors = await tx.gameItem.findMany({
            where: { gameId: draw.game.id, number: { in: [n1Str, n2Str] } },
            select: { id: true },
          });
          neighbors.forEach(n => neighborIds.add(n.id));
        }
        // ──────────────────────────────────────────────────────────────────

        // Obtener SOLO los detalles que pertenecen a este sorteo.
        //
        // Solo el adapter de virtuales (WEBHOOK_PUSH) popula TicketDetail.drawId
        // — su flujo multi-play permite que un mismo ticket tenga details en
        // distintos sorteos, por lo que el detail necesita su propio drawId.
        // Los demás flujos (TAQUILLA_ONLINE, EXTERNAL_API, EXTERNAL_SCRAPE)
        // dejan TicketDetail.drawId en NULL porque todos los details de un
        // ticket comparten el Ticket.drawId.
        //
        // Por eso: si td.drawId está set, debe coincidir con `drawId` (filtro
        // multi-play); si td.drawId es NULL, fallback a comparar ticket.drawId.
        //
        // EXCLUIR tickets de tripleta externa (se verifican con lógica especial)
        const allTicketDetails = await tx.ticketDetail.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { drawId },
              { drawId: null, ticket: { drawId } },
            ],
          },
          include: {
            gameItem: true,
            ticket: { include: { user: true } }
          }
        });

        // Filtrar en código: excluir solo tripletas externas
        const ticketDetails = allTicketDetails.filter(detail => {
          const ticket = detail.ticket;
          if (ticket.source === 'EXTERNAL_API' &&
              ticket.providerData &&
              ticket.providerData.type === 'TRIPLETA') {
            return false;
          }
          return true;
        });

        logger.info('Found ticket details to process', {
          drawId,
          detailCount: ticketDetails.length
        });

        let totalPrizesAwarded = 0;
        const processedTickets = new Set();
        const winningTickets = new Set();

        for (const detail of ticketDetails) {
          const isExact = detail.gameItemId === draw.winnerItemId;
          const isAprox = hasAprox && neighborIds.has(detail.gameItemId);
          const isWinner = isExact || isAprox;

          let prize = 0;
          if (isExact) {
            prize = parseFloat(detail.amount) * parseFloat(detail.multiplier);
          } else if (isAprox) {
            prize = parseFloat(detail.amount) * aproxMultiplier;
          }

          await tx.ticketDetail.update({
            where: { id: detail.id },
            data: {
              status: isWinner ? 'WON' : 'LOST',
              prize
            }
          });

          if (isWinner) {
            totalPrizesAwarded += prize;
            winningTickets.add(detail.ticketId);

            logger.info('Winning detail found', {
              ticketId: detail.ticketId,
              detailId: detail.id,
              gameItemNumber: detail.gameItem.number,
              amount: detail.amount,
              prize,
              type: isExact ? 'exact' : 'aproximacion',
            });
          }

          processedTickets.add(detail.ticketId);
        }

        // Actualizar cada ticket: recalcular su premio total y status
        for (const ticketId of processedTickets) {
          const allDetails = await tx.ticketDetail.findMany({
            where: { ticketId }
          });

          const ticketTotalPrize = allDetails.reduce((sum, d) => sum + parseFloat(d.prize || 0), 0);

          const hasWinningDetail = allDetails.some(d => d.status === 'WON');
          const hasActiveDetail  = allDetails.some(d => d.status === 'ACTIVE');

          let ticketStatus;
          if (hasWinningDetail) {
            ticketStatus = 'WON';
          } else if (hasActiveDetail) {
            ticketStatus = 'ACTIVE';
          } else {
            ticketStatus = 'LOST';
          }

          await tx.ticket.update({
            where: { id: ticketId },
            data: { status: ticketStatus, totalPrize: ticketTotalPrize }
          });

          if (!skipBalanceUpdate && winningTickets.has(ticketId)) {
            const ticket = await tx.ticket.findUnique({
              where: { id: ticketId },
              include: { user: true }
            });

            // Prize for THIS draw (exact + aproximación)
            const thisDrawPrize = ticketDetails
              .filter(d => d.ticketId === ticketId &&
                (d.gameItemId === draw.winnerItemId || neighborIds.has(d.gameItemId)))
              .reduce((sum, d) => {
                if (d.gameItemId === draw.winnerItemId) {
                  return sum + parseFloat(d.amount) * parseFloat(d.multiplier);
                }
                return sum + parseFloat(d.amount) * aproxMultiplier;
              }, 0);

            if (ticket.userId) {
              await tx.user.update({
                where: { id: ticket.userId },
                data: { balance: { increment: thisDrawPrize } }
              });

              logger.info('Prize awarded to user', {
                userId: ticket.userId,
                username: ticket.user.username,
                ticketId: ticket.id,
                prize: thisDrawPrize
              });

              playerNotificationService.notifyPrizeWon(ticket.userId, thisDrawPrize, draw);
            } else {
              logger.info('Prize calculated for external ticket', {
                ticketId: ticket.id,
                source: ticket.source,
                prize: thisDrawPrize
              });
            }
          }
        }

        const winnersCount = winningTickets.size;
        const losersCount  = processedTickets.size - winnersCount;

        const summary = {
          drawId,
          gameName: draw.game.name,
          winnerNumber: draw.winnerItem.number,
          totalTickets: processedTickets.size,
          winnersCount,
          losersCount,
          totalPrizesAwarded,
          processedAt: new Date()
        };

        logger.info('Prize processing completed', summary);
        return summary;
      }, { timeout: 30000 });
    } catch (error) {
      logger.error('Error processing prizes:', error);
      throw error;
    }
  }

  async getPrizesSummary(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: { game: true, winnerItem: true }
      });

      if (!draw) throw new Error('Sorteo no encontrado');

      const tickets = await prisma.ticket.findMany({
        where: { drawId },
        include: {
          details: { where: { status: 'WON' } },
          user: { select: { id: true, username: true, email: true } }
        }
      });

      const winners = tickets
        .filter(t => t.status === 'WON')
        .map(t => ({
          ticketId: t.id,
          user: t.user,
          totalPrize: parseFloat(t.totalPrize),
          createdAt: t.createdAt
        }));

      const totalPrizesAwarded = winners.reduce((sum, w) => sum + w.totalPrize, 0);

      return {
        drawId,
        gameName: draw.game.name,
        winnerNumber: draw.winnerItem?.number,
        status: draw.status,
        totalTickets: tickets.length,
        winnersCount: winners.length,
        losersCount: tickets.length - winners.length,
        totalPrizesAwarded,
        winners
      };
    } catch (error) {
      logger.error('Error getting prizes summary:', error);
      throw error;
    }
  }
}

export default new PrizeProcessorService();
