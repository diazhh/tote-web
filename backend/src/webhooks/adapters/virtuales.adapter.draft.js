/**
 * Adapter para proveedor: Virtuales
 *
 * Transforma el payload del proveedor Virtuales al contrato normalizado
 * que espera webhook.service.js para crear tickets.
 *
 * Contrato de salida (éxito):
 *   {
 *     drawId:           string,   // UUID del Draw del primer play (D-01)
 *     externalTicketId: string,   // payload.ticketId
 *     totalAmount:      number,   // suma de todos los amounts
 *     providerData:     object,   // payload original para auditoría
 *     details: [{
 *       gameItemId:   string,     // UUID del GameItem por número
 *       amount:       number,     // play.amount
 *       multiplier:   number,     // GameItem.multiplier
 *       drawId:       string,     // Draw UUID de este detail específico (D-01)
 *     }]
 *   }
 *
 * Contrato de salida (rechazo, per D-03):
 *   { rejected: true, reason: string }
 *
 * Formato del payload del proveedor:
 *   { ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }
 */

import SLOTS from './virtuales.slots.js';
import { prisma } from '../../lib/prisma.js';
import { getVenezuelaDateString } from '../../lib/dateUtils.js';

/**
 * Resuelve un drawSlotId fijo al Draw del día actual.
 * Retorna { id, status } o null si no existe.
 *
 * @param {number} slotId - ID fijo del slot (1–48), ya validado como entero en rango
 * @returns {Promise<{ id: string, status: string }|null>}
 */
async function resolveDrawId(slotId) {
  const slot = SLOTS[slotId];
  if (!slot) return null;

  const today = getVenezuelaDateString(); // returns 'YYYY-MM-DD'

  const draw = await prisma.draw.findFirst({
    where: {
      gameId: slot.gameId,
      drawDate: new Date(today),
      drawTime: slot.drawTime,
    },
    select: { id: true, status: true },
  });

  return draw ? { id: draw.id, status: draw.status } : null;
}

/**
 * Normaliza el payload del proveedor Virtuales.
 *
 * Implementa validación all-or-nothing (D-02/D-06): si cualquier play falla,
 * se rechaza el ticket completo.
 *
 * El campo `animal` del payload es ignorado en el lookup (D-05) — se usa
 * exclusivamente el campo `number` para encontrar el GameItem.
 *
 * @param {object} payload - JSON parseado del body del webhook
 * @returns {Promise<object>} - Objeto normalizado o { rejected: true, reason }
 */
export async function normalize(payload) {
  // ── Detectar solicitud de anulación ──
  // El proveedor envía el mismo ticketId sin plays para anular
  if (!Array.isArray(payload.plays) || payload.plays.length === 0) {
    if (payload.ticketId) {
      return { annul: true, externalTicketId: String(payload.ticketId) };
    }
    return { rejected: true, reason: 'Payload must contain a non-empty plays array' };
  }

  // ── Primer paso: validar todos los plays y recopilar datos resueltos ──
  const resolvedPlays = [];

  for (const play of payload.plays) {
    // ADAPT-04 + VALID-03: parseInt para manejar drawSlotId como string o entero
    let slotId = parseInt(play.drawSlotId, 10);

    // VALID-03: Validar rango 1-48
    if (isNaN(slotId) || slotId < 1 || slotId > 48 || !SLOTS[slotId]) {
      return {
        rejected: true,
        reason: `Invalid drawSlotId: ${play.drawSlotId} — valid range is 1-48`,
      };
    }

    // Terminal flag: proveedor mezcla triples y terminales en un mismo ticket.
    // Cuando terminal=true y el slot es de TRIPLE PANTERA (25-36),
    // redirigir al slot equivalente de TERMINAL PANTERA (37-48, misma hora).
    if (play.terminal === true && slotId >= 25 && slotId <= 36) {
      slotId = slotId + 12; // 25→37, 26→38, ..., 36→48
    }

    const slot = SLOTS[slotId];

    // ADAPT-01: Resolver al Draw del día
    const draw = await resolveDrawId(slotId);
    if (!draw) {
      return {
        rejected: true,
        reason: `No draw found for slot ${slotId} (${slot.gameName} ${slot.drawTime}) today`,
      };
    }

    // VALID-01 + VALID-02: Rechazar sorteos que no aceptan apuestas
    if (['DRAWN', 'CANCELLED', 'CLOSED'].includes(draw.status)) {
      return {
        rejected: true,
        reason: `Draw for slot ${slotId} is ${draw.status} — bets not accepted`,
      };
    }

    // ADAPT-02 + D-05: Buscar GameItem por número (ignorar campo animal)
    const gameItem = await prisma.gameItem.findFirst({
      where: {
        gameId: slot.gameId,
        number: String(play.number),
      },
      select: { id: true, multiplier: true },
    });

    // VALID-04: Rechazar si el número no existe en el juego
    if (!gameItem) {
      return {
        rejected: true,
        reason: `Number "${play.number}" not found in game ${slot.gameName}`,
      };
    }

    resolvedPlays.push({ draw, slot, gameItem, play });
  }

  // ── Segundo paso: construir respuesta normalizada ──
  // D-01: drawId top-level = primer play; cada detail tiene su propio drawId
  return {
    drawId: resolvedPlays[0].draw.id,
    externalTicketId: String(payload.ticketId),
    totalAmount: resolvedPlays.reduce((sum, rp) => sum + Number(rp.play.amount), 0),
    providerData: payload,
    details: resolvedPlays.map((rp) => ({
      gameItemId: rp.gameItem.id,
      amount: Number(rp.play.amount),
      multiplier: Number(rp.gameItem.multiplier),
      drawId: rp.draw.id,
      // Echo de identidad del play original para que el service pueda
      // construir `items[]` en respuestas con aceptación parcial. Campos
      // extra ignorados por createWebhookTicket.
      drawSlotId: String(rp.play.drawSlotId),
      number: String(rp.play.number),
    })),
  };
}
