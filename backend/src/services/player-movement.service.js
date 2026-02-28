import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class PlayerMovementService {
  /**
   * Registrar un movimiento de jugador
   * @param {Object} tx - Transacción de Prisma (opcional)
   * @param {Object} data - Datos del movimiento
   * @returns {Promise<Object>} Movimiento creado
   */
  async createMovement(tx, data) {
    const client = tx || prisma;
    
    const {
      userId,
      type,
      amount,
      description,
      referenceType,
      referenceId,
      metadata,
      createdBy
    } = data;

    // Obtener saldo actual del usuario
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { balance: true }
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const balanceBefore = parseFloat(user.balance);
    const balanceAfter = balanceBefore + parseFloat(amount);

    const movement = await client.playerMovement.create({
      data: {
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        description,
        referenceType,
        referenceId,
        metadata,
        createdBy
      }
    });

    logger.info('PlayerMovement created', {
      id: movement.id,
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter
    });

    return movement;
  }

  /**
   * Registrar movimiento de apuesta (BET)
   */
  async recordBet(tx, userId, amount, ticketId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'BET',
      amount: -Math.abs(parseFloat(amount)), // Siempre negativo
      description: `Jugada en sorteo`,
      referenceType: 'TICKET',
      referenceId: ticketId,
      metadata
    });
  }

  /**
   * Registrar movimiento de premio (PRIZE)
   */
  async recordPrize(tx, userId, amount, ticketId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'PRIZE',
      amount: Math.abs(parseFloat(amount)), // Siempre positivo
      description: `Premio ganado`,
      referenceType: 'TICKET',
      referenceId: ticketId,
      metadata
    });
  }

  /**
   * Registrar movimiento de premio de tripleta
   */
  async recordTripletaPrize(tx, userId, amount, tripletaId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'PRIZE',
      amount: Math.abs(parseFloat(amount)),
      description: `Premio de tripleta`,
      referenceType: 'TRIPLETA',
      referenceId: tripletaId,
      metadata
    });
  }

  /**
   * Registrar movimiento de apuesta de tripleta
   */
  async recordTripletaBet(tx, userId, amount, tripletaId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'BET',
      amount: -Math.abs(parseFloat(amount)),
      description: `Apuesta de tripleta`,
      referenceType: 'TRIPLETA',
      referenceId: tripletaId,
      metadata
    });
  }

  /**
   * Registrar movimiento de depósito (DEPOSIT)
   */
  async recordDeposit(tx, userId, amount, depositId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'DEPOSIT',
      amount: Math.abs(parseFloat(amount)),
      description: `Recarga de saldo`,
      referenceType: 'DEPOSIT',
      referenceId: depositId,
      metadata
    });
  }

  /**
   * Registrar movimiento de retiro (WITHDRAWAL)
   */
  async recordWithdrawal(tx, userId, amount, withdrawalId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'WITHDRAWAL',
      amount: -Math.abs(parseFloat(amount)),
      description: `Retiro de saldo`,
      referenceType: 'WITHDRAWAL',
      referenceId: withdrawalId,
      metadata
    });
  }

  /**
   * Registrar movimiento de reembolso (REFUND)
   */
  async recordRefund(tx, userId, amount, ticketId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'REFUND',
      amount: Math.abs(parseFloat(amount)),
      description: `Reembolso por cancelación`,
      referenceType: 'TICKET',
      referenceId: ticketId,
      metadata
    });
  }

  /**
   * Registrar ajuste manual por admin
   */
  async recordAdjustment(tx, userId, amount, description, adminId, metadata = {}) {
    return this.createMovement(tx, {
      userId,
      type: 'ADJUSTMENT',
      amount: parseFloat(amount),
      description: description || 'Ajuste manual',
      referenceType: 'ADJUSTMENT',
      referenceId: null,
      metadata,
      createdBy: adminId
    });
  }

  /**
   * Obtener historial de movimientos de un jugador
   * Enriquece movimientos BET/PRIZE con datos del ticket o tripleta
   */
  async getPlayerMovements(userId, options = {}) {
    const { limit = 50, offset = 0, type, dateFrom, dateTo } = options;

    const where = { userId };

    if (type) {
      where.type = type;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [movements, total] = await Promise.all([
      prisma.playerMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.playerMovement.count({ where })
    ]);

    // Enriquecer movimientos con datos de ticket/tripleta
    const enriched = await this._enrichMovements(movements);

    return { movements: enriched, total };
  }

  /**
   * Enriquecer movimientos con datos del ticket o tripleta referenciado
   */
  async _enrichMovements(movements) {
    // Separar IDs por tipo de referencia
    const ticketIds = [];
    const tripletaIds = [];

    for (const m of movements) {
      if (m.referenceId) {
        if (m.referenceType === 'TICKET') ticketIds.push(m.referenceId);
        else if (m.referenceType === 'TRIPLETA') tripletaIds.push(m.referenceId);
      }
    }

    // Fetch en batch para evitar N+1
    const [tickets, tripletas] = await Promise.all([
      ticketIds.length > 0
        ? prisma.ticket.findMany({
            where: { id: { in: [...new Set(ticketIds)] } },
            include: {
              draw: { include: { game: true, winnerItem: true } },
              details: { include: { gameItem: true } }
            }
          })
        : [],
      tripletaIds.length > 0
        ? prisma.tripleBet.findMany({
            where: { id: { in: [...new Set(tripletaIds)] } },
            include: {
              game: true,
              items: { include: { gameItem: true } },
              draws: {
                include: {
                  draw: { include: { winnerItem: true } }
                },
                orderBy: { draw: { drawDate: 'asc' } }
              }
            }
          })
        : []
    ]);

    // Indexar por ID
    const ticketMap = new Map(tickets.map(t => [t.id, t]));
    const tripletaMap = new Map(tripletas.map(t => [t.id, t]));

    // Enriquecer cada movimiento
    return movements.map(m => {
      const enriched = { ...m };

      if (m.referenceType === 'TICKET' && m.referenceId) {
        const ticket = ticketMap.get(m.referenceId);
        if (ticket) {
          enriched.ticket = {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            totalAmount: parseFloat(ticket.totalAmount),
            totalPrize: parseFloat(ticket.totalPrize || 0),
            draw: {
              id: ticket.draw.id,
              gameName: ticket.draw.game.name,
              drawDate: ticket.draw.drawDate,
              drawTime: ticket.draw.drawTime,
              status: ticket.draw.status,
              winnerNumber: ticket.draw.winnerItem?.number || null
            },
            details: ticket.details.map(d => ({
              number: d.gameItem.number,
              amount: parseFloat(d.amount),
              multiplier: parseFloat(d.multiplier),
              prize: parseFloat(d.prize || 0),
              status: d.status
            }))
          };
        }
      } else if (m.referenceType === 'TRIPLETA' && m.referenceId) {
        const tripleta = tripletaMap.get(m.referenceId);
        if (tripleta) {
          const numbersWon = tripleta.items.filter(i => i.won).length;
          enriched.tripleta = {
            id: tripleta.id,
            status: tripleta.status,
            amount: parseFloat(tripleta.amount),
            prize: parseFloat(tripleta.prize || 0),
            multiplier: parseFloat(tripleta.multiplier),
            numbersWon,
            drawsCount: tripleta.drawsCount,
            gameName: tripleta.game?.name || null,
            items: tripleta.items.map(i => ({
              number: i.gameItem.number,
              name: i.gameItem.name,
              won: i.won
            })),
            draws: tripleta.draws.map(d => ({
              drawDate: d.draw.drawDate,
              drawTime: d.draw.drawTime,
              status: d.draw.status,
              winnerNumber: d.draw.winnerItem?.number || null,
              matched: d.matched
            }))
          };
        }
      }

      return enriched;
    });
  }

  /**
   * Actualizar estadísticas del jugador
   */
  async updatePlayerStats(tx, userId) {
    const client = tx || prisma;

    // Calcular estadísticas de tickets
    const ticketStats = await client.ticket.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
      _sum: { totalAmount: true, totalPrize: true }
    });

    // Calcular estadísticas de tripletas
    const tripletaStats = await client.tripleBet.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
      _sum: { amount: true, prize: true }
    });

    // Calcular totales de depósitos y retiros
    const depositTotal = await client.deposit.aggregate({
      where: { userId, status: 'APPROVED' },
      _sum: { amount: true }
    });

    const withdrawalTotal = await client.withdrawal.aggregate({
      where: { userId, status: 'COMPLETED' },
      _sum: { amount: true }
    });

    // Procesar estadísticas
    let totalTickets = 0, wonTickets = 0, lostTickets = 0;
    let totalTicketBet = 0, totalTicketPrize = 0;

    for (const stat of ticketStats) {
      totalTickets += stat._count;
      if (stat.status === 'WON') {
        wonTickets = stat._count;
        totalTicketPrize += parseFloat(stat._sum.totalPrize || 0);
      } else if (stat.status === 'LOST') {
        lostTickets = stat._count;
      }
      totalTicketBet += parseFloat(stat._sum.totalAmount || 0);
    }

    let totalTripletas = 0, wonTripletas = 0, lostTripletas = 0;
    let totalTripletaBet = 0, totalTripletaPrize = 0;

    for (const stat of tripletaStats) {
      totalTripletas += stat._count;
      if (stat.status === 'WON') {
        wonTripletas = stat._count;
        totalTripletaPrize += parseFloat(stat._sum.prize || 0);
      } else if (stat.status === 'LOST' || stat.status === 'EXPIRED') {
        lostTripletas += stat._count;
      }
      totalTripletaBet += parseFloat(stat._sum.amount || 0);
    }

    // Upsert PlayerStats
    await client.playerStats.upsert({
      where: { userId },
      create: {
        userId,
        totalTickets,
        wonTickets,
        lostTickets,
        totalTripletas,
        wonTripletas,
        lostTripletas,
        totalBet: totalTicketBet + totalTripletaBet,
        totalPrize: totalTicketPrize + totalTripletaPrize,
        totalDeposits: parseFloat(depositTotal._sum.amount || 0),
        totalWithdrawals: parseFloat(withdrawalTotal._sum.amount || 0),
        calculatedAt: new Date()
      },
      update: {
        totalTickets,
        wonTickets,
        lostTickets,
        totalTripletas,
        wonTripletas,
        lostTripletas,
        totalBet: totalTicketBet + totalTripletaBet,
        totalPrize: totalTicketPrize + totalTripletaPrize,
        totalDeposits: parseFloat(depositTotal._sum.amount || 0),
        totalWithdrawals: parseFloat(withdrawalTotal._sum.amount || 0),
        calculatedAt: new Date()
      }
    });

    logger.info('PlayerStats updated', { userId });
  }

  /**
   * Obtener estadísticas del jugador
   */
  async getPlayerStats(userId) {
    let stats = await prisma.playerStats.findUnique({
      where: { userId }
    });

    // Si no existen, calcularlas
    if (!stats) {
      await this.updatePlayerStats(null, userId);
      stats = await prisma.playerStats.findUnique({
        where: { userId }
      });
    }

    return stats;
  }
}

export default new PlayerMovementService();
