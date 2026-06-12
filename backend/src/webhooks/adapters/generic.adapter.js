/**
 * Adapter GENÉRICO — conector estándar para proveedores PUSH.
 *
 * Se usa automáticamente (vía webhook.service) para cualquier proveedor con
 * `useGenericAdapter = true` que NO tenga un adapter custom `{slug}.adapter.js`.
 * Esto permite dar de alta proveedores desde el front sin escribir código:
 * el proveedor solo debe adoptar el contrato estándar de payload.
 *
 * El comportamiento de cupo (estricto / descarte / split) lo decide
 * webhook.service según `apiSystem.partialMode`; este adapter solo normaliza.
 *
 * Contrato del payload del proveedor (estándar):
 *   { ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }
 *
 * Contrato de salida (éxito):
 *   { drawId, externalTicketId, totalAmount, providerData, details: [
 *       { gameItemId, amount, multiplier, drawId, drawSlotId, number } ] }
 * Contrato de salida (rechazo):   { rejected: true, reason }
 * Contrato de salida (anulación): { annul: true, externalTicketId }
 */

import SLOTS from './_standard-slots.js';
import { prisma } from '../../lib/prisma.js';
import { getVenezuelaDateString } from '../../lib/dateUtils.js';

/**
 * Resuelve un drawSlotId fijo al Draw del día actual.
 * @param {number} slotId - ID del slot (1–48), ya validado como entero en rango
 * @returns {Promise<{ id: string, status: string }|null>}
 */
async function resolveDrawId(slotId) {
  const slot = SLOTS[slotId];
  if (!slot) return null;

  const today = getVenezuelaDateString(); // 'YYYY-MM-DD'

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
 * Normaliza un payload estándar. Errores estructurales (slot inválido, número
 * inexistente, sorteo cerrado) rechazan el ticket completo. La falta de cupo
 * NO se evalúa aquí — la maneja webhook.service según partialMode.
 *
 * @param {object} payload - JSON parseado del body del webhook
 * @returns {Promise<object>}
 */
export async function normalize(payload) {
  // ── Anulación: mismo ticketId sin plays ──
  if (!Array.isArray(payload.plays) || payload.plays.length === 0) {
    if (payload.ticketId) {
      return { annul: true, externalTicketId: String(payload.ticketId) };
    }
    return { rejected: true, reason: 'Payload must contain a non-empty plays array' };
  }

  const resolvedPlays = [];

  for (const play of payload.plays) {
    const slotId = parseInt(play.drawSlotId, 10);

    if (isNaN(slotId) || slotId < 1 || slotId > 48 || !SLOTS[slotId]) {
      return {
        rejected: true,
        reason: `Invalid drawSlotId: ${play.drawSlotId} — valid range is 1-48`,
      };
    }

    const slot = SLOTS[slotId];

    const draw = await resolveDrawId(slotId);
    if (!draw) {
      return {
        rejected: true,
        reason: `No draw found for slot ${slotId} (${slot.gameName} ${slot.drawTime}) today`,
      };
    }

    if (['DRAWN', 'CANCELLED', 'CLOSED'].includes(draw.status)) {
      return {
        rejected: true,
        reason: `Draw for slot ${slotId} is ${draw.status} — bets not accepted`,
      };
    }

    const gameItem = await prisma.gameItem.findFirst({
      where: { gameId: slot.gameId, number: String(play.number) },
      select: { id: true, multiplier: true },
    });

    if (!gameItem) {
      return {
        rejected: true,
        reason: `Number "${play.number}" not found in game ${slot.gameName}`,
      };
    }

    resolvedPlays.push({ draw, slot, gameItem, play });
  }

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
      // Echo para construir items[] en respuestas con aceptación parcial.
      drawSlotId: String(rp.play.drawSlotId),
      number: String(rp.play.number),
    })),
  };
}
