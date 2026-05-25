/**
 * Virtuales2 webhook adapter — canal de pruebas con aceptación parcial.
 *
 * Comparte la misma normalización que `virtuales` (el proveedor envía el
 * mismo payload). El comportamiento diferenciado vive en webhook.service:
 * cuando `apiSystem.slug === 'virtuales2'` el service usa partitionByQuota
 * en lugar de checkTicketQuotas, creando el ticket solo con los detalles
 * que tienen cupo y devolviendo `items[]` + `totalAmount` en la respuesta.
 *
 * Virtuales original sigue funcionando sin cambios.
 */
export { normalize } from './virtuales.adapter.draft.js';
