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
    return res.status(200).json({ received: true, logId: result.logId });
  } catch (err) {
    logger.error('[webhook] Unhandled error in receive handler:', err);
    return res.status(200).json({ received: true });
  }
}
