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

        const tickets = await tx.ticket.findMany({
          where: {
            drawId,
            status: 'ACTIVE'
          },
          include: {
            details: {
              include: {
                gameItem: true
              }
            },
            user: true
          }
        });

        logger.info('Found tickets to process', { 
          drawId, 
          ticketCount: tickets.length 
        });

        let totalPrizesAwarded = 0;
        let winnersCount = 0;
        let losersCount = 0;

        for (const ticket of tickets) {
          let ticketTotalPrize = 0;
          let hasWinningDetail = false;

          for (const detail of ticket.details) {
            if (detail.gameItemId === draw.winnerItemId) {
              const prize = parseFloat(detail.amount) * parseFloat(detail.multiplier);
              
              await tx.ticketDetail.update({
                where: { id: detail.id },
                data: {
                  status: 'WON',
                  prize
                }
              });

              ticketTotalPrize += prize;
              hasWinningDetail = true;

              logger.info('Winning detail found', {
                ticketId: ticket.id,
                detailId: detail.id,
                gameItemNumber: detail.gameItem.number,
                amount: detail.amount,
                multiplier: detail.multiplier,
                prize
              });
            } else {
              await tx.ticketDetail.update({
                where: { id: detail.id },
                data: {
                  status: 'LOST',
                  prize: 0
                }
              });
            }
          }

          const ticketStatus = hasWinningDetail ? 'WON' : 'LOST';
          
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              status: ticketStatus,
              totalPrize: ticketTotalPrize
            }
          });

          if (hasWinningDetail) {
            await tx.user.update({
              where: { id: ticket.userId },
              data: {
                balance: {
                  increment: ticketTotalPrize
                }
              }
            });

            await tx.transaction.create({
              data: {
                userId: ticket.userId,
                type: 'PRIZE',
                amount: ticketTotalPrize,
                status: 'COMPLETED',
                description: `Premio del sorteo ${draw.game.name} - Número ganador: ${draw.winnerItem.number}`,
                metadata: {
                  ticketId: ticket.id,
                  drawId: draw.id,
                  winnerNumber: draw.winnerItem.number
                }
              }
            });

            totalPrizesAwarded += ticketTotalPrize;
            winnersCount++;

            logger.info('Prize awarded', {
              userId: ticket.userId,
              username: ticket.user.username,
              ticketId: ticket.id,
              prize: ticketTotalPrize
            });
          } else {
            losersCount++;
          }
        }

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
