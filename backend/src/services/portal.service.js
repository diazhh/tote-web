import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function resolveDateRange(filters) {
  const now = new Date();
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(now.getTime() - SEVEN_DAYS_MS);
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : now;
  return { dateFrom, dateTo };
}

function clampPageSize(size) {
  const n = Number(size) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, n), MAX_PAGE_SIZE);
}

function clampPage(page) {
  return Math.max(1, Number(page) || 1);
}

// Standard include for a ticket: its details (with gameItem) and its top-level draw.
// NOTE: TicketDetail has no `draw` relation in Prisma (only a scalar `drawId`),
// so per-detail draw data is not expanded here. For webhook tickets (single-draw
// source), Ticket.draw already identifies the detail's draw.
const TICKET_INCLUDE = {
  draw: {
    select: {
      id: true,
      drawDate: true,
      drawTime: true,
      status: true,
      winnerItemId: true,
      winnerItem: { select: { id: true, number: true, name: true } },
      game: { select: { id: true, name: true } },
    },
  },
  details: {
    include: {
      gameItem: { select: { id: true, number: true, name: true } },
    },
  },
};

const portalService = {
  async getMe({ apiSystemId, user }) {
    const apiSystem = await prisma.apiSystem.findUnique({
      where: { id: apiSystemId },
      select: { id: true, name: true, slug: true, mode: true },
    });
    return {
      apiSystem,
      user: { username: user.username },
    };
  },

  async listTickets({ apiSystemId, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
    const { dateFrom, dateTo } = resolveDateRange(filters);
    const take = clampPageSize(pageSize);
    const currentPage = clampPage(page);
    const skip = (currentPage - 1) * take;

    const where = {
      apiSystemId, // FORCED — never accepted from client filters
      source: 'WEBHOOK_PUSH',
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(filters.gameId && { gameId: filters.gameId }),
      ...(filters.status && { status: filters.status }),
    };

    try {
      const [rows, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: TICKET_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.ticket.count({ where }),
      ]);

      return { rows, total, page: currentPage, pageSize: take };
    } catch (err) {
      logger.error('[portal.listTickets] failed', { apiSystemId, err: err.message });
      throw err;
    }
  },

  async getTicket({ apiSystemId, ticketId }) {
    return prisma.ticket.findFirst({
      where: { id: ticketId, apiSystemId, source: 'WEBHOOK_PUSH' },
      include: TICKET_INCLUDE,
    });
  },

  async listDraws({ apiSystemId, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
    const { dateFrom, dateTo } = resolveDateRange(filters);
    const take = clampPageSize(pageSize);
    const currentPage = clampPage(page);
    const skip = (currentPage - 1) * take;

    // Find draws that have at least one ticket belonging to this provider.
    // TicketDetail has no direct Draw relation in Prisma, so we scope via
    // Draw.tickets (Ticket[]) which carries apiSystemId + source.
    const drawWhere = {
      drawDate: { gte: dateFrom, lte: dateTo },
      ...(filters.gameId && { gameId: filters.gameId }),
      tickets: {
        some: {
          apiSystemId, // FORCED
          source: 'WEBHOOK_PUSH',
        },
      },
    };

    try {
      const [rows, total] = await Promise.all([
        prisma.draw.findMany({
          where: drawWhere,
          select: {
            id: true,
            drawDate: true,
            drawTime: true,
            status: true,
            winnerItemId: true,
            winnerItem: { select: { id: true, number: true, name: true } },
            game: { select: { id: true, name: true } },
          },
          orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }],
          skip,
          take,
        }),
        prisma.draw.count({ where: drawWhere }),
      ]);

      // Per-draw count of this provider's tickets
      const rowsWithCount = await Promise.all(
        rows.map(async d => {
          const ticketCount = await prisma.ticket.count({
            where: { apiSystemId, source: 'WEBHOOK_PUSH', drawId: d.id },
          });
          return { ...d, ticketCount };
        }),
      );

      return { rows: rowsWithCount, total, page: currentPage, pageSize: take };
    } catch (err) {
      logger.error('[portal.listDraws] failed', { apiSystemId, err: err.message });
      throw err;
    }
  },

  async getDraw({ apiSystemId, drawId }) {
    const draw = await prisma.draw.findFirst({
      where: { id: drawId },
      select: {
        id: true,
        drawDate: true,
        drawTime: true,
        status: true,
        winnerItemId: true,
        winnerItem: { select: { id: true, number: true, name: true } },
        game: { select: { id: true, name: true } },
      },
    });
    if (!draw) return null;

    const tickets = await prisma.ticket.findMany({
      where: {
        apiSystemId, // FORCED
        source: 'WEBHOOK_PUSH',
        drawId,
      },
      include: {
        details: {
          include: { gameItem: { select: { number: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Privacy: hide draws where this provider has no tickets.
    if (tickets.length === 0) return null;

    return { draw, tickets };
  },
};

export default portalService;
