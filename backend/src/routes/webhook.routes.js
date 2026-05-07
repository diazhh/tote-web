import express from 'express';
import { webhookAuth } from '../middlewares/webhook-auth.middleware.js';
import { webhookRateLimit } from '../middlewares/webhook-rate-limit.middleware.js';
import { receive } from '../controllers/webhook.controller.js';

const router = express.Router();

// express.raw must be applied FIRST on this router so req.body is a Buffer
// for all subsequent handlers. This must be registered BEFORE app.use(express.json())
// in index.js (Plan 03 handles the index.js registration).
//
// Limit is intentionally tight (64KB): real provider payloads (SRQ/Maxplay)
// are well under 10KB. A larger cap would let a leaked token spam-fill
// the WebhookLog table 1MB at a time.
router.use(express.raw({ type: '*/*', limit: '64kb' }));

// Cadena: auth → rate limit (per-provider) → handler
router.post('/:providerSlug', webhookAuth, webhookRateLimit, receive);

export default router;
