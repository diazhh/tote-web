/**
 * Premier2 webhook adapter — canal de pruebas con aceptación parcial.
 *
 * Comparte la misma normalización que `premier` (el proveedor envía el
 * mismo payload). El comportamiento diferenciado vive en webhook.service:
 * cuando `apiSystem.slug === 'premier2'` el service usa partitionByQuota
 * en lugar de checkTicketQuotas, creando el ticket solo con los detalles
 * que tienen cupo y devolviendo `items[]` + `totalAmount` en la respuesta.
 *
 * Premier original sigue funcionando sin cambios.
 */
export { normalize } from './premier.adapter.draft.js';
