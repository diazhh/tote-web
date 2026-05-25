import { dispatchWebhook } from '../services/webhook.service.js';
import logger from '../lib/logger.js';

/**
 * POST /api/webhooks/:providerSlug
 *
 * Thin HTTP handler. Always returns HTTP 200 after auth passes.
 * Processing errors are recorded in WebhookLog.status — never bubbled as 4xx/5xx.
 */
export async function receive(req, res) {
  try {
    const result = await dispatchWebhook(req.apiSystem, req.body, req.headers);

    const response = { received: true, logId: result.logId };

    if (result.status === 'processed') {
      response.ticket = { id: result.ticketNumber, status: 'ACCEPTED' };
      // Proveedores con aceptación parcial (premier2) reciben el desglose
      // de lo vendido. Detalles sin cupo se omiten — para identificarlos
      // el proveedor compara su payload original contra `items`.
      if (result.items) {
        response.ticket.totalAmount = result.totalAmount;
        response.ticket.items = result.items;
      }
    } else if (result.status === 'duplicate') {
      response.ticket = { id: result.ticketNumber, status: 'DUPLICATE' };
    } else if (result.status === 'annulled') {
      response.ticket = { id: result.ticketNumber, status: 'ANNULLED' };
    } else if (result.status === 'rejected') {
      response.ticket = { status: 'REJECTED', reason: result.reason };
    }
    // discovery and failed: no ticket field (backwards compatible)

    return res.status(200).json(response);
  } catch (err) {
    logger.error('[webhook] Unhandled error in receive handler:', err);
    return res.status(200).json({ received: true });
  }
}
