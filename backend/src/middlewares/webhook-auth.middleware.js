import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

// Defensa en profundidad: incluso si createSystem se filtra, el slug en la URL
// del webhook nunca puede salirse del set seguro.
const SLUG_REGEX = /^[a-z0-9_-]{1,64}$/;

// Ventana de tolerancia para X-Webhook-Timestamp (±5 minutos). Defiende
// contra replay si un atacante captura una request firmada.
const HMAC_TIMESTAMP_TOLERANCE_SEC = 300;

function safeEqualStrings(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Validates HMAC-SHA256 signature when apiSystem.requireSignature is true.
 * Header format:
 *   X-Webhook-Timestamp: <unix-seconds>
 *   X-Webhook-Signature: sha256=<hex-of-hmac>
 *
 * HMAC payload: `${timestamp}.${rawBody}` keyed with apiSystem.webhookToken.
 * (Stripe-style construction — binds timestamp to body to prevent replay
 * with a different body.)
 *
 * Returns null on success, or { status, error } on failure.
 */
function verifySignature(req, apiSystem) {
  const timestampHeader = req.headers['x-webhook-timestamp'];
  const signatureHeader = req.headers['x-webhook-signature'];

  if (!timestampHeader || !signatureHeader) {
    return { status: 401, error: 'Missing X-Webhook-Timestamp or X-Webhook-Signature' };
  }

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) {
    return { status: 401, error: 'Invalid timestamp' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > HMAC_TIMESTAMP_TOLERANCE_SEC) {
    return { status: 401, error: 'Timestamp outside tolerance window' };
  }

  // signatureHeader format: "sha256=<hex>"
  const match = String(signatureHeader).match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) {
    return { status: 401, error: 'Invalid signature format' };
  }
  const providedSig = match[1].toLowerCase();

  // rawBody puede ser Buffer (express.raw) o string. Mantener fidelidad de bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '', 'utf8');
  const payload = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), rawBody]);
  const expectedSig = crypto
    .createHmac('sha256', apiSystem.webhookToken)
    .update(payload)
    .digest('hex');

  if (!safeEqualStrings(providedSig, expectedSig)) {
    return { status: 401, error: 'Invalid signature' };
  }
  return null;
}

/**
 * Webhook authentication middleware.
 *
 * - Reads X-Webhook-Token from request headers.
 * - Rejects missing tokens immediately with 401 (before any DB access).
 * - Queries ApiSystem by providerSlug + isActive + mode='PUSH'.
 * - Uses crypto.timingSafeEqual (with length guard) to compare tokens.
 * - When apiSystem.requireSignature is true, ALSO validates HMAC + timestamp.
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

    if (!safeEqualStrings(incomingToken, apiSystem.webhookToken)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Si el proveedor exige firma HMAC, validarla DESPUÉS del token (más caro,
    // así limitamos cómputo a peticiones con token correcto).
    if (apiSystem.requireSignature) {
      const sigErr = verifySignature(req, apiSystem);
      if (sigErr) {
        return res.status(sigErr.status).json({ error: sigErr.error });
      }
    }

    // Check if provider is paused — solo después de validar credenciales,
    // para no leakear "este slug existe pero está pausado" a tokens inválidos.
    if (!apiSystem.isActive) {
      return res.status(200).json({ received: true, ticket: { status: 'REJECTED', reason: 'Provider is paused' } });
    }

    req.apiSystem = apiSystem;
    next();
  } catch (err) {
    logger.error('[webhookAuth] DB error during token validation:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
