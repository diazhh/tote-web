/**
 * Adapter para proveedor: WinBigVzla
 *
 * Transforma el payload del proveedor WinBigVzla al contrato normalizado
 * que espera webhook.service.js para crear tickets.
 *
 * Aceptación parcial por número (split/diferencial): `winbigvzla` está en
 * PARTIAL_ACCEPTANCE_SLUGS y en SPLIT_PARTIAL_SLUGS, así que el service usa
 * partitionByQuota({ split: true }). Cuando una jugada excede el cupo restante
 * se vende el diferencial disponible (el excedente se descarta) en vez de
 * rechazar el número completo. El ticket se crea con lo realmente vendido y la
 * respuesta incluye `items[]` + `totalAmount` con los montos topeados.
 *
 * Contrato de salida (éxito):
 *   {
 *     drawId:           string,   // UUID del Draw del primer play
 *     externalTicketId: string,   // payload.ticketId
 *     totalAmount:      number,   // suma de todos los amounts
 *     providerData:     object,   // payload original para auditoría
 *     details: [{
 *       gameItemId:   string,     // UUID del GameItem por número
 *       amount:       number,     // play.amount
 *       multiplier:   number,     // GameItem.multiplier
 *       drawId:       string,     // Draw UUID de este detail específico
 *       drawSlotId:   string,     // echo para construir items[] (aceptación parcial)
 *       number:       string,     // echo para construir items[] (aceptación parcial)
 *     }]
 *   }
 *
 * Contrato de salida (rechazo): { rejected: true, reason: string }
 * Contrato de salida (anulación): { annul: true, externalTicketId: string }
 *
 * Formato del payload del proveedor:
 *   { ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }
 */

import SLOTS from './winbigvzla.slots.js';
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
 * Normaliza el payload del proveedor WinBigVzla.
 *
 * Errores estructurales (slot inválido, número inexistente, sorteo cerrado)
 * rechazan el ticket completo. La falta de cupo NO se evalúa aquí: el service
 * la maneja con partitionByQuota (aceptación parcial por número).
 *
 * El campo `animal` del payload es ignorado en el lookup — se usa
 * exclusivamente el campo `number` para encontrar el GameItem.
 *
 * @param {object} payload - JSON parseado del body del webhook
 * @returns {Promise<object>} - Objeto normalizado o { rejected: true, reason }
 */
export async function normalize(payload) {
  // ── Detectar solicitud de anulación ──
  // El proveedor envía el mismo ticketId sin plays para anular.
  if (!Array.isArray(payload.plays) || payload.plays.length === 0) {
    if (payload.ticketId) {
      return { annul: true, externalTicketId: String(payload.ticketId) };
    }
    return { rejected: true, reason: 'Payload must contain a non-empty plays array' };
  }

  // ── Primer paso: validar todos los plays y recopilar datos resueltos ──
  const resolvedPlays = [];

  for (const play of payload.plays) {
    // parseInt para manejar drawSlotId como string o entero.
    const slotId = parseInt(play.drawSlotId, 10);

    // Validar rango 1-48.
    if (isNaN(slotId) || slotId < 1 || slotId > 48 || !SLOTS[slotId]) {
      return {
        rejected: true,
        reason: `Invalid drawSlotId: ${play.drawSlotId} — valid range is 1-48`,
      };
    }

    const slot = SLOTS[slotId];

    // Resolver al Draw del día.
    const draw = await resolveDrawId(slotId);
    if (!draw) {
      return {
        rejected: true,
        reason: `No draw found for slot ${slotId} (${slot.gameName} ${slot.drawTime}) today`,
      };
    }

    // Rechazar sorteos que no aceptan apuestas.
    if (['DRAWN', 'CANCELLED', 'CLOSED'].includes(draw.status)) {
      return {
        rejected: true,
        reason: `Draw for slot ${slotId} is ${draw.status} — bets not accepted`,
      };
    }

    // Buscar GameItem por número (ignorar campo animal).
    const gameItem = await prisma.gameItem.findFirst({
      where: {
        gameId: slot.gameId,
        number: String(play.number),
      },
      select: { id: true, multiplier: true },
    });

    // Rechazar si el número no existe en el juego.
    if (!gameItem) {
      return {
        rejected: true,
        reason: `Number "${play.number}" not found in game ${slot.gameName}`,
      };
    }

    resolvedPlays.push({ draw, slot, gameItem, play });
  }

  // ── Segundo paso: construir respuesta normalizada ──
  // drawId top-level = primer play; cada detail tiene su propio drawId.
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
