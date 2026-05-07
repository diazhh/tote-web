/**
 * Per-provider webhook rate limiter.
 *
 * The global generalLimiter is keyed by IP. A provider with multiple egress
 * IPs (or one whose token leaked) can saturate the WebhookLog table even
 * after the global limiter is satisfied. This caps each provider to a
 * token-bucket — independent of source IP.
 *
 * Defaults: 100 requests / 60s (burst 100). Tunable via env vars
 * WEBHOOK_RL_BURST and WEBHOOK_RL_REFILL_PER_SEC.
 *
 * In-memory state is fine here: pm2 runs a single Node process per VPS;
 * a restart just resets the buckets, which is the correct conservative
 * behavior (no missed throttling persists across crashes).
 */

const BURST = Number(process.env.WEBHOOK_RL_BURST) || 100;
const REFILL_PER_SEC = Number(process.env.WEBHOOK_RL_REFILL_PER_SEC) || (100 / 60);

const buckets = new Map(); // apiSystemId -> { tokens, lastRefill }

function takeToken(apiSystemId) {
  const now = Date.now();
  let b = buckets.get(apiSystemId);
  if (!b) {
    b = { tokens: BURST, lastRefill: now };
    buckets.set(apiSystemId, b);
  }
  // Refill
  const elapsedSec = (now - b.lastRefill) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(BURST, b.tokens + elapsedSec * REFILL_PER_SEC);
    b.lastRefill = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: Math.floor(b.tokens) };
  }
  // Calcular cuándo se podrá pasar
  const retryAfterSec = Math.ceil((1 - b.tokens) / REFILL_PER_SEC);
  return { allowed: false, retryAfterSec };
}

export function webhookRateLimit(req, res, next) {
  // Requiere que webhookAuth haya colgado req.apiSystem
  const apiSystemId = req.apiSystem?.id;
  if (!apiSystemId) {
    // Sin auth, dejar que el handler maneje (no deberíamos llegar acá en producción)
    return next();
  }
  const result = takeToken(apiSystemId);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSec));
    return res.status(429).json({ error: 'Rate limit exceeded for provider' });
  }
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  next();
}

// Test-only export: clears all buckets (no-op for prod)
export function _resetBucketsForTesting() {
  buckets.clear();
}
