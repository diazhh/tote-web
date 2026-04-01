# Architecture Research

**Domain:** Multi-provider webhook system integrated into existing Express/Prisma lottery app
**Researched:** 2026-04-01
**Confidence:** HIGH — based on direct codebase inspection, no external verification needed

## Standard Architecture

### System Overview

```
External Provider
      |
      | POST /api/webhooks/:providerSlug
      | Header: X-Webhook-Token: <token>
      v
┌─────────────────────────────────────────────────────────┐
│                   index.js — Express                     │
│  rawBody middleware → webhookRateLimit → /api/webhooks  │
└──────────────────────────┬──────────────────────────────┘
                           |
┌──────────────────────────v──────────────────────────────┐
│           webhooks/webhook.routes.js                     │
│  POST /:providerSlug → webhookAuthMiddleware →           │
│                         WebhookController.receive()      │
└──────────────────────────┬──────────────────────────────┘
                           |
┌──────────────────────────v──────────────────────────────┐
│          services/webhook.service.js                     │
│  1. Load ApiSystem by slug (verify active)               │
│  2. Log raw payload to WebhookLog                        │
│  3. Try dynamic import: webhooks/adapters/{slug}.js      │
│     ├─ Adapter found → normalize → create Ticket        │
│     └─ No adapter    → discovery mode (logged only)     │
└──────────────────────────┬──────────────────────────────┘
                           |
            ┌──────────────┴──────────────┐
            |                             |
┌───────────v──────────┐    ┌─────────────v─────────────┐
│  prisma.webhookLog   │    │  services/ticket.service  │
│  Raw payload stored  │    │  External ticket created  │
│  status: RECEIVED or │    │  source: WEBHOOK_PUSH     │
│  PROCESSED/NO_ADAPTER│    └───────────────────────────┘
└──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `webhooks/webhook.routes.js` | Route definition for `POST /:providerSlug` | NEW |
| `middlewares/webhook-auth.middleware.js` | Token lookup by slug, attaches `req.apiSystem` | NEW |
| `controllers/webhook.controller.js` | Thin handler, delegates to webhook.service | NEW |
| `services/webhook.service.js` | Core logic: log, load adapter, create ticket | NEW |
| `webhooks/adapters/{slug}.adapter.js` | Provider-specific payload normalization | NEW (per provider) |
| `prisma schema: ApiSystem` | Add `slug`, `webhookToken`, `mode` fields | MODIFY |
| `prisma schema: WebhookLog` | New model for raw payload storage | NEW |
| `prisma schema: TicketSource` | Add `WEBHOOK_PUSH` enum value | MODIFY |
| `routes/provider.routes.js` | Add token-generate endpoint | MODIFY |
| `controllers/provider.controller.js` | Add `generateToken` action | MODIFY |
| `frontend: app/admin/proveedores/page.js` | Add mode/slug/token fields to system modal | MODIFY |
| `frontend: app/admin/proveedores/webhook-logs/page.js` | New log viewer page | NEW |

## Recommended Project Structure

```
backend/src/
├── webhooks/                    # NEW — webhook subsystem
│   ├── adapters/                # Per-provider adapters
│   │   └── {slug}.adapter.js   # e.g., acme.adapter.js
│   └── webhook.service.js      # Core dispatch logic (OR in services/)
├── middlewares/
│   ├── auth.middleware.js       # EXISTING — unchanged
│   └── webhook-auth.middleware.js  # NEW — token-based auth for webhooks
├── routes/
│   ├── provider.routes.js       # MODIFY — add generateToken endpoint
│   └── webhook.routes.js        # NEW — POST /:providerSlug
├── controllers/
│   ├── provider.controller.js   # MODIFY — add generateToken
│   └── webhook.controller.js    # NEW — receive handler
├── services/
│   └── webhook.service.js       # NEW — dispatch, log, adapt, ticket create
└── index.js                     # MODIFY — register /api/webhooks, rawBody before json()

frontend/app/admin/
├── proveedores/
│   ├── page.js                  # MODIFY — add slug, mode, token UI
│   └── webhook-logs/
│       └── page.js              # NEW — webhook log viewer

frontend/lib/api/
└── webhooks.js                  # NEW — API client for webhook log endpoints
```

### Structure Rationale

- **`webhooks/adapters/`:** File-based adapter lookup via dynamic import — no registry to maintain. Each adapter file exports a single `normalize(payload)` function returning the internal ticket format. Missing file = discovery mode.
- **`webhooks/webhook.service.js`:** Kept inside the webhooks directory (or in `services/`) to keep the main services/ directory clean. Either location works; `services/webhook.service.js` follows the existing naming convention more closely.
- **`middlewares/webhook-auth.middleware.js`:** Separate from `auth.middleware.js` because webhook auth is token-based (header lookup against DB), not JWT Bearer. Attaches `req.apiSystem` rather than `req.user`.

## Architectural Patterns

### Pattern 1: Raw Body Before JSON Parser

**What:** Mount `express.raw({ type: '*/*' })` on the `/api/webhooks` path before the global `express.json()` middleware, so the exact bytes received from the provider are preserved for logging and signature verification.

**When to use:** Any webhook endpoint that needs to log the exact raw payload or validate HMAC signatures (future requirement).

**Trade-offs:** Must be registered before `app.use(express.json())` in `index.js`, or scoped via router-level middleware. The easiest approach is a per-route middleware in `webhook.routes.js`.

**Example:**
```javascript
// webhook.routes.js
import express from 'express';

const router = express.Router();

// Raw body capture — must be before json parsing on this router
router.use(express.raw({ type: '*/*', limit: '1mb' }));

router.post('/:providerSlug', webhookAuthMiddleware, webhookController.receive);
```

The raw body is available as `Buffer` on `req.body`. Convert to string for logging: `req.body.toString('utf8')`.

### Pattern 2: Token Auth Middleware (webhook-auth)

**What:** A dedicated middleware that reads `X-Webhook-Token` header, looks up `ApiSystem` by `webhookToken` AND `slug`, verifies the system is active and in PUSH mode, then attaches `req.apiSystem` for downstream use.

**When to use:** All webhook routes. Must not be `authenticate` (which is JWT-based for admin users).

**Trade-offs:** One DB query per webhook request. Acceptable at low volume; add caching if needed later.

**Example:**
```javascript
// middlewares/webhook-auth.middleware.js
export const webhookAuth = async (req, res, next) => {
  const token = req.headers['x-webhook-token'];
  const { providerSlug } = req.params;

  if (!token) {
    return res.status(401).json({ error: 'Missing X-Webhook-Token header' });
  }

  const system = await prisma.apiSystem.findFirst({
    where: { slug: providerSlug, webhookToken: token, isActive: true, mode: 'PUSH' }
  });

  if (!system) {
    return res.status(401).json({ error: 'Invalid token or unknown provider' });
  }

  req.apiSystem = system;
  next();
};
```

### Pattern 3: File-Based Adapter with Dynamic Import

**What:** At runtime, attempt `import('../webhooks/adapters/${slug}.adapter.js')`. If the module resolves, call its `normalize(rawPayload)` and create a Ticket. If import throws `ERR_MODULE_NOT_FOUND`, set `WebhookLog.status = 'NO_ADAPTER'` — discovery mode.

**When to use:** This approach fits ES modules natively. No adapter registry to maintain. Adding a new provider = dropping a file in `adapters/`.

**Trade-offs:** Dynamic import is async and Node.js caches modules after first load. File not found throws an error that must be caught specifically. Test with `error.code === 'ERR_MODULE_NOT_FOUND'` or check for the slug in `error.message`.

**Example:**
```javascript
// services/webhook.service.js
async function dispatchWebhook(apiSystem, rawBody) {
  const slug = apiSystem.slug;
  const rawPayload = rawBody.toString('utf8');

  // Log raw — always, before any processing
  const log = await prisma.webhookLog.create({
    data: {
      apiSystemId: apiSystem.id,
      rawPayload,
      status: 'RECEIVED',
    }
  });

  let adapter;
  try {
    // Dynamic import — Node.js ES module cache applies after first load
    const module = await import(`../webhooks/adapters/${slug}.adapter.js`);
    adapter = module.default ?? module;
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'NO_ADAPTER' }
      });
      return { status: 'discovery', logId: log.id };
    }
    throw err; // Re-throw unexpected errors
  }

  // Adapter found — normalize and create ticket
  const normalized = adapter.normalize(JSON.parse(rawPayload));
  const ticket = await createTicketFromWebhook(normalized, apiSystem);

  await prisma.webhookLog.update({
    where: { id: log.id },
    data: { status: 'PROCESSED', ticketId: ticket.id }
  });

  return { status: 'processed', ticketId: ticket.id, logId: log.id };
}
```

## Data Flow

### Webhook Receipt to Ticket Creation

```
Provider sends POST /api/webhooks/acme
  Header: X-Webhook-Token: <token>
  Body: { ...provider-specific payload }

1. express.raw() captures body as Buffer on req.body
2. webhookAuthMiddleware:
   - reads X-Webhook-Token + :providerSlug from params
   - queries ApiSystem WHERE slug=acme AND webhookToken=token AND mode=PUSH
   - attaches req.apiSystem or returns 401
3. WebhookController.receive():
   - calls webhook.service.dispatchWebhook(req.apiSystem, req.body)
   - returns 200 immediately (no waiting on ticket creation outcome for provider)
4. webhook.service.dispatchWebhook():
   a. prisma.webhookLog.create({ status: 'RECEIVED', rawPayload })
   b. dynamic import 'webhooks/adapters/acme.adapter.js'
      - ERR_MODULE_NOT_FOUND → update log to NO_ADAPTER, return
      - success → proceed
   c. adapter.normalize(JSON.parse(rawPayload)) → normalized ticket data
   d. prisma.$transaction: create Ticket + TicketDetails
      - source: WEBHOOK_PUSH
      - userId: null (external ticket)
      - externalTicketId: normalized.externalId
   e. prisma.webhookLog.update({ status: 'PROCESSED', ticketId })
```

### Admin Token Generation Flow

```
Admin clicks "Generate Token" in /admin/proveedores
  → POST /api/providers/systems/:id/generate-token
  → providerController.generateToken()
  → crypto.randomBytes(32).toString('hex')
  → prisma.apiSystem.update({ webhookToken: newToken })
  → returns { webhookToken: newToken }
  → Admin UI shows token once (copy-and-close pattern)
```

### WebhookLog Viewer Data Flow

```
GET /api/providers/webhook-logs?systemId=X&status=Y&page=N
  → providerController.getWebhookLogs()
  → prisma.webhookLog.findMany({ where, orderBy: createdAt desc, take/skip })
  → Frontend paginates with status filter tabs
```

## Schema Changes

### ApiSystem — New Fields

```prisma
model ApiSystem {
  id            String   @id @default(uuid())
  name          String
  description   String?
  slug          String   @unique  // NEW: URL-safe identifier, e.g. "srq", "acme"
  mode          ApiMode  @default(PULL)  // NEW: PULL | PUSH
  webhookToken  String?  @unique  // NEW: token for PUSH providers (null for PULL)
  isActive      Boolean  @default(true)  // NEW: master on/off switch
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  configurations ApiConfiguration[]
  comerciales    ProviderComercial[]
  webhookLogs    WebhookLog[]       // NEW relation
}

enum ApiMode {
  PULL   // system polls provider (SRQ pattern)
  PUSH   // provider sends to our webhook
}
```

**Migration note:** `slug` is `@unique` but existing SRQ row has no slug — migration needs a default. Safest: run migration with `slug` nullable first, backfill `slug = 'srq'` for SRQ, then add `@unique` constraint. Or use `@default("")` and handle in migration SQL.

### WebhookLog — New Model

```prisma
model WebhookLog {
  id          String          @id @default(uuid())
  apiSystemId String
  rawPayload  String          // Full raw body as string
  status      WebhookLogStatus @default(RECEIVED)
  ticketId    String?         // Set when PROCESSED
  errorMessage String?        // Set when ERROR
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  apiSystem   ApiSystem       @relation(fields: [apiSystemId], references: [id], onDelete: Cascade)
  ticket      Ticket?         @relation(fields: [ticketId], references: [id])

  @@index([apiSystemId])
  @@index([status])
  @@index([createdAt])
}

enum WebhookLogStatus {
  RECEIVED    // Received, not yet processed
  PROCESSED   // Adapter ran, ticket created
  NO_ADAPTER  // Received but no adapter exists (discovery mode)
  ERROR       // Processing failed with an error
}
```

### TicketSource — New Enum Value

```prisma
enum TicketSource {
  TAQUILLA_ONLINE   // existing
  EXTERNAL_API      // existing (SRQ PULL)
  WEBHOOK_PUSH      // NEW: received via webhook from PUSH provider
}
```

### Ticket — WebhookLog Backrelation

```prisma
model Ticket {
  // existing fields ...
  webhookLog  WebhookLog?  // NEW: back-relation (optional)
}
```

## Integration Points

### Existing Code: Modified

| File | Change | Risk |
|------|--------|------|
| `backend/prisma/schema.prisma` | Add `slug`, `mode`, `webhookToken`, `isActive` to `ApiSystem`; add `WebhookLog` model; add `WEBHOOK_PUSH` to `TicketSource` | Medium — requires migration, backfill SRQ slug |
| `backend/src/index.js` | Add `import webhookRoutes` + `app.use('/api/webhooks', webhookRoutes)` | Low — additive only |
| `backend/src/routes/provider.routes.js` | Add `POST /systems/:id/generate-token` and `GET /webhook-logs` routes | Low — additive only |
| `backend/src/controllers/provider.controller.js` | Add `generateToken()` and `getWebhookLogs()` methods | Low — additive only |
| `frontend/app/admin/proveedores/page.js` | Add slug, mode selector, token display/generate to system modal | Medium — UI change to existing page |
| `frontend/app/admin/layout.js` | Add "Webhook Logs" nav link under proveedores section | Low — additive |

### Existing Code: Untouched

| File | Why Safe |
|------|----------|
| `services/srq.service.js` | SRQ remains PULL-based; webhook system is parallel infrastructure |
| `services/api-integration.service.js` | No changes; ticket import for SRQ stays as-is |
| `queue/workers/sync-api-tickets.worker.js` | Unchanged; PULL sync unaffected |
| `services/ticket.service.js` | Webhook creates tickets directly via Prisma (or a thin wrapper), not via the `create()` method which requires a userId and enforces balance deduction |
| `middlewares/auth.middleware.js` | Webhook auth is a new middleware; JWT auth is unchanged |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| webhook route → webhook.service | Direct function call | No queue; synchronous |
| webhook.service → prisma | Direct Prisma calls | Transaction for ticket + log update |
| webhook.service → adapter | ES dynamic import | File must exist in `webhooks/adapters/` |
| webhook.service → ticket.service | NOT used directly | Ticket created inline to avoid userId requirement; or extract a `createExternalTicket()` in ticket.service |
| provider.routes → webhook logs | Same controller, new methods | WebhookLog queries added to provider.controller.js |

## Anti-Patterns

### Anti-Pattern 1: Re-using `authenticate` Middleware on Webhook Routes

**What people do:** Apply the existing JWT `authenticate` middleware to the `/api/webhooks` path since it already handles auth.

**Why it's wrong:** `authenticate` expects `Authorization: Bearer <JWT>`. Providers send `X-Webhook-Token`. They are different auth schemes. Applying `authenticate` would reject all provider requests with 401.

**Do this instead:** Write `webhook-auth.middleware.js` that reads `X-Webhook-Token` and does a DB lookup against `ApiSystem.webhookToken`.

### Anti-Pattern 2: Parsing Body Before Raw Capture

**What people do:** Apply `express.json()` globally (already done in `index.js`), then try to log the raw body from `req.body` (which is already a parsed object).

**Why it's wrong:** Once `express.json()` runs, the raw Buffer is gone. You cannot reconstruct the exact bytes. Signature verification becomes impossible.

**Do this instead:** In `webhook.routes.js`, apply `express.raw({ type: '*/*' })` as the first router-level middleware. The global `express.json()` in `index.js` only runs on other routes if `webhook.routes.js` is mounted before it is registered — verify mount order. Alternatively, use `express.raw` as route-level middleware on the specific POST handler.

### Anti-Pattern 3: Throwing 500 on Missing Adapter

**What people do:** Let the `ERR_MODULE_NOT_FOUND` error propagate up, causing a 500 response to the provider. Provider treats this as a failure and retries, filling logs with noise.

**Why it's wrong:** Missing adapter is expected behavior during development (discovery mode). A 500 tells the provider to retry, creating unnecessary traffic.

**Do this instead:** Catch `ERR_MODULE_NOT_FOUND` specifically, log the payload as `NO_ADAPTER`, and return `200 OK` with `{ status: 'received', mode: 'discovery' }`. The provider sees success; the payload is stored for inspection.

### Anti-Pattern 4: Returning 4xx for Provider Errors After Logging

**What people do:** If adapter normalization fails (bad payload from provider), return 400. Provider then retries indefinitely.

**Why it's wrong:** Provider retries compound the problem. Bad payloads should be logged with status `ERROR` but acknowledged with `200`.

**Do this instead:** Always return `200` to the provider after logging. Surface errors in `WebhookLog.status = 'ERROR'` and `WebhookLog.errorMessage`. Alert admins via existing Telegram bot if needed.

### Anti-Pattern 5: Reusing `ticket.service.create()` for Webhook Tickets

**What people do:** Call the existing `ticket.service.create(userId, data)` for webhook-originated tickets.

**Why it's wrong:** `ticket.service.create()` requires a `userId`, validates user balance, and deducts from it. External webhook tickets have no local user and require no balance deduction.

**Do this instead:** Either write a `ticket.service.createExternal(data)` method that skips balance checks, or create the Prisma records directly in `webhook.service.js` using `prisma.$transaction`. The `Ticket` model already supports `userId: null` and `source: EXTERNAL_API` — this pattern is established by the SRQ integration.

## Build Order (Dependency-Aware)

The following order respects which components depend on others:

1. **Schema migration** — `ApiSystem` new fields + `WebhookLog` model + `TicketSource.WEBHOOK_PUSH`
   - Backfill SRQ system with `slug = 'srq'` and `mode = 'PULL'`
   - Nothing else can proceed without this

2. **`webhooks/adapters/` directory** — Create empty directory with a `.gitkeep` or a stub
   - Needed so dynamic import path is valid (import will fail gracefully with file-not-found, but the directory should exist)

3. **`middlewares/webhook-auth.middleware.js`** — Token lookup middleware
   - Depends only on Prisma (from step 1)

4. **`services/webhook.service.js`** — Core dispatch logic (log + adapter load + ticket creation)
   - Depends on schema (step 1) and middleware pattern (step 3)

5. **`controllers/webhook.controller.js`** + **`routes/webhook.routes.js`** — HTTP layer
   - Depends on service (step 4) and middleware (step 3)

6. **Register route in `index.js`** — `app.use('/api/webhooks', webhookRoutes)` before global `express.json()`
   - Depends on route file (step 5)

7. **`controllers/provider.controller.js` + `routes/provider.routes.js`** — Add `generateToken` and `getWebhookLogs` endpoints
   - Depends on schema (step 1); independent of webhook route (step 5)

8. **Frontend: `app/admin/proveedores/page.js`** — Add slug/mode/token fields
   - Depends on backend endpoints (step 7)

9. **Frontend: `app/admin/proveedores/webhook-logs/page.js`** — New log viewer
   - Depends on backend `getWebhookLogs` endpoint (step 7)
   - Depends on `WebhookLog` data existing from step 4

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| < 10 providers, low volume | Current synchronous design is fine; no queue needed |
| 10+ providers, > 100 req/s | Add per-provider rate limiting using `express-rate-limit` with `keyGenerator: (req) => req.apiSystem.slug`; add index on `WebhookLog.createdAt` for log queries |
| High volume, SLA requirements | Move ticket creation to pg-boss queue (same pattern as existing pipeline); return 202 instead of 200 to provider; add `QUEUED` status to `WebhookLogStatus` |

### First Bottleneck

The DB lookup in `webhookAuthMiddleware` on every request. Cache `ApiSystem` records in memory (Map with 60s TTL) keyed by token hash. Invalidate on token regeneration.

## Sources

- Direct inspection of `backend/src/index.js` — middleware chain and route registration pattern
- Direct inspection of `backend/prisma/schema.prisma` — ApiSystem, Ticket, TicketSource models
- Direct inspection of `backend/src/middlewares/auth.middleware.js` — existing auth pattern
- Direct inspection of `backend/src/services/api-integration.service.js` — PULL integration reference for external ticket creation pattern
- Direct inspection of `backend/src/queue/register.js` — dynamic import pattern already used for workers
- Direct inspection of `frontend/app/admin/proveedores/page.js` — existing provider admin UI

---
*Architecture research for: Multi-provider webhook system in tote-web*
*Researched: 2026-04-01*
