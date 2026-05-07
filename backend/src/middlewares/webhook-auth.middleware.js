import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

// Defensa en profundidad: incluso si createSystem se filtra, el slug en la URL
// del webhook nunca puede salirse del set seguro.
const SLUG_REGEX = /^[a-z0-9_-]{1,64}$/;

/**
 * Webhook authentication middleware.
 *
 * - Reads X-Webhook-Token from request headers.
 * - Rejects missing tokens immediately with 401 (before any DB access).
 * - Queries ApiSystem by providerSlug + isActive + mode='PUSH'.
 * - Uses crypto.timingSafeEqual (with length guard) to compare tokens.
 * - Attaches req.apiSystem on success and calls next().
 */
export async function webhookAuth(req, res, next) {
  // Validar formato del slug antes de cualquier acceso a DB o filesystem
  if (!SLUG_REGEX.test(req.params.providerSlug || '')) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const incomingToken = req.headers['x-webhook-token'];

  if (!incomingToken) {
    return res.status(401).json({ error: 'Missing webhook token' });
  }

  try {
    const apiSystem = await prisma.apiSystem.findFirst({
      where: {
        slug: req.params.providerSlug,
        mode: 'PUSH',
      },
    });

    if (!apiSystem || !apiSystem.webhookToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if provider is paused (after finding it, so we give a clear message)
    if (!apiSystem.isActive) {
      return res.status(200).json({ received: true, ticket: { status: 'REJECTED', reason: 'Provider is paused' } });
    }

    const incomingBuf = Buffer.from(incomingToken, 'utf8');
    const storedBuf = Buffer.from(apiSystem.webhookToken, 'utf8');

    // timingSafeEqual throws if buffers have different lengths — guard first
    if (incomingBuf.length !== storedBuf.length) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!crypto.timingSafeEqual(incomingBuf, storedBuf)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.apiSystem = apiSystem;
    next();
  } catch (err) {
    logger.error('[webhookAuth] DB error during token validation:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
