import express from 'express';
import { webhookAuth } from '../middlewares/webhook-auth.middleware.js';
import { receive } from '../controllers/webhook.controller.js';

const router = express.Router();

// express.raw must be applied FIRST on this router so req.body is a Buffer
// for all subsequent handlers. This must be registered BEFORE app.use(express.json())
// in index.js (Plan 03 handles the index.js registration).
router.use(express.raw({ type: '*/*', limit: '1mb' }));

router.post('/:providerSlug', webhookAuth, receive);

export default router;
