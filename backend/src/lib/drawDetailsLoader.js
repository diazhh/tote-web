/**
 * Carga TicketDetails atribuidos a un sorteo específico, evitando el bug
 * de multi-sorteo donde un Ticket apunta a UN solo drawId (el "ancla"),
 * pero sus TicketDetails pueden distribuirse en varios drawIds distintos.
 *
 * Contexto: proveedores como `virtuales` envían tickets en modo WEBHOOK_PUSH
 * que apuestan el mismo número en N sorteos consecutivos. Cada jugada vive
 * en un TicketDetail con su propio `drawId`. La FK reversa `Draw.tickets`
 * (que filtra por `Ticket.drawId`) sólo encuentra las apuestas que tienen
 * a este sorteo como ancla, perdiendo las del resto.
 *
 * Patrón canónico de uso:
 *   const details = await loadDrawTicketDetails(drawId, { ticketWhere });
 *   for (const d of details) { ...d.amount, d.gameItem, d.ticket.providerData... }
 *
 * Para totales por sorteo NUNCA usar `Ticket.totalAmount` ni `Ticket.totalPrize`:
 * representan el ticket completo (suma de todas las jugadas en todos los
 * sorteos). Siempre acumular `TicketDetail.amount` y `TicketDetail.prize`.
 */
import { prisma } from './prisma.js';

const DEFAULT_TICKET_WHERE = { status: { not: 'CANCELLED' } };

/**
 * @param {string} drawId
 * @param {Object} [options]
 * @param {Object} [options.ticketWhere] - filtros sobre el Ticket relacionado
 * @param {Object|true} [options.ticketSelect] - select específico del ticket
 *   (default true → incluye todos los campos del ticket)
 * @returns {Promise<Array>} TicketDetail[] con .gameItem y .ticket cargados
 */
export async function loadDrawTicketDetails(drawId, options = {}) {
  const { ticketWhere = DEFAULT_TICKET_WHERE, ticketSelect = null } = options;
  // Fallback para details legacy (TicketDetail.drawId IS NULL): atribuir vía
  // Ticket.drawId. Aplicable a SRQ pre-fix (~0.7% del histórico) y a TAQUILLA
  // online antiguo. Single-draw por diseño, así que Ticket.drawId == su draw.
  return prisma.ticketDetail.findMany({
    where: {
      OR: [
        { drawId, ticket: ticketWhere },
        { drawId: null, ticket: { ...ticketWhere, drawId } },
      ],
    },
    include: {
      gameItem: true,
      ticket: ticketSelect ? { select: ticketSelect } : true,
    },
  });
}

/**
 * Agrega TicketDetails por gameItemId — el reemplazo correcto del patrón
 * antiguo `groupSalesByItem(tickets)` que iteraba `ticket.details` (incluía
 * jugadas de OTROS sorteos cuando el ticket era multi-sorteo).
 *
 * Acepta una lista plana de TicketDetail (ya filtrada por drawId) y devuelve
 * un Map con amount/count/tickets agregados por número.
 *
 * @param {Array} details - TicketDetail[] (cada uno con .ticketId)
 * @returns {Map<string, {amount:number, count:number, tickets:Array}>}
 */
export function aggregateDetailsByItem(details) {
  const salesByItem = new Map();
  for (const detail of details) {
    const existing = salesByItem.get(detail.gameItemId) || {
      amount: 0,
      count: 0,
      tickets: [],
    };
    existing.amount += parseFloat(detail.amount);
    existing.count += 1;
    existing.tickets.push({
      ticketId: detail.ticketId,
      amount: parseFloat(detail.amount),
    });
    salesByItem.set(detail.gameItemId, existing);
  }
  return salesByItem;
}

/**
 * Cuenta tickets ÚNICOS entre una lista de details. Necesario para
 * reportar `ticketCount` correctamente (un ticket puede tener varios
 * details en el mismo sorteo — ej. apuesta a varios números).
 */
export function countUniqueTickets(details) {
  const ids = new Set();
  for (const detail of details) ids.add(detail.ticketId);
  return ids.size;
}

/**
 * Suma `amount` total a partir de la lista de details. Equivalente a
 * "ventas totales del sorteo", reemplaza el patrón roto:
 *   tickets.reduce((s, t) => s + parseFloat(t.totalAmount), 0)
 */
export function sumDetailsAmount(details) {
  let total = 0;
  for (const detail of details) total += parseFloat(detail.amount);
  return total;
}
