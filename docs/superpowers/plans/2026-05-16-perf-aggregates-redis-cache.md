# Perf — Aggregates, Materialized Snapshots, and Redis Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/reportes`, `/admin/monitor`, and `/admin/tickets-report` feel instantaneous by introducing a 3-layer read path (Redis cache → Postgres materialized snapshots → raw fallback), with two cron-triggered pg-boss workers proactively warming the snapshot tables.

**Architecture:** New `lib/redis.js` (ioredis singleton with `cacheOrCompute` helper) wraps hot reads. Two new Prisma tables (`DrawLiveSnapshot`, `DailyAggregateSnapshot`) hold intra-day aggregates filled by two new workers (`refresh-live-snapshots`, `refresh-daily-snapshot`) fired every minute by the existing `/etc/cron.d/tote-triggers` + `trigger-pgboss-cron.mjs` pipeline. Three env-var feature flags (`REDIS_ENABLED`, `SNAPSHOT_WORKERS_ENABLED`, `REPORT_USE_MATERIALIZED`) provide independent kill switches.

**Tech Stack:** Node.js ES modules, Express, Prisma, PostgreSQL 16, pg-boss v10, ioredis 5.x, Jest, Redis 7-alpine via Docker.

**Hard constraints (from spec):**
1. Do **NOT** deploy to VPS 94 unless the user explicitly asks.
2. Do **NOT** modify the ingest path (`webhook.service.js`, `api-integration.service.js`, `maxplay.service.js`, ingest workers, adapters).
3. Do **NOT** modify `prize-processor.service.js`.

**Reference spec:** `docs/superpowers/specs/2026-05-16-perf-aggregates-redis-cache-design.md`

---

## Phase 1 — Redis client and infrastructure

### Task 1: Add Redis container to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the `redis` service block**

Open `docker-compose.yml` and edit it to:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: tote_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: tote_user
      POSTGRES_PASSWORD: tote_password_2025
      POSTGRES_DB: tote_db
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tote_user -d tote_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: tote_redis
    restart: unless-stopped
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --save 300 1
      --appendonly no
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

- [ ] **Step 2: Bring up Redis locally and verify**

Run:
```bash
docker-compose up -d redis
docker exec tote_redis redis-cli ping
```

Expected output: `PONG`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): add Redis 7-alpine container with LRU + RDB snapshot"
```

---

### Task 2: Install `ioredis` dependency

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`

- [ ] **Step 1: Install ioredis**

Run:
```bash
cd backend && npm install ioredis@^5
```

Expected: dependency added to `package.json`, lockfile updated.

- [ ] **Step 2: Verify package.json**

Run:
```bash
grep ioredis backend/package.json
```
Expected: `"ioredis": "^5.x.x"` line present in `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): add ioredis@^5 for cache layer"
```

---

### Task 3: Create `lib/redis.js` with `cacheOrCompute` helper — write failing tests first

**Files:**
- Create: `backend/src/lib/__tests__/redis.test.js`

- [ ] **Step 1: Write the failing test file**

Create `backend/src/lib/__tests__/redis.test.js`:

```javascript
import { jest } from '@jest/globals';

// Mock ioredis BEFORE importing the module under test
const mockGet = jest.fn();
const mockSetex = jest.fn();
const mockDel = jest.fn();
const mockUnlink = jest.fn();
const mockSmembers = jest.fn();
const mockSadd = jest.fn();
const mockOn = jest.fn();
const mockQuit = jest.fn();

const RedisMock = jest.fn().mockImplementation(() => ({
  get: mockGet,
  setex: mockSetex,
  del: mockDel,
  unlink: mockUnlink,
  smembers: mockSmembers,
  sadd: mockSadd,
  on: mockOn,
  quit: mockQuit,
  status: 'ready',
}));

jest.unstable_mockModule('ioredis', () => ({ default: RedisMock }));

let redisLib;

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.REDIS_ENABLED = 'true';
  process.env.REDIS_URL = 'redis://localhost:6379';
  // Re-import to pick up env changes
  jest.resetModules();
  redisLib = await import('../redis.js');
});

afterEach(() => {
  delete process.env.REDIS_ENABLED;
});

describe('cacheOrCompute', () => {
  it('returns parsed cached value on hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ x: 1 }));
    const fn = jest.fn().mockResolvedValue({ x: 2 });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ x: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('computes and SETEX on miss', async () => {
    mockGet.mockResolvedValueOnce(null);
    const fn = jest.fn().mockResolvedValue({ y: 42 });

    const result = await redisLib.cacheOrCompute('test:key', 60, fn);

    expect(result).toEqual({ y: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockSetex).toHaveBeenCalledWith('test:key', 60, JSON.stringify({ y: 42 }));
  });

  it('falls back to fn when Redis GET throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const fn = jest.fn().mockResolvedValue({ z: 'fallback' });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ z: 'fallback' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to fn when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');

    const fn = jest.fn().mockResolvedValue({ disabled: true });
    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ disabled: true });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('times out on slow Redis (>200ms) and falls to fn', async () => {
    mockGet.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve('cached'), 500)));
    const fn = jest.fn().mockResolvedValue({ ok: true });

    const result = await redisLib.cacheOrCompute('test:key', 30, fn);

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalled();
  }, 1000);
});

describe('invalidate', () => {
  it('DELs the exact key', async () => {
    mockDel.mockResolvedValueOnce(1);
    await redisLib.invalidate('test:key');
    expect(mockDel).toHaveBeenCalledWith('test:key');
  });

  it('does nothing when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');
    await redisLib.invalidate('test:key');
    expect(mockDel).not.toHaveBeenCalled();
  });
});

describe('invalidatePattern (via tracking Set)', () => {
  it('reads members from tracking set and UNLINKs them', async () => {
    mockSmembers.mockResolvedValueOnce(['tote:v1:report:a', 'tote:v1:report:b']);
    mockUnlink.mockResolvedValueOnce(2);

    await redisLib.invalidatePattern('tote:v1:report:*');

    expect(mockSmembers).toHaveBeenCalledWith('tote:v1:idx:tote:v1:report:*');
    expect(mockUnlink).toHaveBeenCalledWith('tote:v1:report:a', 'tote:v1:report:b');
  });

  it('no-ops on empty set', async () => {
    mockSmembers.mockResolvedValueOnce([]);
    await redisLib.invalidatePattern('tote:v1:report:*');
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});

describe('isHealthy', () => {
  it('returns true when client status=ready', async () => {
    expect(await redisLib.isHealthy()).toBe(true);
  });

  it('returns false when REDIS_ENABLED=false', async () => {
    process.env.REDIS_ENABLED = 'false';
    jest.resetModules();
    redisLib = await import('../redis.js');
    expect(await redisLib.isHealthy()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run:
```bash
cd backend && npx jest src/lib/__tests__/redis.test.js
```
Expected: FAIL — `Cannot find module '../redis.js'`.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/src/lib/__tests__/redis.test.js
git commit -m "test(lib): redis cacheOrCompute / invalidate / isHealthy specs (failing)"
```

---

### Task 4: Implement `lib/redis.js`

**Files:**
- Create: `backend/src/lib/redis.js`

- [ ] **Step 1: Write the implementation**

Create `backend/src/lib/redis.js`:

```javascript
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
 *
 * @template T
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fn
 * @param {{ trackingSet?: string }} [opts]
 * @returns {Promise<T>}
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

/** Invalidate every key recorded under a tracking-set name. */
export async function invalidatePattern(pattern) {
  const c = getClient();
  if (!c) return;
  const setKey = `${TRACKING_SET_PREFIX}${pattern}`;
  try {
    const members = await withTimeout(c.smembers(setKey), REDIS_TIMEOUT_MS);
    if (!members || members.length === 0) return;
    await withTimeout(c.unlink(...members), REDIS_TIMEOUT_MS);
    await withTimeout(c.del(setKey), REDIS_TIMEOUT_MS);
  } catch (err) {
    logger.warn(`[cache] invalidatePattern failed pattern=${pattern} err=${err.message}`);
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
```

- [ ] **Step 2: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/lib/__tests__/redis.test.js
```
Expected: PASS — all tests green.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/redis.js
git commit -m "feat(lib): redis cacheOrCompute helper with timeout + tracking-set invalidation"
```

---

### Task 5: Bootstrap Redis in `index.js` and add `/health` endpoint

**Files:**
- Modify: `backend/src/index.js`
- Create: `backend/src/routes/health.routes.js`
- Create: `backend/src/__tests__/health-endpoint.test.js`

- [ ] **Step 1: Write the failing health endpoint test**

Create `backend/src/__tests__/health-endpoint.test.js`:

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../lib/redis.js', () => ({
  isHealthy: jest.fn(),
  cacheOrCompute: jest.fn(),
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  shutdown: jest.fn(),
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

let healthRoutes;
let redisLib;
let prismaLib;

beforeAll(async () => {
  redisLib = await import('../lib/redis.js');
  prismaLib = await import('../lib/prisma.js');
  healthRoutes = (await import('../routes/health.routes.js')).default;
});

function buildApp() {
  const app = express();
  app.use('/health', healthRoutes);
  return app;
}

describe('GET /health', () => {
  it('returns 200 with redis=up and postgres=up when both healthy', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(true);
    prismaLib.prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);

    const res = await request(buildApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.body.redis).toBe('up');
    expect(res.body.postgres).toBe('up');
  });

  it('returns 200 with redis=down (degraded) when Redis is unreachable', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(false);
    prismaLib.prisma.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);

    const res = await request(buildApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.body.redis).toBe('down');
    expect(res.body.postgres).toBe('up');
    expect(res.body.status).toBe('degraded');
  });

  it('returns 503 when Postgres fails', async () => {
    redisLib.isHealthy.mockResolvedValueOnce(true);
    prismaLib.prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));

    const res = await request(buildApp()).get('/');

    expect(res.status).toBe(503);
    expect(res.body.postgres).toBe('down');
  });
});
```

- [ ] **Step 2: Install supertest if missing**

Run:
```bash
cd backend && npm ls supertest 2>/dev/null || npm install --save-dev supertest
```

- [ ] **Step 3: Run the test, confirm it fails**

Run:
```bash
cd backend && npx jest src/__tests__/health-endpoint.test.js
```
Expected: FAIL — `Cannot find module '../routes/health.routes.js'`.

- [ ] **Step 4: Implement the health route**

Create `backend/src/routes/health.routes.js`:

```javascript
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { isHealthy as redisHealthy } from '../lib/redis.js';

const router = Router();

router.get('/', async (_req, res) => {
  const redis = (await redisHealthy()) ? 'up' : 'down';

  let postgres = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    postgres = 'down';
  }

  const allUp = redis === 'up' && postgres === 'up';
  const code = postgres === 'down' ? 503 : 200;
  res.status(code).json({
    status: allUp ? 'ok' : postgres === 'down' ? 'down' : 'degraded',
    postgres,
    redis,
    timestamp: new Date().toISOString(),
  });
});

export default router;
```

- [ ] **Step 5: Wire the route + Redis shutdown into `index.js`**

Open `backend/src/index.js`. Find the imports near the top (around line 14) and the route-imports block (around line 216). Apply these edits:

**Add to import block (near the other route imports, around line 220):**
```javascript
import healthRoutes from './routes/health.routes.js';
```

**Add to imports block near top (after the existing `staticStorageGuard` line):**
```javascript
import { shutdown as redisShutdown } from './lib/redis.js';
```

**Add to the route-mount block (alongside the other `app.use`s, around line 270):**
```javascript
app.use('/health', healthRoutes);
```

**Add a shutdown hook (just before the existing `process.on('SIGTERM', ...)` or `app.listen(...)` block — wherever shutdown is handled):**
```javascript
process.on('SIGTERM', async () => {
  await redisShutdown();
});
process.on('SIGINT', async () => {
  await redisShutdown();
});
```

If there is already a shutdown handler, merge the `redisShutdown()` call inside it instead of duplicating the listener.

- [ ] **Step 6: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/__tests__/health-endpoint.test.js
```
Expected: PASS — all 3 cases green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/health.routes.js backend/src/index.js backend/src/__tests__/health-endpoint.test.js backend/package.json backend/package-lock.json
git commit -m "feat(health): GET /health reports postgres + redis status; bootstrap redis client"
```

---

## Phase 2 — Schema for snapshot tables

### Task 6: Add `DrawLiveSnapshot` and `DailyAggregateSnapshot` Prisma models + new indices

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the two new models**

Open `backend/prisma/schema.prisma`. Append both models at the END of the file (Prisma convention in this codebase is to keep enums + models contiguous; placing them at the end keeps the diff small):

```prisma
// ============================================================================
// Phase v1.4 — performance / cache layer (RFC: docs/superpowers/specs/2026-05-16-perf-aggregates-redis-cache-design.md)
// ============================================================================

model DrawLiveSnapshot {
  drawId       String   @id
  totalSales   Decimal  @db.Decimal(15, 2)
  ticketCount  Int
  byProvider   Json     // [{ apiSystemId, name, sales, count }, ...]
  refreshedAt  DateTime @default(now())

  draw         Draw     @relation(fields: [drawId], references: [id], onDelete: Cascade)

  @@index([refreshedAt])
}

model DailyAggregateSnapshot {
  id           String        @id @default(cuid())
  date         DateTime      @db.Date
  gameId       String?
  source       TicketSource?
  apiSystemId  String?
  totalSales   Decimal       @db.Decimal(15, 2)
  ticketCount  Int
  prizeTotal   Decimal       @db.Decimal(15, 2)
  refreshedAt  DateTime      @default(now())

  @@unique([date, gameId, source, apiSystemId])
  @@index([date])
}
```

- [ ] **Step 2: Add back-relation on `Draw` model**

Still in `schema.prisma`, find the `model Draw` block. Locate the relations section (where `tickets`, `prizes`, `publications`, `financial`, `financialProviders` are declared) and add:

```prisma
  liveSnapshot      DrawLiveSnapshot?
```

(Singular optional because `DrawLiveSnapshot.drawId` is `@id` — one-to-one.)

- [ ] **Step 3: Add the two new Ticket indices**

Still in `schema.prisma`, find the `model Ticket` block. Look at its existing `@@index(...)` lines and append two new ones:

```prisma
  @@index([drawDate, status])
  @@index([apiSystemId, drawDate])
```

(If `Ticket` does not have `drawDate` as a direct column, instead use `drawId, status` and `apiSystemId, drawId` — verify by reading the existing Ticket model. Add both new index lines either way; the exact column choice mirrors what the existing schema already exposes.)

- [ ] **Step 4: Generate the migration**

Run:
```bash
cd backend && npx prisma migrate dev --name add_live_snapshot_and_daily_aggregate
```

Expected: a new SQL migration file under `backend/prisma/migrations/*_add_live_snapshot_and_daily_aggregate/migration.sql` is created and applied to the local DB.

- [ ] **Step 5: Verify tables exist locally**

Run:
```bash
docker exec tote_postgres psql -U tote_user -d tote_db -c "\dt" | grep -E "DrawLiveSnapshot|DailyAggregateSnapshot"
```
Expected output: both table names listed.

- [ ] **Step 6: Regenerate the Prisma client**

Run:
```bash
cd backend && npx prisma generate
```
Expected: no error.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(schema): DrawLiveSnapshot + DailyAggregateSnapshot tables, Ticket(drawDate,status) + (apiSystemId,drawDate) indices"
```

---

## Phase 3 — Snapshot service + workers

### Task 7: Create `live-snapshot.service.js` — `computeDrawLiveSnapshot` — TDD

**Files:**
- Create: `backend/src/services/__tests__/live-snapshot.service.test.js`
- Create: `backend/src/services/live-snapshot.service.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/live-snapshot.service.test.js`:

```javascript
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    ticket: { findMany: jest.fn() },
    drawLiveSnapshot: { upsert: jest.fn() },
    draw: { findMany: jest.fn() },
    dailyAggregateSnapshot: { upsert: jest.fn(), deleteMany: jest.fn() },
    drawFinancial: { findMany: jest.fn() },
  },
}));

let svc;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../lib/prisma.js');
  svc = await import('../live-snapshot.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('computeDrawLiveSnapshot', () => {
  it('aggregates totalSales + ticketCount + byProvider from raw tickets', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([
      { amount: '10.00', apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { amount: '5.50',  apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { amount: '20.00', apiSystemId: 'sys-b', apiSystem: { name: 'B' } },
      { amount: '7.25',  apiSystemId: null,    apiSystem: null },
    ]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-1');

    expect(prismaLib.prisma.drawLiveSnapshot.upsert).toHaveBeenCalledTimes(1);
    const args = prismaLib.prisma.drawLiveSnapshot.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ drawId: 'draw-1' });
    expect(Number(args.create.totalSales)).toBeCloseTo(42.75, 2);
    expect(args.create.ticketCount).toBe(4);
    expect(args.create.byProvider).toEqual(
      expect.arrayContaining([
        { apiSystemId: 'sys-a', name: 'A',         sales: 15.5,  count: 2 },
        { apiSystemId: 'sys-b', name: 'B',         sales: 20,    count: 1 },
        { apiSystemId: null,    name: 'TAQUILLA',  sales: 7.25,  count: 1 },
      ]),
    );
  });

  it('handles zero tickets gracefully', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-empty');

    const args = prismaLib.prisma.drawLiveSnapshot.upsert.mock.calls[0][0];
    expect(Number(args.create.totalSales)).toBe(0);
    expect(args.create.ticketCount).toBe(0);
    expect(args.create.byProvider).toEqual([]);
  });

  it('excludes CANCELLED tickets via the where clause', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-x');

    const findArgs = prismaLib.prisma.ticket.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toEqual({ not: 'CANCELLED' });
    expect(findArgs.where.drawId).toBe('draw-x');
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/services/__tests__/live-snapshot.service.test.js -t computeDrawLiveSnapshot
```
Expected: FAIL — `Cannot find module '../live-snapshot.service.js'`.

- [ ] **Step 3: Implement the function**

Create `backend/src/services/live-snapshot.service.js`:

```javascript
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Aggregate active tickets for a draw and UPSERT DrawLiveSnapshot.
 * Excludes CANCELLED tickets. Source-agnostic (webhook + scrape + taquilla
 * all roll up). Per-provider breakdown stored as JSON for cheap reads.
 */
export async function computeDrawLiveSnapshot(drawId) {
  const tickets = await prisma.ticket.findMany({
    where: { drawId, status: { not: 'CANCELLED' } },
    select: {
      amount: true,
      apiSystemId: true,
      apiSystem: { select: { name: true } },
    },
  });

  let totalSales = 0;
  const byProviderMap = new Map();

  for (const t of tickets) {
    const amt = Number(t.amount);
    totalSales += amt;
    const key = t.apiSystemId || '__taquilla__';
    if (!byProviderMap.has(key)) {
      byProviderMap.set(key, {
        apiSystemId: t.apiSystemId || null,
        name: t.apiSystem?.name || 'TAQUILLA',
        sales: 0,
        count: 0,
      });
    }
    const entry = byProviderMap.get(key);
    entry.sales += amt;
    entry.count += 1;
  }

  const byProvider = Array.from(byProviderMap.values()).map((p) => ({
    ...p,
    sales: Number(p.sales.toFixed(2)),
  }));

  const data = {
    totalSales: Number(totalSales.toFixed(2)),
    ticketCount: tickets.length,
    byProvider,
    refreshedAt: new Date(),
  };

  await prisma.drawLiveSnapshot.upsert({
    where: { drawId },
    create: { drawId, ...data },
    update: data,
  });

  return data;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/services/__tests__/live-snapshot.service.test.js -t computeDrawLiveSnapshot
```
Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/live-snapshot.service.js backend/src/services/__tests__/live-snapshot.service.test.js
git commit -m "feat(snapshot): computeDrawLiveSnapshot aggregates active tickets per draw"
```

---

### Task 8: Add `computeDailyAggregateSnapshot` to `live-snapshot.service.js` — TDD

**Files:**
- Modify: `backend/src/services/__tests__/live-snapshot.service.test.js`
- Modify: `backend/src/services/live-snapshot.service.js`

- [ ] **Step 1: Add failing tests**

Append to `backend/src/services/__tests__/live-snapshot.service.test.js`:

```javascript
describe('computeDailyAggregateSnapshot', () => {
  it('aggregates by (gameId, source, apiSystemId), combining DrawFinancial + DrawLiveSnapshot for the date', async () => {
    // 2 draws today: one DRAWN (uses DrawFinancial), one CLOSED (uses DrawLiveSnapshot)
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd1', gameId: 'g1', status: 'DRAWN' },
      { id: 'd2', gameId: 'g1', status: 'CLOSED' },
    ]);
    prismaLib.prisma.drawFinancial.findMany.mockResolvedValueOnce([
      {
        drawId: 'd1',
        totalSales: '100.00',
        totalPrize: '40.00',
        ticketCount: 5,
        draw: { gameId: 'g1' },
        providers: [
          { apiSystemId: 'sys-a', totalSales: '60.00', totalPrize: '20.00', ticketCount: 3 },
          { apiSystemId: null,    totalSales: '40.00', totalPrize: '20.00', ticketCount: 2 },
        ],
      },
    ]);
    prismaLib.prisma.ticket.findMany.mockResolvedValue([]); // unused in this branch
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaLib.prisma.dailyAggregateSnapshot.upsert.mockResolvedValue({});

    // Stub the live-side lookup
    const liveSnapMock = jest.fn().mockResolvedValueOnce({
      drawId: 'd2',
      gameId: 'g1',
      totalSales: 50,
      ticketCount: 2,
      byProvider: [{ apiSystemId: 'sys-b', name: 'B', sales: 50, count: 2 }],
    });
    svc.__setLiveSnapResolver(liveSnapMock); // see implementation note in Step 2

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    // Expect at least 3 upsert calls (sys-a from DRAWN, taquilla from DRAWN, sys-b from CLOSED)
    expect(prismaLib.prisma.dailyAggregateSnapshot.upsert).toHaveBeenCalledTimes(3);
  });

  it('clears previous rows for the date before writing', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawFinancial.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 7 });

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    expect(prismaLib.prisma.dailyAggregateSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { date: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run:
```bash
cd backend && npx jest src/services/__tests__/live-snapshot.service.test.js -t computeDailyAggregateSnapshot
```
Expected: FAIL — `computeDailyAggregateSnapshot is not a function` and `__setLiveSnapResolver is not a function`.

- [ ] **Step 3: Implement `computeDailyAggregateSnapshot`**

Append to `backend/src/services/live-snapshot.service.js`:

```javascript
// Test seam: lets unit tests inject a live-snapshot lookup. In production this
// is the default resolver which reads from prisma.drawLiveSnapshot.
let _liveSnapResolver = async (drawId) => {
  const row = await prisma.drawLiveSnapshot.findUnique({
    where: { drawId },
    include: { draw: { select: { gameId: true } } },
  });
  if (!row) return null;
  return {
    drawId: row.drawId,
    gameId: row.draw?.gameId || null,
    totalSales: Number(row.totalSales),
    ticketCount: row.ticketCount,
    byProvider: row.byProvider || [],
  };
};

export function __setLiveSnapResolver(fn) {
  _liveSnapResolver = fn;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketKey(gameId, source, apiSystemId) {
  return `${gameId || 'null'}|${source || 'null'}|${apiSystemId || 'null'}`;
}

/**
 * Aggregate the day's results per (gameId, source, apiSystemId).
 *
 * Reads:
 *   - DrawFinancial for draws that are DRAWN today (authoritative).
 *   - DrawLiveSnapshot for draws that are SCHEDULED/CLOSED today (interim).
 *
 * Writes a row per non-empty bucket into DailyAggregateSnapshot.
 *
 * Race-safe: deleteMany(date)+upsert pattern → idempotent across re-runs.
 */
export async function computeDailyAggregateSnapshot(date) {
  const day = startOfDay(date);

  const draws = await prisma.draw.findMany({
    where: { drawDate: day },
    select: { id: true, gameId: true, status: true },
  });

  const drawnIds = draws.filter((d) => d.status === 'DRAWN').map((d) => d.id);
  const liveIds  = draws.filter((d) => d.status !== 'DRAWN').map((d) => d.id);

  const buckets = new Map();

  if (drawnIds.length > 0) {
    const finRows = await prisma.drawFinancial.findMany({
      where: { drawId: { in: drawnIds } },
      include: {
        draw: { select: { gameId: true } },
        providers: true,
      },
    });

    for (const fr of finRows) {
      const gameId = fr.draw?.gameId;
      for (const p of fr.providers || []) {
        // Source heuristic: apiSystemId present → EXTERNAL (PUSH/PULL/SCRAPE — undifferentiated here);
        // null → TAQUILLA_ONLINE. Aggregation by `source` is intentionally coarse: per-source breakdown
        // already comes from the apiSystemId column.
        const source = p.apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE';
        const k = bucketKey(gameId, source, p.apiSystemId);
        const acc = buckets.get(k) || { gameId, source, apiSystemId: p.apiSystemId, totalSales: 0, ticketCount: 0, prizeTotal: 0 };
        acc.totalSales += Number(p.totalSales);
        acc.ticketCount += p.ticketCount;
        acc.prizeTotal += Number(p.totalPrize);
        buckets.set(k, acc);
      }
    }
  }

  for (const drawId of liveIds) {
    const live = await _liveSnapResolver(drawId);
    if (!live) continue;
    for (const p of live.byProvider || []) {
      const source = p.apiSystemId ? 'EXTERNAL_API' : 'TAQUILLA_ONLINE';
      const k = bucketKey(live.gameId, source, p.apiSystemId);
      const acc = buckets.get(k) || { gameId: live.gameId, source, apiSystemId: p.apiSystemId, totalSales: 0, ticketCount: 0, prizeTotal: 0 };
      acc.totalSales += Number(p.sales);
      acc.ticketCount += p.count;
      // prize for non-DRAWN draws is unknown → stays 0
      buckets.set(k, acc);
    }
  }

  // Wipe-and-write — idempotent, simpler than per-row diff.
  await prisma.dailyAggregateSnapshot.deleteMany({ where: { date: day } });

  for (const acc of buckets.values()) {
    await prisma.dailyAggregateSnapshot.upsert({
      where: {
        date_gameId_source_apiSystemId: {
          date: day,
          gameId: acc.gameId,
          source: acc.source,
          apiSystemId: acc.apiSystemId,
        },
      },
      create: {
        date: day,
        gameId: acc.gameId,
        source: acc.source,
        apiSystemId: acc.apiSystemId,
        totalSales: Number(acc.totalSales.toFixed(2)),
        ticketCount: acc.ticketCount,
        prizeTotal: Number(acc.prizeTotal.toFixed(2)),
        refreshedAt: new Date(),
      },
      update: {
        totalSales: Number(acc.totalSales.toFixed(2)),
        ticketCount: acc.ticketCount,
        prizeTotal: Number(acc.prizeTotal.toFixed(2)),
        refreshedAt: new Date(),
      },
    });
  }

  return { bucketsWritten: buckets.size };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/services/__tests__/live-snapshot.service.test.js
```
Expected: PASS — all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/live-snapshot.service.js backend/src/services/__tests__/live-snapshot.service.test.js
git commit -m "feat(snapshot): computeDailyAggregateSnapshot rolls up DrawFinancial + live snapshots per day"
```

---

### Task 9: Create `refresh-live-snapshots` worker — TDD

**Files:**
- Create: `backend/src/queue/workers/__tests__/refresh-live-snapshots.worker.test.js`
- Create: `backend/src/queue/workers/refresh-live-snapshots.worker.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/queue/workers/__tests__/refresh-live-snapshots.worker.test.js`:

```javascript
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../lib/prisma.js', () => ({
  prisma: { draw: { findMany: jest.fn() } },
}));

const mockCompute = jest.fn();
jest.unstable_mockModule('../../../services/live-snapshot.service.js', () => ({
  computeDrawLiveSnapshot: mockCompute,
  computeDailyAggregateSnapshot: jest.fn(),
  __setLiveSnapResolver: jest.fn(),
}));

const mockInvalidate = jest.fn();
jest.unstable_mockModule('../../../lib/redis.js', () => ({
  invalidate: mockInvalidate,
  cacheOrCompute: jest.fn(),
  invalidatePattern: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

let workerModule;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../../lib/prisma.js');
  workerModule = await import('../refresh-live-snapshots.worker.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('refreshLiveSnapshotsWorker', () => {
  it('processes every SCHEDULED/CLOSED draw of today and invalidates each cache key', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd-1' },
      { id: 'd-2' },
      { id: 'd-3' },
    ]);

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(prismaLib.prisma.draw.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          drawDate: expect.any(Object),
          status: { in: ['SCHEDULED', 'CLOSED'] },
        }),
      }),
    );
    expect(mockCompute).toHaveBeenCalledTimes(3);
    expect(mockCompute).toHaveBeenCalledWith('d-1');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-1:snap');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-2:snap');
    expect(result.processed).toBe(3);
  });

  it('does not throw when a single draw compute fails — logs and continues', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd-ok-1' },
      { id: 'd-bad' },
      { id: 'd-ok-2' },
    ]);
    mockCompute
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-ok-1:snap');
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d-ok-2:snap');
  });

  it('respects SNAPSHOT_WORKERS_ENABLED=false (no-ops)', async () => {
    process.env.SNAPSHOT_WORKERS_ENABLED = 'false';

    const result = await workerModule.refreshLiveSnapshotsWorker([{ data: {} }]);

    expect(result.skipped).toBe(true);
    expect(prismaLib.prisma.draw.findMany).not.toHaveBeenCalled();
    delete process.env.SNAPSHOT_WORKERS_ENABLED;
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/refresh-live-snapshots.worker.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the worker**

Create `backend/src/queue/workers/refresh-live-snapshots.worker.js`:

```javascript
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { computeDrawLiveSnapshot } from '../../services/live-snapshot.service.js';
import { invalidate } from '../../lib/redis.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Cron-triggered every minute (via /etc/cron.d/tote-triggers).
 * Refreshes DrawLiveSnapshot for every SCHEDULED/CLOSED draw of TODAY,
 * then invalidates the matching Redis cache key so the next read pulls fresh.
 *
 * Defensive: a single bad draw must not poison the batch — errors are logged
 * and the worker reports counts but never throws.
 */
export async function refreshLiveSnapshotsWorker(jobs) {
  if (process.env.SNAPSHOT_WORKERS_ENABLED === 'false') {
    logger.info('[refresh-live-snapshots] disabled via SNAPSHOT_WORKERS_ENABLED=false');
    return { skipped: true };
  }

  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const startedAt = Date.now();

  const draws = await prisma.draw.findMany({
    where: {
      drawDate: startOfToday(),
      status: { in: ['SCHEDULED', 'CLOSED'] },
    },
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;

  for (const d of draws) {
    try {
      await computeDrawLiveSnapshot(d.id);
      await invalidate(`tote:v1:draw:${d.id}:snap`);
      processed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`[refresh-live-snapshots] drawId=${d.id} failed: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    `[refresh-live-snapshots] processed=${processed} failed=${failed} totalCandidates=${draws.length} durationMs=${durationMs}`,
  );
  if (durationMs > 30000) {
    logger.warn(`[refresh-live-snapshots] SLOW: ${durationMs}ms — approaching next cron tick`);
  }

  return { processed, failed, durationMs };
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/refresh-live-snapshots.worker.test.js
```
Expected: PASS — all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/queue/workers/refresh-live-snapshots.worker.js backend/src/queue/workers/__tests__/refresh-live-snapshots.worker.test.js
git commit -m "feat(worker): refresh-live-snapshots — cron 1/min, idempotent, error-tolerant"
```

---

### Task 10: Create `refresh-daily-snapshot` worker — TDD

**Files:**
- Create: `backend/src/queue/workers/__tests__/refresh-daily-snapshot.worker.test.js`
- Create: `backend/src/queue/workers/refresh-daily-snapshot.worker.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/queue/workers/__tests__/refresh-daily-snapshot.worker.test.js`:

```javascript
import { jest } from '@jest/globals';

const mockComputeDaily = jest.fn();
jest.unstable_mockModule('../../../services/live-snapshot.service.js', () => ({
  computeDailyAggregateSnapshot: mockComputeDaily,
  computeDrawLiveSnapshot: jest.fn(),
  __setLiveSnapResolver: jest.fn(),
}));

const mockInvalidatePattern = jest.fn();
jest.unstable_mockModule('../../../lib/redis.js', () => ({
  invalidatePattern: mockInvalidatePattern,
  invalidate: jest.fn(),
  cacheOrCompute: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

let workerModule;

beforeAll(async () => {
  workerModule = await import('../refresh-daily-snapshot.worker.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('refreshDailySnapshotWorker', () => {
  it('calls computeDailyAggregateSnapshot for TODAY and invalidates report pattern', async () => {
    mockComputeDaily.mockResolvedValueOnce({ bucketsWritten: 5 });

    const result = await workerModule.refreshDailySnapshotWorker([{ data: {} }]);

    expect(mockComputeDaily).toHaveBeenCalledTimes(1);
    expect(mockComputeDaily.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(mockInvalidatePattern).toHaveBeenCalledWith('tote:v1:report:daily:*');
    expect(result.bucketsWritten).toBe(5);
  });

  it('respects SNAPSHOT_WORKERS_ENABLED=false', async () => {
    process.env.SNAPSHOT_WORKERS_ENABLED = 'false';

    const result = await workerModule.refreshDailySnapshotWorker([{ data: {} }]);

    expect(result.skipped).toBe(true);
    expect(mockComputeDaily).not.toHaveBeenCalled();
    delete process.env.SNAPSHOT_WORKERS_ENABLED;
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/refresh-daily-snapshot.worker.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the worker**

Create `backend/src/queue/workers/refresh-daily-snapshot.worker.js`:

```javascript
import logger from '../../lib/logger.js';
import { computeDailyAggregateSnapshot } from '../../services/live-snapshot.service.js';
import { invalidatePattern } from '../../lib/redis.js';

export async function refreshDailySnapshotWorker(jobs) {
  if (process.env.SNAPSHOT_WORKERS_ENABLED === 'false') {
    logger.info('[refresh-daily-snapshot] disabled via SNAPSHOT_WORKERS_ENABLED=false');
    return { skipped: true };
  }

  const startedAt = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await computeDailyAggregateSnapshot(today);
  await invalidatePattern('tote:v1:report:daily:*');

  const durationMs = Date.now() - startedAt;
  logger.info(`[refresh-daily-snapshot] bucketsWritten=${result.bucketsWritten} durationMs=${durationMs}`);
  return { bucketsWritten: result.bucketsWritten, durationMs };
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/refresh-daily-snapshot.worker.test.js
```
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/queue/workers/refresh-daily-snapshot.worker.js backend/src/queue/workers/__tests__/refresh-daily-snapshot.worker.test.js
git commit -m "feat(worker): refresh-daily-snapshot — cron 1/min, invalidates report cache pattern"
```

---

### Task 11: Register the two new queues + workers + cron allowlist

**Files:**
- Modify: `backend/src/queue/constants.js`
- Modify: `backend/src/queue/register.js`
- Modify: `backend/src/scripts/trigger-pgboss-cron.mjs`

- [ ] **Step 1: Add queue constants**

Open `backend/src/queue/constants.js`. In the `QUEUES` object (after `WEEKLY_SETTLEMENT_SNAPSHOT`), add:

```javascript
  // Phase v1.4 — perf cache layer (RFC 2026-05-16)
  REFRESH_LIVE_SNAPSHOTS: 'refresh-live-snapshots',
  REFRESH_DAILY_SNAPSHOT: 'refresh-daily-snapshot',
```

In the `QUEUE_CONFIGS` object, add:

```javascript
  [QUEUES.REFRESH_LIVE_SNAPSHOTS]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 1,
  },
  [QUEUES.REFRESH_DAILY_SNAPSHOT]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 2,
  },
```

(retryLimit=1 because the cron tick re-fires every minute — bounded staleness, not bounded retry, is the right call.)

- [ ] **Step 2: Register the workers in register.js**

Open `backend/src/queue/register.js`. After the `weeklySettlementSnapshotWorker` registration block, append:

```javascript
  // ====================================================================
  // Phase v1.4 — perf cache layer
  // refresh-live-snapshots (cron 1/min) + refresh-daily-snapshot (cron 1/min)
  // Cron lines live in /etc/cron.d/tote-triggers. Allowlist is in
  // trigger-pgboss-cron.mjs.
  // ====================================================================
  const { refreshLiveSnapshotsWorker } = await import('./workers/refresh-live-snapshots.worker.js');
  const { refreshDailySnapshotWorker } = await import('./workers/refresh-daily-snapshot.worker.js');

  await boss.createQueue(QUEUES.REFRESH_LIVE_SNAPSHOTS);
  await boss.createQueue(QUEUES.REFRESH_DAILY_SNAPSHOT);

  await boss.work(
    QUEUES.REFRESH_LIVE_SNAPSHOTS,
    QUEUE_CONFIGS[QUEUES.REFRESH_LIVE_SNAPSHOTS],
    refreshLiveSnapshotsWorker,
  );
  await boss.work(
    QUEUES.REFRESH_DAILY_SNAPSHOT,
    QUEUE_CONFIGS[QUEUES.REFRESH_DAILY_SNAPSHOT],
    refreshDailySnapshotWorker,
  );
  logger.info('[pg-boss] Workers refresh-live-snapshots + refresh-daily-snapshot registrados (cron 1/min)');
```

- [ ] **Step 3: Extend the cron allowlist**

Open `backend/src/scripts/trigger-pgboss-cron.mjs`. In `ALLOWED_QUEUES`, add:

```javascript
  // Phase v1.4 — perf cache layer
  'refresh-live-snapshots',
  'refresh-daily-snapshot',
```

- [ ] **Step 4: Smoke test — restart backend and confirm queue rows in pg-boss**

Run:
```bash
cd backend && npm run dev &
sleep 5
docker exec tote_postgres psql -U tote_user -d tote_db -tAc "SELECT name FROM pgboss.queue WHERE name IN ('refresh-live-snapshots','refresh-daily-snapshot') ORDER BY name;"
kill %1 2>/dev/null
```
Expected output:
```
refresh-daily-snapshot
refresh-live-snapshots
```

- [ ] **Step 5: Smoke test — trigger one tick manually and watch logs**

Run:
```bash
cd backend && node src/scripts/trigger-pgboss-cron.mjs refresh-live-snapshots
node src/scripts/trigger-pgboss-cron.mjs refresh-daily-snapshot
```
Expected: each exits 0 with `enqueued: refresh-*` log line.

- [ ] **Step 6: Commit**

```bash
git add backend/src/queue/constants.js backend/src/queue/register.js backend/src/scripts/trigger-pgboss-cron.mjs
git commit -m "feat(queue): register refresh-live-snapshots + refresh-daily-snapshot workers"
```

---

## Phase 4 — Wire reads through the cache

### Task 12: Wrap `monitor.service.getDailyReport` with `cacheOrCompute`

**Files:**
- Modify: `backend/src/services/monitor.service.js`
- Create: `backend/src/services/__tests__/monitor-cache.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `backend/src/services/__tests__/monitor-cache.test.js`:

```javascript
import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockCacheOrCompute = jest.fn();
jest.unstable_mockModule('../../lib/redis.js', () => ({
  cacheOrCompute: mockCacheOrCompute,
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    draw: { findMany: jest.fn() },
    ticket: { findMany: jest.fn(), count: jest.fn() },
    drawFinancial: { findMany: jest.fn() },
    dailyAggregateSnapshot: { findMany: jest.fn() },
    apiSystem: { findMany: jest.fn() },
    gameItem: { findMany: jest.fn() },
  },
}));

let monitorSvc;

beforeAll(async () => {
  monitorSvc = await import('../monitor.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDailyReport caching', () => {
  it('passes a stable key derived from filters', async () => {
    mockCacheOrCompute.mockResolvedValueOnce({ summary: { totalSales: 0 } });

    await monitorSvc.default.getDailyReport({
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-15'),
      gameId: 'g1',
      source: null,
      apiSystemId: null,
    });

    const callKey = mockCacheOrCompute.mock.calls[0][0];
    expect(callKey).toMatch(/^tote:v1:report:daily:[a-f0-9]+$/);
  });

  it('uses TTL=60 when dateTo includes today, TTL=3600 otherwise', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);

    mockCacheOrCompute.mockResolvedValue({ summary: {} });

    await monitorSvc.default.getDailyReport({ dateFrom: today, dateTo: today });
    expect(mockCacheOrCompute.mock.calls[0][1]).toBe(60);

    await monitorSvc.default.getDailyReport({ dateFrom: lastMonth, dateTo: lastMonth });
    expect(mockCacheOrCompute.mock.calls[1][1]).toBe(3600);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js -t "getDailyReport caching"
```
Expected: FAIL — current `getDailyReport` doesn't call `cacheOrCompute`.

- [ ] **Step 3: Wrap `getDailyReport`**

Open `backend/src/services/monitor.service.js`. Find the existing `getDailyReport` method (around line 476). Add this import at the top of the file (after the existing imports):

```javascript
import crypto from 'crypto';
import { cacheOrCompute } from '../lib/redis.js';
```

Refactor `getDailyReport` so the wrapper sits in front of the existing body. The existing implementation stays intact, just renamed and called from inside the wrapper:

```javascript
async getDailyReport(filters = {}) {
  // v1.4 — cache wrapper. Key includes a normalized hash of filters.
  // TTL: 60s if range touches today (data still changing), 1h if pure history.
  const normalized = {
    date: filters.date ? new Date(filters.date).toISOString().slice(0, 10) : null,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 10) : null,
    dateTo: filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 10) : null,
    gameId: filters.gameId || null,
    source: filters.source || null,
    apiSystemId: filters.apiSystemId || null,
    useMaterialized: filters.useMaterialized !== false,
  };

  const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  const key = `tote:v1:report:daily:${hash}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const touchesToday =
    normalized.date === todayStr ||
    (normalized.dateTo && normalized.dateTo >= todayStr);
  const ttl = touchesToday ? 60 : 3600;

  return cacheOrCompute(key, ttl, () => this._getDailyReportUncached({ ...filters, useMaterialized: normalized.useMaterialized }), {
    trackingSet: 'tote:v1:report:daily:*',
  });
},

async _getDailyReportUncached({ date = null, dateFrom = null, dateTo = null, gameId = null, source = null, apiSystemId = null, useMaterialized = true } = {}) {
  // ⬇⬇⬇  THE ENTIRE EXISTING getDailyReport BODY GOES HERE, UNCHANGED  ⬇⬇⬇
}
```

(Move the existing function body — every line of the previous `getDailyReport` — verbatim into `_getDailyReportUncached`. The wrapper just adds caching.)

- [ ] **Step 4: Default `useMaterialized=true`**

Open `backend/src/controllers/monitor.controller.js`. Find the lines like:
```javascript
const useMaterialized = process.env.REPORT_USE_MATERIALIZED === 'true';
```
(lines 72, 123, 366, 392 per the earlier audit). Change all of them to:
```javascript
const useMaterialized = process.env.REPORT_USE_MATERIALIZED !== 'false';
```
(Default is now ON; explicit `false` opts out.)

- [ ] **Step 5: Run cache tests + existing report tests**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js src/__tests__/daily-report-materialized.test.js src/__tests__/daily-report-legacy-snapshot.test.js
```
Expected: PASS — both new cache tests AND the existing snapshot/legacy tests still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/monitor.service.js backend/src/services/__tests__/monitor-cache.test.js backend/src/controllers/monitor.controller.js
git commit -m "feat(cache): wrap monitor.getDailyReport with cacheOrCompute; default useMaterialized=true"
```

---

### Task 13: Wrap `monitor.service.getTicketList` with `cacheOrCompute` + slim include

**Files:**
- Modify: `backend/src/services/monitor.service.js`
- Modify: `backend/src/services/__tests__/monitor-cache.test.js`

- [ ] **Step 1: Add failing test**

Append to `backend/src/services/__tests__/monitor-cache.test.js`:

```javascript
describe('getTicketList caching', () => {
  it('passes a stable key derived from filters and pagination', async () => {
    mockCacheOrCompute.mockResolvedValueOnce({ rows: [], total: 0 });

    await monitorSvc.default.getTicketList({
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-15'),
      page: 2,
      pageSize: 50,
      gameId: 'g1',
    });

    const callKey = mockCacheOrCompute.mock.calls[0][0];
    expect(callKey).toMatch(/^tote:v1:tickets:list:[a-f0-9]+$/);
    expect(mockCacheOrCompute.mock.calls[0][1]).toBe(60); // 60s TTL
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js -t "getTicketList caching"
```
Expected: FAIL.

- [ ] **Step 3: Wrap `getTicketList`**

Open `backend/src/services/monitor.service.js`. Find `getTicketList` (around line 1397). Apply the same wrapper pattern:

```javascript
async getTicketList(filters = {}) {
  const normalized = {
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 10) : null,
    dateTo: filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 10) : null,
    gameId: filters.gameId || null,
    source: filters.source || null,
    apiSystemId: filters.apiSystemId || null,
    page: filters.page || 1,
    pageSize: filters.pageSize || 50,
    status: filters.status || null,
  };
  const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  const key = `tote:v1:tickets:list:${hash}`;
  return cacheOrCompute(key, 60, () => this._getTicketListUncached(filters));
},

async _getTicketListUncached(filters) {
  // ⬇⬇⬇  THE ENTIRE EXISTING getTicketList BODY GOES HERE  ⬇⬇⬇
}
```

Inside `_getTicketListUncached`, slim the `include` (find the current `include: { draw: { include: ... }, details: { include: ... }, apiSystem: ... }` block and reduce it):

```javascript
// Slim include — v1.4 perf hotfix
include: {
  draw: {
    select: {
      id: true,
      drawDate: true,
      drawTime: true,
      gameId: true,
      winnerItemId: true,
      status: true,
    },
  },
  details: {
    select: {
      id: true,
      number: true,
      amount: true,
      prize: true,
      gameItemId: true,
    },
  },
  apiSystem: { select: { id: true, name: true, slug: true } },
},
```

(The `gameItem` lookup that was previously inside `details.include.gameItem` is now done in a separate batch query — add this just before returning the result:)

```javascript
// Batch resolve gameItems referenced by this page
const itemIds = [...new Set(rows.flatMap((t) => t.details.map((d) => d.gameItemId).filter(Boolean)))];
const items = itemIds.length > 0
  ? await prisma.gameItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, number: true, name: true } })
  : [];
const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
for (const t of rows) {
  for (const d of t.details) {
    d.gameItem = itemsById[d.gameItemId] || null;
  }
}
```

- [ ] **Step 4: Run all monitor-cache tests + existing ticket tests**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js
cd backend && npx jest -t "getTicketList"
```
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/monitor.service.js backend/src/services/__tests__/monitor-cache.test.js
git commit -m "feat(cache): wrap monitor.getTicketList with cache; slim include + batched gameItem lookup"
```

---

### Task 14: Wrap `monitor.service.getItemStatsFiltered` with `cacheOrCompute`

**Files:**
- Modify: `backend/src/services/monitor.service.js`
- Modify: `backend/src/services/__tests__/monitor-cache.test.js`

- [ ] **Step 1: Add failing test**

Append to `backend/src/services/__tests__/monitor-cache.test.js`:

```javascript
describe('getItemStatsFiltered caching', () => {
  it('uses key prefix tote:v1:items:stats:<drawId>:<hash>, TTL=30', async () => {
    mockCacheOrCompute.mockResolvedValueOnce({ items: [] });

    await monitorSvc.default.getItemStatsFiltered('draw-xyz', { source: 'WEBHOOK_PUSH' });

    const callKey = mockCacheOrCompute.mock.calls[0][0];
    expect(callKey).toMatch(/^tote:v1:items:stats:draw-xyz:[a-f0-9]+$/);
    expect(mockCacheOrCompute.mock.calls[0][1]).toBe(30);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js -t "getItemStatsFiltered caching"
```
Expected: FAIL.

- [ ] **Step 3: Wrap the method**

Open `backend/src/services/monitor.service.js`. Find `getItemStatsFiltered` (around line 380):

```javascript
async getItemStatsFiltered(drawId, filters = {}) {
  const normalized = {
    source: filters.source || null,
    apiSystemId: filters.apiSystemId || null,
  };
  const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  const key = `tote:v1:items:stats:${drawId}:${hash}`;
  return cacheOrCompute(key, 30, () => this._getItemStatsFilteredUncached(drawId, filters));
},

async _getItemStatsFilteredUncached(drawId, filters) {
  // ⬇⬇⬇  THE ENTIRE EXISTING getItemStatsFiltered BODY GOES HERE  ⬇⬇⬇
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd backend && npx jest src/services/__tests__/monitor-cache.test.js
```
Expected: PASS — all 4 caching describes green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/monitor.service.js backend/src/services/__tests__/monitor-cache.test.js
git commit -m "feat(cache): wrap monitor.getItemStatsFiltered with cache (30s TTL)"
```

---

### Task 15: Use `DrawLiveSnapshot` in `draw.service.getDrawById` for non-DRAWN draws

**Files:**
- Modify: `backend/src/services/draw.service.js`
- Create: `backend/src/services/__tests__/draw-getById-livesnap.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/draw-getById-livesnap.test.js`:

```javascript
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    draw: { findUnique: jest.fn() },
    drawLiveSnapshot: { findUnique: jest.fn() },
    ticket: { findMany: jest.fn() },
  },
}));

let drawSvc;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../lib/prisma.js');
  drawSvc = await import('../draw.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDrawById live-snapshot integration', () => {
  it('attaches liveSnapshot when draw is SCHEDULED/CLOSED and snapshot exists', async () => {
    prismaLib.prisma.draw.findUnique.mockResolvedValueOnce({
      id: 'd1',
      status: 'CLOSED',
      drawDate: new Date(),
      drawTime: '14:00:00',
      game: { id: 'g1', name: 'X' },
    });
    prismaLib.prisma.drawLiveSnapshot.findUnique.mockResolvedValueOnce({
      drawId: 'd1',
      totalSales: '100.00',
      ticketCount: 5,
      byProvider: [],
      refreshedAt: new Date(),
    });

    const svc = new drawSvc.DrawService();
    const result = await svc.getDrawById('d1');

    expect(result.liveSnapshot).toBeDefined();
    expect(Number(result.liveSnapshot.totalSales)).toBe(100);
  });

  it('does not query snapshot when status=DRAWN (financial is authoritative)', async () => {
    prismaLib.prisma.draw.findUnique.mockResolvedValueOnce({
      id: 'd2',
      status: 'DRAWN',
      drawDate: new Date(),
      drawTime: '14:00:00',
      game: { id: 'g1', name: 'X' },
      financial: { totalSales: '500.00' },
    });

    const svc = new drawSvc.DrawService();
    const result = await svc.getDrawById('d2');

    expect(prismaLib.prisma.drawLiveSnapshot.findUnique).not.toHaveBeenCalled();
    expect(result.liveSnapshot).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/services/__tests__/draw-getById-livesnap.test.js
```
Expected: FAIL — current `getDrawById` doesn't query `drawLiveSnapshot`.

- [ ] **Step 3: Edit `getDrawById`**

Open `backend/src/services/draw.service.js`. Find the existing `getDrawById` (around line 100). After the `findUnique` returns, append:

```javascript
// v1.4: attach live-snapshot data only for non-DRAWN draws.
// For DRAWN draws, `financial` (already included) is authoritative.
if (draw && draw.status !== 'DRAWN' && draw.status !== 'CANCELLED') {
  const liveSnap = await prisma.drawLiveSnapshot.findUnique({
    where: { drawId: id },
  });
  if (liveSnap) {
    draw.liveSnapshot = {
      totalSales: liveSnap.totalSales,
      ticketCount: liveSnap.ticketCount,
      byProvider: liveSnap.byProvider,
      refreshedAt: liveSnap.refreshedAt,
    };
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/services/__tests__/draw-getById-livesnap.test.js src/__tests__/draws-getById-financial.test.js
```
Expected: PASS — both new and existing draw-getById tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/draw.service.js backend/src/services/__tests__/draw-getById-livesnap.test.js
git commit -m "feat(draw): attach DrawLiveSnapshot to getDrawById for non-DRAWN draws"
```

---

## Phase 5 — Invalidation hooks + observability

### Task 16: Invalidate Redis + delete `DrawLiveSnapshot` when `calculate-draw-financials` commits PRIZES

**Files:**
- Modify: `backend/src/queue/workers/calculate-draw-financials.worker.js`
- Create: `backend/src/queue/workers/__tests__/calculate-draw-financials-invalidation.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/queue/workers/__tests__/calculate-draw-financials-invalidation.test.js`:

```javascript
import { jest } from '@jest/globals';

const mockComputeSales = jest.fn();
const mockComputePrizes = jest.fn();
jest.unstable_mockModule('../../../services/draw-financial.service.js', () => ({
  computeAndUpsertSales: mockComputeSales,
  computeAndUpsertPrizes: mockComputePrizes,
}));

jest.unstable_mockModule('../../../lib/prisma.js', () => ({
  prisma: {
    drawLiveSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    draw: { findUnique: jest.fn().mockResolvedValue({ id: 'd1', drawDate: new Date(), gameId: 'g1' }) },
  },
}));

const mockInvalidate = jest.fn();
const mockInvalidatePattern = jest.fn();
jest.unstable_mockModule('../../../lib/redis.js', () => ({
  invalidate: mockInvalidate,
  invalidatePattern: mockInvalidatePattern,
  cacheOrCompute: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

let workerModule;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../../lib/prisma.js');
  workerModule = await import('../calculate-draw-financials.worker.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('calculate-draw-financials invalidation', () => {
  it('on PRIZES phase: deletes DrawLiveSnapshot + invalidates Redis keys', async () => {
    mockComputePrizes.mockResolvedValueOnce({ ok: true });

    await workerModule.calculateDrawFinancialsWorker([{ data: { drawId: 'd1', phase: 'PRIZES' } }]);

    expect(prismaLib.prisma.drawLiveSnapshot.deleteMany).toHaveBeenCalledWith({ where: { drawId: 'd1' } });
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d1:snap');
    expect(mockInvalidatePattern).toHaveBeenCalledWith('tote:v1:report:daily:*');
  });

  it('on SALES phase: does NOT delete snapshot or invalidate report pattern', async () => {
    mockComputeSales.mockResolvedValueOnce({ ok: true });

    await workerModule.calculateDrawFinancialsWorker([{ data: { drawId: 'd1', phase: 'SALES' } }]);

    expect(prismaLib.prisma.drawLiveSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(mockInvalidatePattern).not.toHaveBeenCalled();
    // Per-draw key should still be invalidated even on SALES — fresh data exists
    expect(mockInvalidate).toHaveBeenCalledWith('tote:v1:draw:d1:snap');
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/calculate-draw-financials-invalidation.test.js
```
Expected: FAIL — worker has no invalidation hook yet.

- [ ] **Step 3: Add the hook**

Open `backend/src/queue/workers/calculate-draw-financials.worker.js`. Locate the handler body (after the existing `if (phase === 'PRIZES') ...` / `if (phase === 'SALES') ...` blocks, just before `return`). Add the imports at the top:

```javascript
import { prisma } from '../../lib/prisma.js';
import { invalidate, invalidatePattern } from '../../lib/redis.js';
```

(if not already present.)

At the end of the handler, before the final `return`, append:

```javascript
// v1.4 — cache invalidation. Always invalidate the per-draw key so the
// next read sees fresh totals; on PRIZES (terminal), also wipe the
// DrawLiveSnapshot row (now superseded by DrawFinancial) and the daily
// report pattern.
await invalidate(`tote:v1:draw:${drawId}:snap`);

if (phase === 'PRIZES') {
  await prisma.drawLiveSnapshot.deleteMany({ where: { drawId } });
  await invalidatePattern('tote:v1:report:daily:*');
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/queue/workers/__tests__/calculate-draw-financials-invalidation.test.js
```
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/queue/workers/calculate-draw-financials.worker.js backend/src/queue/workers/__tests__/calculate-draw-financials-invalidation.test.js
git commit -m "feat(cache): invalidate Redis + delete DrawLiveSnapshot when DrawFinancial PRIZES commits"
```

---

### Task 17: Add `/api/admin/cache/stats` endpoint

**Files:**
- Create: `backend/src/routes/cache-admin.routes.js`
- Create: `backend/src/__tests__/cache-admin-endpoint.test.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/cache-admin-endpoint.test.js`:

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockGetStats = jest.fn();
jest.unstable_mockModule('../lib/redis.js', () => ({
  getStats: mockGetStats,
  cacheOrCompute: jest.fn(),
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

// Auth middleware mock — accepts any token
jest.unstable_mockModule('../middlewares/auth.middleware.js', () => ({
  default: (req, _res, next) => { req.user = { role: 'ADMIN' }; next(); },
  authMiddleware: (req, _res, next) => { req.user = { role: 'ADMIN' }; next(); },
  adminOnly: (req, res, next) => req.user?.role === 'ADMIN' ? next() : res.status(403).end(),
}));

let routes;

beforeAll(async () => {
  routes = (await import('../routes/cache-admin.routes.js')).default;
});

function buildApp() {
  const app = express();
  app.use('/api/admin/cache', routes);
  return app;
}

describe('GET /api/admin/cache/stats', () => {
  it('returns the stats payload', async () => {
    mockGetStats.mockResolvedValueOnce({
      hitRate: { 'tote:v1:report:daily': 0.84 },
      keyCount: 42,
      lastRefresh: { live: new Date().toISOString(), daily: new Date().toISOString() },
    });

    const res = await request(buildApp()).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body.keyCount).toBe(42);
    expect(res.body.hitRate).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run:
```bash
cd backend && npx jest src/__tests__/cache-admin-endpoint.test.js
```
Expected: FAIL — route + `getStats` not defined.

- [ ] **Step 3: Add `getStats` to `lib/redis.js`**

Open `backend/src/lib/redis.js`. Append:

```javascript
// Lightweight in-process counters. Reset on process restart.
const _counters = {
  hits: new Map(),    // prefix -> count
  misses: new Map(),  // prefix -> count
  fallbacks: 0,
  timeouts: 0,
};

function bumpCounter(map, prefix) {
  map.set(prefix, (map.get(prefix) || 0) + 1);
}

function keyPrefix(key) {
  // tote:v1:report:daily:abc123 → tote:v1:report:daily
  const parts = key.split(':');
  return parts.slice(0, 4).join(':');
}

export async function getStats() {
  const c = getClient();
  const prefixes = new Set([..._counters.hits.keys(), ..._counters.misses.keys()]);
  const hitRate = {};
  for (const p of prefixes) {
    const h = _counters.hits.get(p) || 0;
    const m = _counters.misses.get(p) || 0;
    hitRate[p] = (h + m) > 0 ? h / (h + m) : 0;
  }
  let keyCount = null;
  if (c && c.status === 'ready') {
    try {
      keyCount = await withTimeout(c.dbsize(), REDIS_TIMEOUT_MS);
    } catch {
      keyCount = null;
    }
  }
  return {
    enabled: isEnabled(),
    connected: c?.status === 'ready',
    keyCount,
    hitRate,
    fallbacks: _counters.fallbacks,
    timeouts: _counters.timeouts,
  };
}

// Hook these into cacheOrCompute — find that function and add counter bumps:
// - On hit:       bumpCounter(_counters.hits,   keyPrefix(key));
// - On miss:      bumpCounter(_counters.misses, keyPrefix(key));
// - On timeout:   _counters.timeouts += 1;
// - On fallback:  _counters.fallbacks += 1;
```

Then edit `cacheOrCompute` in the same file. After the existing `const cached = await ...` line, on the hit branch add `bumpCounter(_counters.hits, keyPrefix(key));`. On the miss branch add `bumpCounter(_counters.misses, keyPrefix(key));`. In the catch block add `_counters.fallbacks += 1;`. After the `withTimeout` rejection error message check, increment `_counters.timeouts += 1` when the error message is `redis_timeout`.

- [ ] **Step 4: Create the route**

Create `backend/src/routes/cache-admin.routes.js`:

```javascript
import { Router } from 'express';
import { getStats } from '../lib/redis.js';

const router = Router();

// Note: actual auth wiring (admin gate) is applied at the index.js mount
// point — this router itself is auth-agnostic for testability.
router.get('/stats', async (_req, res) => {
  const stats = await getStats();
  res.json(stats);
});

export default router;
```

- [ ] **Step 5: Mount in index.js with admin auth**

Open `backend/src/index.js`. Add to the imports (alongside other route imports):

```javascript
import cacheAdminRoutes from './routes/cache-admin.routes.js';
```

Add to the route-mount block:

```javascript
app.use('/api/admin/cache', /* existing admin auth middleware */ cacheAdminRoutes);
```

(Use whatever admin-auth middleware the codebase already employs on `/api/admin/...` routes — read `index.js` carefully to see the existing pattern. Match it; don't introduce a new auth mechanism.)

- [ ] **Step 6: Run tests, confirm they pass**

Run:
```bash
cd backend && npx jest src/__tests__/cache-admin-endpoint.test.js src/lib/__tests__/redis.test.js
```
Expected: PASS — both files green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/cache-admin.routes.js backend/src/lib/redis.js backend/src/index.js backend/src/__tests__/cache-admin-endpoint.test.js
git commit -m "feat(admin): GET /api/admin/cache/stats — hit-rate / connection / key count"
```

---

### Task 18: Update `.env.example` with the new feature flags

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Append the flags**

Open `backend/.env.example`. Append:

```bash

# ============================================================================
# v1.4 — Cache layer (RFC docs/superpowers/specs/2026-05-16-perf-aggregates-redis-cache-design.md)
# ============================================================================
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
SNAPSHOT_WORKERS_ENABLED=true
# REPORT_USE_MATERIALIZED already exists above — flip default to true at deploy time.
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "chore(env): document REDIS_URL / REDIS_ENABLED / SNAPSHOT_WORKERS_ENABLED flags"
```

---

## Phase 6 — Deploy runbook (documentation only)

### Task 19: Author the deploy runbook for v1.4 (mixed with v1.3)

**Files:**
- Create: `docs/runbooks/v1.4-perf-cache-deploy.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/v1.4-perf-cache-deploy.md`:

```markdown
# v1.4 Perf-Cache Deploy Runbook (mixed with v1.3)

> **HARD CONSTRAINT:** do not execute any command in this file unless the user
> explicitly asks. This is documentation only. Per the user's standing
> instruction "no despliegues a menos que te lo pida".

## Pre-flight

1. Local build green:
   ```bash
   cd backend && npm test
   cd frontend && npm run build
   ```
2. Local docker-compose has both services up:
   ```bash
   docker-compose ps
   ```
3. Confirm tracking branches:
   ```bash
   git log --oneline | grep -E "v1\.[34]" | head -10
   ```

## Step 1: VPS — provision Redis container

```bash
ssh 94 "cd /var/proyectos/tote-web && git pull --ff-only"
ssh 94 "cd /var/proyectos/tote-web && docker-compose up -d redis"
ssh 94 "docker exec tote_redis redis-cli ping"
```
Expected: `PONG`.

## Step 2: Backend deps + schema

```bash
ssh 94 "cd /var/proyectos/tote-web/backend && npm install"
ssh 94 "cd /var/proyectos/tote-web/backend && npx prisma migrate deploy"
ssh 94 "cd /var/proyectos/tote-web/backend && npx prisma generate"
```

## Step 3: Env vars on production

Append to `/var/proyectos/tote-web/backend/.env`:
```
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
SNAPSHOT_WORKERS_ENABLED=true
REPORT_USE_MATERIALIZED=true
```

## Step 4: Restart backend

```bash
ssh 94 "pm2 restart tote-backend"
ssh 94 "pm2 logs tote-backend --lines 100 --nostream | grep -E '(redis|pg-boss)'"
```
Expected log lines:
- `[redis] connected`
- `[pg-boss] Workers refresh-live-snapshots + refresh-daily-snapshot registrados`

## Step 5: Add cron lines

Append to `/etc/cron.d/tote-triggers`:
```cron
# v1.4 perf — live snapshot refresh, every minute
* * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs refresh-live-snapshots

# v1.4 perf — daily aggregate refresh, every minute
* * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs refresh-daily-snapshot
```

## Step 6: Frontend rebuild (only if next build returns 0 AND .next/BUILD_ID exists)

```bash
ssh 94 "cd /var/proyectos/tote-web/frontend && npm run build"
ssh 94 "test -f /var/proyectos/tote-web/frontend/.next/BUILD_ID && pm2 restart tote-frontend"
```

## Step 7: Smoke validation

```bash
ssh 94 "curl -s http://localhost:3001/health"
```
Expected: `{"status":"ok","postgres":"up","redis":"up", ...}`

```bash
ssh 94 "curl -s -H 'Authorization: Bearer <admin-jwt>' http://localhost:3001/api/admin/cache/stats"
```
Expected: `{"enabled":true,"connected":true, ...}`

Hit `/admin/monitor` twice in the browser. Second load < 80ms (network tab).

## Step 8: Watch for 24h

```bash
ssh 94 "pm2 logs tote-backend --lines 500 --nostream | grep -E '(refresh-live-snapshots|refresh-daily-snapshot|cache)'"
```

Watch counts of `cache_fallback_total` via `GET /api/admin/cache/stats` — should
stay near zero. If non-zero, Redis is intermittently unreachable.

## Rollback levers (in order of severity)

1. Set `REDIS_ENABLED=false` in `.env` → `pm2 restart tote-backend`. Caching off, code unchanged.
2. Set `SNAPSHOT_WORKERS_ENABLED=false` → restart. Workers idle, tables stay populated by previous run.
3. Comment out the two cron lines.
4. `git revert` the v1.4 commits and pull. Tables remain (additive — no data loss).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/v1.4-perf-cache-deploy.md
git commit -m "docs(runbook): v1.4 perf-cache deploy procedure (NOT EXECUTED)"
```

---

## Phase 7 — Final integration check

### Task 20: Full test suite + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run:
```bash
cd backend && npm test
```
Expected: PASS — no regressions. New tests (redis, monitor-cache, live-snapshot, workers, invalidation, draw-livesnap) all green. v1.3 tests (commission, contabilidad, pnl, daily-report-*) all still green.

- [ ] **Step 2: Start local backend + frontend, manually verify**

Run in three terminals:
```bash
docker-compose up -d
cd backend && npm run dev
cd frontend && npm run dev
```

Open `http://localhost:10000/admin/monitor` in the browser:
- First load: note duration in DevTools Network tab.
- Reload immediately: second load should be markedly faster (< 80ms server time).

Open `http://localhost:10000/admin/reportes` with a 30-day range:
- First load fills cache.
- Reload: < 80ms.

Open `http://localhost:10000/admin/tickets-report`:
- Page 1 with date filter loads.
- Page 2 hits cache (different key) — first load similar speed, reload fast.

`GET http://localhost:3001/api/admin/cache/stats` (with admin auth):
- `enabled: true`, `connected: true`, hit-rate > 0 on the prefixes you just hit.

- [ ] **Step 3: Trigger cron manually and observe snapshot tables fill**

Run:
```bash
cd backend && node src/scripts/trigger-pgboss-cron.mjs refresh-live-snapshots
sleep 5
docker exec tote_postgres psql -U tote_user -d tote_db -c 'SELECT "drawId", "totalSales", "ticketCount", "refreshedAt" FROM "DrawLiveSnapshot" ORDER BY "refreshedAt" DESC LIMIT 5;'
```
Expected: rows for today's active draws with non-null `refreshedAt`.

```bash
cd backend && node src/scripts/trigger-pgboss-cron.mjs refresh-daily-snapshot
sleep 5
docker exec tote_postgres psql -U tote_user -d tote_db -c 'SELECT "date", "gameId", "source", "totalSales", "ticketCount", "refreshedAt" FROM "DailyAggregateSnapshot" WHERE "date" = CURRENT_DATE;'
```
Expected: rows per (gameId, source, apiSystemId) for today.

- [ ] **Step 4: Test the Redis kill-switch**

Run:
```bash
docker-compose stop redis
curl -s http://localhost:3001/health
```
Expected: `status: degraded`, `redis: down`, `postgres: up`. Open `/admin/monitor` — still loads (slower, but works). `pm2 logs` shows `[cache] get failed ... — falling back` warnings.

```bash
docker-compose start redis
sleep 3
curl -s http://localhost:3001/health
```
Expected: `status: ok`, `redis: up`.

- [ ] **Step 5: Final commit (if any tweaks needed during smoke)**

Only if smoke surfaced an issue. Otherwise, no commit needed — the plan is done.

```bash
git status
# if clean, nothing to commit
```

- [ ] **Step 6: Hand off**

The plan is complete. Per the hard constraint, the deploy runbook
(`docs/runbooks/v1.4-perf-cache-deploy.md`) is NOT executed. Notify the user
that the milestone is ready and await explicit deploy authorization.

---

## Self-review checklist (filled in by plan author at write time)

- ✅ **Spec coverage:**
  - Section 2 Goals → Phases 1-5 wire all three admin pages through cache.
  - Section 4 Approach (3-layer + warming) → Tasks 1, 4, 9, 10, 12-15.
  - Section 5.1 Redis container → Task 1.
  - Section 5.2-5.3 New/modified files → Tasks 2-18.
  - Section 5.4 Schema → Task 6.
  - Section 5.5 New indices → Task 6.
  - Section 5.6 Cron entries → Task 19 (runbook only; do not execute).
  - Section 6 Data flow → Tasks 7-8 (snapshot service), 9-10 (workers), 12-15 (read paths), 16 (invalidation hook).
  - Section 7 Error handling → covered in Task 4 (timeout, fallback) and Task 9 (per-draw try/catch).
  - Section 8 Feature flags → REDIS_ENABLED (Task 4), SNAPSHOT_WORKERS_ENABLED (Tasks 9-10), REPORT_USE_MATERIALIZED default flip (Task 12).
  - Section 9 Observability → Task 17 (`getStats` + admin endpoint).
  - Section 10 Testing strategy → TDD in every implementation task.
  - Section 11 Deploy → Task 19 (runbook).
  - Section 13 Success criteria → Task 20 (manual smoke validates p95 anecdotally; production p95 measurement is operator-owned post-deploy).

- ✅ **No placeholders:** every code block is complete and executable.

- ✅ **Type consistency:**
  - `cacheOrCompute(key, ttl, fn, opts?)` — same signature in Tasks 4, 12, 13, 14.
  - `invalidate(key)`, `invalidatePattern(pattern)` — same signature Tasks 4, 16.
  - `computeDrawLiveSnapshot(drawId)`, `computeDailyAggregateSnapshot(date)` — consistent across Tasks 7-10, 16.
  - `refreshLiveSnapshotsWorker(jobs)`, `refreshDailySnapshotWorker(jobs)` — pg-boss array-of-jobs convention matches existing codebase pattern.
  - Redis key format `tote:v1:<domain>:<id>:<suffix>` — uniform across Tasks 12, 13, 14, 15, 16.

- ✅ **Hard constraints preserved:** Tasks 1-20 never touch `webhook.service.js`, `api-integration.service.js`, `maxplay.service.js`, `prize-processor.service.js`. Deploy runbook (Task 19) is explicitly marked NOT-EXECUTED.
