/**
 * WinBigVzla webhook adapter — aceptación parcial por número (split/diferencial).
 *
 * Comparte la misma normalización estándar que premier/paganarplay (el
 * proveedor envía el payload `plays[]` con `drawSlotId`). El comportamiento
 * diferenciado vive en webhook.service: como `winbigvzla` está en
 * PARTIAL_ACCEPTANCE_SLUGS y SPLIT_PARTIAL_SLUGS, el service usa
 * partitionByQuota({ split: true }) en lugar de checkTicketQuotas, creando el
 * ticket con los montos topeados al cupo disponible y devolviendo `items[]` +
 * `totalAmount` en la respuesta.
 */
export { normalize } from './winbigvzla.adapter.draft.js';
