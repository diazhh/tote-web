/**
 * Adapter para proveedor: Virtuales
 *
 * ESTADO: Esqueleto — pendiente de completar cuando tengamos payloads reales.
 *
 * El proveedor envía jugadas con un `drawSlotId` numérico fijo que identifica
 * la combinación juego + hora (ver virtuales.slots.js para el mapa completo).
 *
 * Flujo de resolución:
 *   1. Leer drawSlotId del payload
 *   2. Buscar en SLOTS → obtener { gameId, drawTime }
 *   3. Consultar Draw del día → obtener drawId real (UUID)
 *   4. Retornar objeto normalizado para createWebhookTicket()
 *
 * Contrato de salida (lo que espera webhook.service.js):
 *   {
 *     drawId:           string,   // UUID del Draw del día
 *     externalTicketId: string,   // ID único del ticket en el sistema del proveedor
 *     totalAmount:      number,   // Monto total apostado
 *     providerData:     object,   // Payload original para auditoría
 *     details: [{                 // Array de líneas de apuesta
 *       gameItemId: string,       // UUID del GameItem (animal/número)
 *       amount:     number,       // Monto de esta línea
 *       multiplier: number,       // Multiplicador (default 1)
 *     }]
 *   }
 *
 * TODO (Fase 2):
 *   - Mapear los campos reales del proveedor (ticketId, number, amount, etc.)
 *   - Resolver gameItemId a partir del número/animal que envíe el proveedor
 *   - Validar que el sorteo esté en estado SCHEDULED o CLOSED (aceptando jugadas)
 *   - Manejar múltiples líneas de apuesta si el proveedor envía varias en un ticket
 */

import SLOTS from './virtuales.slots.js';
import { prisma } from '../../lib/prisma.js';
import { getVenezuelaDate } from '../../lib/dateUtils.js';

/**
 * Resuelve un drawSlotId fijo al Draw.id real del día actual.
 *
 * @param {number} slotId - ID fijo del slot (1–48)
 * @returns {Promise<string|null>} - UUID del Draw o null si no existe
 */
async function resolveDrawId(slotId) {
  const slot = SLOTS[slotId];
  if (!slot) return null;

  const today = getVenezuelaDate().toISOString().split('T')[0]; // YYYY-MM-DD

  const draw = await prisma.draw.findFirst({
    where: {
      gameId: slot.gameId,
      drawDate: new Date(today),
      drawTime: slot.drawTime,
    },
    select: { id: true, status: true },
  });

  return draw?.id ?? null;
}

/**
 * Normaliza el payload del proveedor Virtuales.
 *
 * @param {object} payload - JSON parseado del body del webhook
 * @returns {Promise<object>} - Objeto normalizado para createWebhookTicket()
 * @throws {Error} - Si el payload es inválido o el sorteo no existe
 */
export async function normalize(payload) {
  // ── Validar drawSlotId ──
  const slotId = payload.drawSlotId;
  if (!slotId || !SLOTS[slotId]) {
    throw new Error(`drawSlotId inválido o ausente: ${slotId}. Rango válido: 1–48`);
  }

  // ── Resolver al Draw del día ──
  const drawId = await resolveDrawId(slotId);
  if (!drawId) {
    const slot = SLOTS[slotId];
    throw new Error(
      `No se encontró sorteo para hoy: ${slot.gameName} ${slot.drawTime} (slotId=${slotId})`
    );
  }

  // ── TODO: Completar cuando tengamos payloads reales ──
  // Por ahora lanzamos error para que quede como FAILED en el log,
  // indicando que el adapter existe pero no está completo.
  throw new Error(
    '[Virtuales] Adapter en construcción — payload registrado en discovery. ' +
    `drawSlotId=${slotId} resolvió a drawId=${drawId}. ` +
    'Pendiente: mapeo de campos del proveedor.'
  );

  // Cuando esté listo, retornar algo como:
  // return {
  //   drawId,
  //   externalTicketId: payload.ticketId,
  //   totalAmount: payload.amount,
  //   providerData: payload,
  //   details: [{
  //     gameItemId: resolvedGameItemId,
  //     amount: payload.amount,
  //     multiplier: 1,
  //   }],
  // };
}
