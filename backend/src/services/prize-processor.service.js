import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class PrizeProcessorService {
  async processPrizesForDraw(drawId) {
    try {
      logger.info('Starting prize processing for draw', { drawId });

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

        if (draw.status !== 'DRAWN') {
          throw new Error('El sorteo debe estar en estado DRAWN para procesar premios');
        }

        if (!draw.winnerItemId) {
          throw new Error('El sorteo no tiene un número ganador definido');
        }

        // Obtener SOLO los detalles de tickets que pertenecen a este sorteo
        // Un ticket puede tener detalles de múltiples sorteos
        const ticketDetails = await tx.ticketDetail.findMany({
          where: {
            ticket: {
              drawId
            },
            status: 'ACTIVE'
          },
          include: {
            gameItem: true,
            ticket: {
              include: {
                user: true
              }
            }
          }
        });

        logger.info('Found ticket details to process', { 
          drawId, 
          detailCount: ticketDetails.length 
        });

        let totalPrizesAwarded = 0;
        const processedTickets = new Set();
        const winningTickets = new Set();

        // Procesar cada detalle individualmente
        for (const detail of ticketDetails) {
          const isWinner = detail.gameItemId === draw.winnerItemId;
          const prize = isWinner ? parseFloat(detail.amount) * parseFloat(detail.multiplier) : 0;
          
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
              multiplier: detail.multiplier,
              prize
            });
          }

          processedTickets.add(detail.ticketId);
        }

        // Actualizar cada ticket: recalcular su premio total y status
        for (const ticketId of processedTickets) {
          // Obtener todos los detalles del ticket (puede tener detalles de otros sorteos)
          const allDetails = await tx.ticketDetail.findMany({
            where: { ticketId }
          });

          // Calcular premio total del ticket (suma de todos sus detalles)
          const ticketTotalPrize = allDetails.reduce((sum, d) => sum + parseFloat(d.prize || 0), 0);
          
          // Determinar status del ticket:
          // - Si tiene algún detalle ganador -> WON
          // - Si todos los detalles están procesados (no ACTIVE) y ninguno ganó -> LOST
          // - Si aún tiene detalles ACTIVE -> ACTIVE (sigue participando en otros sorteos)
          const hasWinningDetail = allDetails.some(d => d.status === 'WON');
          const hasActiveDetail = allDetails.some(d => d.status === 'ACTIVE');
          
          let ticketStatus;
          if (hasWinningDetail) {
            ticketStatus = 'WON';
          } else if (hasActiveDetail) {
            ticketStatus = 'ACTIVE'; // Sigue participando en otros sorteos
          } else {
            ticketStatus = 'LOST'; // Todos los detalles procesados y ninguno ganó
          }

          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              status: ticketStatus,
              totalPrize: ticketTotalPrize
            }
          });

          // Si el ticket ganó en ESTE sorteo, acreditar premio al usuario
          if (winningTickets.has(ticketId)) {
            const ticket = await tx.ticket.findUnique({
              where: { id: ticketId },
              include: { user: true }
            });

            // Calcular premio de ESTE sorteo específicamente
            const thisDrawPrize = ticketDetails
              .filter(d => d.ticketId === ticketId && d.gameItemId === draw.winnerItemId)
              .reduce((sum, d) => sum + parseFloat(d.amount) * parseFloat(d.multiplier), 0);

            // Solo acreditar balance si el ticket tiene usuario (TAQUILLA_ONLINE)
            // Los tickets externos (EXTERNAL_API) no tienen usuario
            if (ticket.userId) {
              await tx.user.update({
                where: { id: ticket.userId },
                data: {
                  balance: {
                    increment: thisDrawPrize
                  }
                }
              });

              logger.info('Prize awarded to user', {
                userId: ticket.userId,
                username: ticket.user.username,
                ticketId: ticket.id,
                prize: thisDrawPrize
              });
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
        const losersCount = processedTickets.size - winnersCount;

        await tx.draw.update({
          where: { id: drawId },
          data: {
            status: 'COMPLETED'
          }
        });

        const summary = {
          drawId,
          gameName: draw.game.name,
          winnerNumber: draw.winnerItem.number,
          totalTickets: tickets.length,
          winnersCount,
          losersCount,
          totalPrizesAwarded,
          processedAt: new Date()
        };

        logger.info('Prize processing completed', summary);

        return summary;
      });
    } catch (error) {
      logger.error('Error processing prizes:', error);
      throw error;
    }
  }

  async getPrizesSummary(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      const tickets = await prisma.ticket.findMany({
        where: { drawId },
        include: {
          details: {
            where: { status: 'WON' }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
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
