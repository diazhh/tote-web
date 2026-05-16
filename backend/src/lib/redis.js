import Redis from 'ioredis';
import logger from './logger.js';

const REDIS_TIMEOUT_MS = 200;
const TRACKING_SET_PREFIX = 'tote:v1:idx:';

let client = null;

function isEnabled() {
  return process.env.REDIS_ENABLED !== 'false';
}

function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;

  client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('error', (err) => {
    logger.warn(`[redis] ${err.message}`);
  });
  client.on('connect', () => {
    logger.info('[redis] connected');
  });

  return client;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('redis_timeout')), ms)),
  ]);
}

/**
 * Read-through cache wrapper. On hit → return parsed JSON. On miss / error /
 * disabled → run `fn`, SETEX result with TTL, return.
 */
export async function cacheOrCompute(key, ttlSeconds, fn, opts = {}) {
  const c = getClient();
  if (!c) return fn();

  try {
    const cached = await withTimeout(c.get(key), REDIS_TIMEOUT_MS);
    if (cached !== null && cached !== undefined) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn(`[cache] get failed key=${key} err=${err.message} — falling back`);
    return fn();
  }

  const value = await fn();
  try {
    await withTimeout(c.setex(key, ttlSeconds, JSON.stringify(value)), REDIS_TIMEOUT_MS);
    if (opts.trackingSet) {
      await withTimeout(c.sadd(`${TRACKING_SET_PREFIX}${opts.trackingSet}`, key), REDIS_TIMEOUT_MS);
    }
  } catch (err) {
    logger.warn(`[cache] setex failed key=${key} err=${err.message}`);
  }
  return value;
}

/** DEL a single key. */
export async function invalidate(key) {
  const c = getClient();
  if (!c) return;
  try {
    await withTimeout(c.del(key), REDIS_TIMEOUT_MS);
  } catch (err) {
    logger.warn(`[cache] invalidate failed key=${key} err=${err.message}`);
  }
}

/**
 * Invalidate every key recorded under a tracking-set name.
 *
 * NOTE: this is NOT a glob match — `trackingSetName` is treated as an exact
 * identifier appended to `tote:v1:idx:`. Callers typically pass a glob-shaped
 * string (e.g. `"tote:v1:report:*"`) purely as a human-readable label, not for
 * matching semantics. The `SETEX` call site must use the same string in
 * `opts.trackingSet`.
 */
export async function invalidatePattern(trackingSetName) {
  const c = getClient();
  if (!c) return;
  const setKey = `${TRACKING_SET_PREFIX}${trackingSetName}`;
  try {
    const members = await withTimeout(c.smembers(setKey), REDIS_TIMEOUT_MS);
    if (!members || members.length === 0) return;
    await withTimeout(c.unlink(...members), REDIS_TIMEOUT_MS);
    await withTimeout(c.del(setKey), REDIS_TIMEOUT_MS);
  } catch (err) {
    logger.warn(`[cache] invalidatePattern failed name=${trackingSetName} err=${err.message}`);
  }
}

/** True if Redis is enabled AND the client reports `ready`. */
export async function isHealthy() {
  const c = getClient();
  if (!c) return false;
  return c.status === 'ready';
}

/** Graceful shutdown — used by index.js shutdown hook. */
export async function shutdown() {
  if (client) {
    try {
      await client.quit();
    } catch {
      // ignore — process is exiting anyway
    }
    client = null;
  }
}
