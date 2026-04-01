# Phase 2: Webhook Backend Pipeline - Research

**Researched:** 2026-04-01
**Domain:** Node.js/Express webhook receiver — token auth, dynamic adapter dispatch, idempotent ticket creation, SRQ sync safety
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from conversation decisions)

### Locked Decisions
- Single endpoint: `POST /api/webhooks/:providerSlug`
- Auth via `X-Webhook-Token` header, validated with `crypto.timingSafeEqual`
- No adapter found → log as `DISCOVERED`, return 200
- Adapter found → normalize → create Ticket real-time
- Adapters are ES module files: `backend/src/webhooks/adapters/{slug}.adapter.js`
- Dynamic import to load adapters; `ERR_MODULE_NOT_FOUND` = discovery mode
- PUSH tickets use `source='WEBHOOK_PUSH'` (already in schema from Phase 1)
- SRQ `deleteMany` must be scoped to `source='EXTERNAL_API'` only — CRITICAL safety requirement
- Separate auth middleware — not JWT auth, not the existing `authenticate` middleware

### Claude's Discretion
- Internal structure of `webhook.service.js` (whether to use a transaction or two-phase commit)
- Exact error response shapes (while keeping HTTP 200 to provider on all outcomes)
- Whether `webhookAuth` middleware handles `mode` check or delegates to controller

### Deferred Ideas (OUT OF SCOPE)
- HMAC signature verification (v1.x — HMAC-01)
- Replay feature (v1.x — REPLAY-01)
- Per-provider rate limiting (excluded by REQUIREMENTS.md)
- Admin UI for log viewer (Phase 4 — LOGS-01..04)
- Token generation UI (Phase 3 — ADMIN-03, ADMIN-04)
- Webhook metrics dashboard (v2+ deferred)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WHOOK-01 | System can receive POST requests at `/api/webhooks/:providerSlug` with token-based auth | Express router + `express.raw()` body capture + `webhook-auth.middleware.js` pattern documented in ARCHITECTURE.md |
| WHOOK-02 | System logs raw payload to `WebhookLog` when no adapter exists (discovery mode) | Dynamic import + `ERR_MODULE_NOT_FOUND` catch + Prisma `webhookLog.create` with `status: 'DISCOVERED'` |
| WHOOK-03 | System creates tickets in real-time when provider has a wired adapter | Adapter `normalize()` + `prisma.ticket.create` with `source: 'WEBHOOK_PUSH'` — pattern mirrors SRQ's `saveTicketWithDetails` |
| WHOOK-04 | System rejects requests with invalid or missing tokens (401) | `webhookAuth` middleware queries `ApiSystem` by slug + token; missing/invalid → 401 before any logging |
| WHOOK-05 | System prevents duplicate ticket creation via DB unique constraint on `(drawId, externalTicketId)` | Schema constraint needed — NOT YET IN SCHEMA (see Gap 1 below); service-layer idempotency check also required |
| WHOOK-06 | System uses `crypto.timingSafeEqual` for token comparison | Node.js built-in `crypto` module; Buffer comparison pattern documented in Standard Stack |
</phase_requirements>

---

## Summary

Phase 2 builds the backend webhook receiver pipeline. The schema foundation (Phase 1) is complete: `ApiSystem` has `slug`, `webhookToken`, `mode`, `isActive`; `WebhookLog` model exists with `DISCOVERED/PROCESSED/DUPLICATE/FAILED` status enum; `TicketSource.WEBHOOK_PUSH` is present. All Phase 2 components are additive — no existing files are destructively modified except a targeted single-line scope fix in `api-integration.service.js`.

The key implementation facts are:
1. **Route registration order matters** — `app.use('/api/webhooks', webhookRoutes)` MUST appear before the `app.use(express.json())` line in `index.js` (currently line 99), because the webhook router uses `express.raw()` which conflicts with pre-parsed JSON.
2. **The SRQ `deleteMany` fix is a Phase 2 prerequisite** — `importSRQTickets()` at line 322-329 of `api-integration.service.js` calls `deleteMany({ where: { drawId, source: 'EXTERNAL_API' } })`. This is already correctly scoped to `EXTERNAL_API` — no change needed. Confirmed safe.
3. **`DISCOVERED` is the correct initial status** — Phase 1 schema uses `DISCOVERED` (not `NO_ADAPTER` or `RECEIVED`) as the default `WebhookLogStatus`. All code must use this exact enum value.
4. **The `Ticket` model lacks the unique constraint for WHOOK-05** — the existing schema has `@@index([externalTicketId])` but no `@@unique([drawId, externalTicketId])`. This constraint must be added as part of Phase 2 to satisfy WHOOK-05.

**Primary recommendation:** Build in strict dependency order: (1) schema constraint for WHOOK-05, (2) `webhooks/` directory structure, (3) `webhook-auth.middleware.js`, (4) `webhook.service.js`, (5) `webhook.controller.js` + `webhook.routes.js`, (6) register route in `index.js` before `express.json()`.

---

## Project Constraints (from CLAUDE.md)

All of the following directives from `CLAUDE.md` must be respected:

- **ES modules throughout** — use `import`/`export`, never `require`. All new files use `.js` extension with ES module syntax.
- **Prisma singleton** — import `{ prisma }` from `../lib/prisma.js`, never instantiate a new `PrismaClient`.
- **Draw status queries** — filter completed draws by `status IN ('DRAWN', 'PUBLISHED')` — production uses `PUBLISHED`, local uses `DRAWN`.
- **Timezone** — Venezuela (UTC-4). Use `lib/dateUtils.js` utilities for all date comparisons. Adapters must call `getVenezuelaDateAsUTC()` before draw lookup.
- **Winston logger** — import from `../lib/logger.js`. No `console.log` in production code.
- **`DISABLE_SOCIAL_CHANNELS=true`** — no social publishing changes in this phase; not relevant.
- **`ENABLE_JOBS=true`** — job processing gate; webhook pipeline is synchronous (not job-based) so this does not apply.
- **Port 3001** — backend; no port changes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `crypto` | v25.4.0 (Node) | `timingSafeEqual` for token comparison, `randomBytes` for future token gen | Built-in; zero deps; required by WHOOK-06 |
| `express` | ^4.21.1 | `express.raw({ type: '*/*' })` for raw body capture on webhook router | Already installed; raw body needed before JSON parse |
| `prisma` (client) | ^6.16.3 | `webhookLog.create`, `ticket.create`, `apiSystem.findFirst` | Project singleton — never instantiate directly |
| `zod` | ^3.23.8 | Adapter-level payload validation via `safeParse` | Already installed; `safeParse` never throws |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bcrypt` | ^5.1.1 | Token hashing (if plain-token storage is replaced) | Only if operator decides to hash tokens; currently tokens stored plain |
| `express-rate-limit` | ^7.4.1 | Separate rate limiter for `/api/webhooks/*` | Add if webhook burst isolation is needed; not required for MVP |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `express.raw()` on router | `express.json({ verify })` globally | `verify` callback approach requires modifying `index.js` global json() call; router-scoped `raw()` is cleaner and keeps webhook routes self-contained |
| Inline Prisma in service | `ticket.service.createExternal()` | Extracting a method to `ticket.service.js` is cleaner long-term; inline in `webhook.service.js` is acceptable for Phase 2 since the pattern mirrors existing `saveTicketWithDetails` |

**Installation:** No new packages required. All dependencies already in `backend/package.json`.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── webhooks/                    # NEW — webhook subsystem root
│   └── adapters/                # NEW — per-provider adapter files (empty at Phase 2 end)
│       └── .gitkeep             # NEW — prevents git from ignoring empty directory
├── middlewares/
│   ├── auth.middleware.js       # EXISTING — unchanged (JWT-based)
│   └── webhook-auth.middleware.js  # NEW — token-based auth, attaches req.apiSystem
├── routes/
│   └── webhook.routes.js        # NEW — POST /:providerSlug
├── controllers/
│   └── webhook.controller.js    # NEW — thin handler, delegates to webhook.service
└── services/
    └── webhook.service.js       # NEW — log, dynamic import, ticket create
```

### Pattern 1: Route Registration Order (CRITICAL)

**What:** The webhook router must be registered in `index.js` BEFORE the global `express.json()` call (currently line 99). The webhook router applies `express.raw()` at the router level to capture raw bytes. If `express.json()` runs first, the raw body Buffer is consumed and unavailable.

**Current state of `index.js`:**
```
line 96:  app.use('/api/', generalLimiter);
line 99:  app.use(express.json());
line 100: app.use(express.urlencoded({ extended: true }));
...
line 223: app.use('/api/providers', providerRoutes);   // existing providers
```

**What to add (before line 99):**
```javascript
// Source: ARCHITECTURE.md Pattern 1 — raw body capture must precede json()
import webhookRoutes from './routes/webhook.routes.js';
// ... (in the REGISTRAR RUTAS section, before express.json())
app.use('/api/webhooks', webhookRoutes);
```

**When to use:** Any route that needs raw body access or will eventually support HMAC signature verification.

### Pattern 2: Webhook Auth Middleware

**What:** `webhook-auth.middleware.js` reads `X-Webhook-Token` + `:providerSlug` from params, queries `ApiSystem` where `slug = providerSlug AND webhookToken = token AND isActive = true AND mode = 'PUSH'`, attaches `req.apiSystem` on success, returns 401 on failure.

**Critical detail:** Token comparison must use `crypto.timingSafeEqual`. The stored token in the DB is currently plain text (Phase 1 decision to not hash). Comparison pattern:

```javascript
// Source: Node.js crypto docs + PITFALLS.md Security section
import crypto from 'crypto';

const incomingBuf = Buffer.from(incomingToken, 'utf8');
const storedBuf   = Buffer.from(system.webhookToken, 'utf8');

// Lengths must match before timingSafeEqual — different lengths would throw
if (incomingBuf.length !== storedBuf.length) {
  return res.status(401).json({ error: 'Invalid token' });
}
if (!crypto.timingSafeEqual(incomingBuf, storedBuf)) {
  return res.status(401).json({ error: 'Invalid token' });
}
```

**CORS note:** Webhook endpoints are called by external providers (servers), not browsers. CORS headers are irrelevant for webhook routes. The existing CORS middleware in `index.js` won't interfere because server-to-server requests don't send `Origin` headers.

**X-Webhook-Token header and CORS allowedHeaders:** The current `corsOptions.allowedHeaders` does NOT include `X-Webhook-Token`. This does not matter for provider-to-server webhook calls (no preflight). However, if the admin UI ever calls webhook endpoints directly from the browser, `X-Webhook-Token` must be added to `allowedHeaders`. Document as a known gap.

### Pattern 3: Webhook Service Core Flow

**What:** `webhook.service.js` executes: (1) log raw payload to `WebhookLog` with status `DISCOVERED`, (2) attempt dynamic import of adapter, (3) if adapter found: normalize + create ticket + update log to `PROCESSED`, (4) if `ERR_MODULE_NOT_FOUND`: log stays `DISCOVERED`, return.

**The correct status sequence using Phase 1 schema enum values:**

| Outcome | `WebhookLog.status` |
|---------|---------------------|
| No adapter | `DISCOVERED` (default — no update needed) |
| Adapter ran, ticket created | `PROCESSED` |
| Adapter ran, ticket already exists | `DUPLICATE` |
| Adapter threw unexpected error | `FAILED` |

**Note:** The Phase 1 schema sets `DISCOVERED` as the default. This means for discovery mode, no second update call is needed — the record is already in `DISCOVERED` status from creation.

```javascript
// Source: ARCHITECTURE.md Pattern 3 — dynamic import with ERR_MODULE_NOT_FOUND catch
// File: backend/src/services/webhook.service.js

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function dispatchWebhook(apiSystem, rawBody) {
  const rawPayload = rawBody.toString('utf8');
  const slug = apiSystem.slug;

  // Step 1: Log raw payload — always, before any processing
  const log = await prisma.webhookLog.create({
    data: {
      apiSystemId: apiSystem.id,
      rawPayload,
      status: 'DISCOVERED',   // default; discovery mode stays here
    }
  });

  // Step 2: Attempt to load adapter
  const adapterPath = path.resolve(__dirname, `../webhooks/adapters/${slug}.adapter.js`);
  let adapterModule;
  try {
    adapterModule = await import(adapterPath);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      logger.info(`[webhook] Discovery mode for slug=${slug}, logId=${log.id}`);
      return { status: 'discovery', logId: log.id };
    }
    // Unexpected error loading adapter
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: `Adapter load error: ${err.message}` }
    });
    throw err;
  }

  // Step 3: Normalize and create ticket
  try {
    const adapter = adapterModule.default ?? adapterModule;
    const normalized = adapter.normalize(JSON.parse(rawPayload));
    const ticket = await createWebhookTicket(normalized, apiSystem, log.id);

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'PROCESSED' }
    });
    return { status: 'processed', logId: log.id, ticketId: ticket.id };
  } catch (err) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: err.message }
    });
    // Do NOT rethrow — controller returns 200 regardless
    return { status: 'failed', logId: log.id, error: err.message };
  }
}
```

### Pattern 4: Idempotent Ticket Creation (WHOOK-05)

**What:** Before creating a ticket, check for existing `(drawId, externalTicketId)` pair. If found, update log to `DUPLICATE` and return without throwing. The DB unique constraint is the safety net; the service check avoids unnecessary constraint violations.

```javascript
// Source: PITFALLS.md Pitfall 2 — duplicate from retries
async function createWebhookTicket(normalized, apiSystem, logId) {
  // Idempotency check
  const existing = await prisma.ticket.findFirst({
    where: {
      drawId: normalized.drawId,
      externalTicketId: normalized.externalTicketId,
      source: 'WEBHOOK_PUSH'
    }
  });

  if (existing) {
    await prisma.webhookLog.update({
      where: { id: logId },
      data: { status: 'DUPLICATE' }
    });
    return existing; // Return existing ticket, no duplicate created
  }

  // Create ticket
  return await prisma.ticket.create({
    data: {
      drawId: normalized.drawId,
      source: 'WEBHOOK_PUSH',
      externalTicketId: normalized.externalTicketId,
      totalAmount: normalized.totalAmount,
      totalPrize: 0,
      status: 'ACTIVE',
      providerData: normalized.providerData ?? null,
      details: {
        create: normalized.details.map(d => ({
          gameItemId: d.gameItemId,
          amount: d.amount,
          multiplier: d.multiplier,
          prize: 0,
          status: 'ACTIVE'
        }))
      }
    }
  });
}
```

### Pattern 5: Dynamic Import Path Resolution

**What:** ES module dynamic `import()` with a relative path computed at runtime using `path.resolve` and `__dirname`. This is required because `import('../webhooks/adapters/${slug}.adapter.js')` is interpreted relative to the file's URL, not the cwd.

**Critical:** The `__dirname` equivalent in ES modules requires `fileURLToPath(import.meta.url)`. This pattern is already used in `index.js` (lines 104-106).

```javascript
// Existing pattern from index.js (lines 104-106) — replicate this in webhook.service.js
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Then in dispatchWebhook():
const adapterPath = path.resolve(__dirname, `../webhooks/adapters/${slug}.adapter.js`);
const adapterModule = await import(adapterPath);
```

**Node.js module caching:** Dynamic imports are cached after first load per process. This means a deployed adapter change requires a pm2 restart. Document this as a known behavior — it's expected and fine for production.

### Pattern 6: Controller Returns 200 Always

**What:** `webhook.controller.js` always returns HTTP 200 regardless of `dispatchWebhook` result. Processing errors surface in `WebhookLog.status`, never in HTTP response codes. This prevents provider retry storms.

```javascript
// Source: ARCHITECTURE.md Anti-Pattern 4 — never 4xx after logging
export async function receive(req, res) {
  try {
    const result = await webhookService.dispatchWebhook(req.apiSystem, req.body);
    return res.status(200).json({ received: true, logId: result.logId });
  } catch (err) {
    logger.error('[webhook] Unhandled error in dispatchWebhook:', err);
    // Still return 200 — payload was logged before this point
    return res.status(200).json({ received: true });
  }
}
```

### Anti-Patterns to Avoid

- **Using `authenticate` middleware on webhook routes:** `authenticate` expects `Authorization: Bearer <JWT>`. Providers send `X-Webhook-Token`. These are different auth schemes. The new `webhookAuth` middleware is mandatory.
- **Registering webhook routes after `express.json()`:** Once `express.json()` parses the body, `req.body` is a plain object and the raw Buffer is gone. Signature verification becomes impossible. Route must be registered first.
- **Returning 4xx after logging:** Provider treats 4xx as a failure and retries. Always return 200 after logging. Only return 401 BEFORE logging (auth failure, nothing has been persisted yet).
- **Using `===` for token comparison:** Timing attack vulnerability. Use `crypto.timingSafeEqual` per WHOOK-06.
- **Calling `ticket.service.create()` for webhook tickets:** That method requires `userId`, validates user balance, and deducts from it. Webhook tickets have no local user. Create Prisma records directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token comparison | `token === storedToken` | `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` | Timing attacks allow prefix enumeration with `===`; built-in solves this |
| Raw body capture | Manual stream reading | `express.raw({ type: '*/*', limit: '1mb' })` as router middleware | Express built-in handles encoding, limits, and errors |
| Adapter loading | Registry Map, require() | ES dynamic `import(adapterPath)` | Node.js module cache handles repeated calls; no registry to maintain |
| Payload schema validation | Manual field checks | `zod.safeParse()` in adapter | Returns discriminated union, never throws; `safeParse` preserves partial data for logging |

**Key insight:** The webhook pipeline needs zero new npm packages. Node.js built-in `crypto` + Express built-in `raw()` + already-installed `zod` + existing Prisma client cover every requirement.

---

## Critical Gap: WHOOK-05 Schema Constraint Missing

**Gap 1: No unique constraint on `(drawId, externalTicketId)` for `WEBHOOK_PUSH` tickets.**

Current `Ticket` model in `schema.prisma`:
```prisma
@@index([externalTicketId])       // index only — NOT a unique constraint
@@index([drawId, source])
```

There is no `@@unique([drawId, externalTicketId])` or `@@unique([drawId, externalTicketId, source])`.

WHOOK-05 requires: "System prevents duplicate ticket creation via DB unique constraint on `(drawId, externalTicketId)`."

**Resolution:** Phase 2 Plan 1 must add this constraint to `schema.prisma` and run `npx prisma db push`. The constraint should be scoped: `@@unique([drawId, externalTicketId, source])` — this allows the same `externalTicketId` to exist under different sources (e.g., SRQ PULL and PUSH coexistence during onboarding), while preventing true duplicates within a source.

**Impact on SRQ:** The existing SRQ `saveTicketWithDetails` checks `source: 'EXTERNAL_API'` explicitly, so `@@unique([drawId, externalTicketId, source])` will not block SRQ inserts.

---

## SRQ deleteMany Safety Verification

**Verified safe — no change needed.**

From `api-integration.service.js` lines 321-329:
```javascript
const deleteResult = await prisma.ticket.deleteMany({
  where: { 
    drawId,
    source: 'EXTERNAL_API'   // ← already scoped to EXTERNAL_API only
  }
});
```

This is already correctly scoped. It will NOT delete `WEBHOOK_PUSH` tickets. The Phase 2 research notes from PITFALLS.md flagged this as a risk, but the actual code already handles it correctly. No modification needed to `api-integration.service.js`.

**Conclusion from REQUIREMENTS.md:** "Modifying SRQ deleteMany behavior" is explicitly listed as **Out of Scope** — and the code confirms it's already safe.

---

## Common Pitfalls

### Pitfall 1: Route Registered After express.json()

**What goes wrong:** `webhook.routes.js` uses `express.raw()` to capture raw body. If `express.json()` in `index.js` runs first, `req.body` is already a parsed `Object`, not a `Buffer`. `req.body.toString('utf8')` throws `TypeError: req.body.toString is not a function`.

**Why it happens:** `index.js` registers `app.use(express.json())` at line 99, before any route registrations (which start around line 182). The import of `webhookRoutes` and its registration must be placed in the import section AND the registration must happen before line 99.

**How to avoid:** Add to `index.js`:
- In the import block (after line 174): `import webhookRoutes from './routes/webhook.routes.js';`
- Before `app.use(express.json())` (before line 99): `app.use('/api/webhooks', webhookRoutes);`

**Warning signs:** `TypeError: rawBody.toString is not a function` in logs; `req.body` is `{}` or `{ field: value }` inside the webhook controller.

### Pitfall 2: Wrong Status Enum Value

**What goes wrong:** Code uses `status: 'NO_ADAPTER'`, `status: 'RECEIVED'`, or `status: 'DISCOVERY'` — none of which exist in the Phase 1 schema. Prisma throws `Invalid value for argument status` at runtime.

**Why it happens:** The ARCHITECTURE.md research used `NO_ADAPTER` and `RECEIVED` in examples. The actual Phase 1 schema uses `DISCOVERED`, `PROCESSED`, `DUPLICATE`, `FAILED`.

**Correct enum values (from `schema.prisma` lines 442-447):**
- `DISCOVERED` — default; no adapter exists (discovery mode)
- `PROCESSED` — adapter ran, ticket created
- `DUPLICATE` — ticket already existed
- `FAILED` — processing threw an error

**How to avoid:** Use enum values exactly as defined in schema. The Prisma client will enforce these at the type level in TypeScript but not in plain JS — runtime errors will occur silently if wrong values are used.

### Pitfall 3: Dynamic Import Path Fails Silently

**What goes wrong:** `import('../webhooks/adapters/slug.adapter.js')` resolves relative to the module calling it. In `services/webhook.service.js`, this is `backend/src/services/`, so the resolved path is `backend/src/services/../webhooks/adapters/...` = `backend/src/webhooks/adapters/`. This is correct, but only if the `webhooks/adapters/` directory exists. If the directory is missing, Node.js throws `ERR_MODULE_NOT_FOUND` — which is the same error as "adapter file not found." The service will treat a missing directory as discovery mode for all providers, masking the configuration error.

**How to avoid:** Create `backend/src/webhooks/adapters/.gitkeep` in Phase 2 Wave 1 before any other code runs. Verify the directory exists in production after deployment.

**Better approach:** Use `path.resolve(__dirname, '../webhooks/adapters/${slug}.adapter.js')` (absolute path) to make path resolution explicit and debuggable.

### Pitfall 4: timingSafeEqual Throws on Length Mismatch

**What goes wrong:** `crypto.timingSafeEqual(a, b)` throws `RangeError: Input buffers must have the same byte length` when `a.length !== b.length`.

**Why it happens:** An incoming token of different length than the stored token causes an unhandled exception in the middleware, propagating as a 500 error instead of 401.

**How to avoid:** Always check `incomingBuf.length !== storedBuf.length` before calling `timingSafeEqual`. If lengths differ, return 401 immediately without calling `timingSafeEqual`.

### Pitfall 5: Missing `webhooks/adapters/` Directory Breaks git

**What goes wrong:** An empty directory is not tracked by git. After `git clone` or `git pull` on production, `webhooks/adapters/` will not exist. The first webhook request will fail with `ENOENT` or `ERR_MODULE_NOT_FOUND` on directory resolution.

**How to avoid:** Add `backend/src/webhooks/adapters/.gitkeep` to the commit. Git tracks the file, which ensures the directory exists after any checkout.

---

## Code Examples

Verified patterns from codebase inspection and official sources:

### Existing `__dirname` Equivalent Pattern (from index.js lines 103-106)
```javascript
// Source: backend/src/index.js lines 103-106 — replicate in webhook.service.js
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

### Existing External Ticket Creation Pattern (from api-integration.service.js line 565-585)
```javascript
// Source: backend/src/services/api-integration.service.js lines 565-585
// This is the pattern to replicate for WEBHOOK_PUSH tickets — same fields, different source
await prisma.ticket.create({
  data: {
    drawId,
    source: 'EXTERNAL_API',     // Phase 2: use 'WEBHOOK_PUSH' instead
    externalTicketId: ticketData.externalTicketId,
    totalAmount,
    totalPrize: 0,
    status: 'ACTIVE',
    providerData: ticketData.providerData,
    details: {
      create: ticketData.details.map(detail => ({
        gameItemId: detail.gameItemId,
        amount: detail.amount,
        multiplier: detail.multiplier,
        prize: 0,
        status: 'ACTIVE'
      }))
    }
  }
});
```

### timingSafeEqual with Length Guard
```javascript
// Source: Node.js crypto docs + PITFALLS.md Security section
import crypto from 'crypto';

function compareTokens(incoming, stored) {
  const a = Buffer.from(incoming, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;       // length guard — prevents throw
  return crypto.timingSafeEqual(a, b);           // constant-time comparison
}
```

### Provider Route Registration Convention (from index.js line 223)
```javascript
// Source: backend/src/index.js line 223 — follow same pattern
app.use('/api/providers', providerRoutes);

// New webhook route (to be added BEFORE express.json() at line 99):
app.use('/api/webhooks', webhookRoutes);
```

### express.raw() on Router (not globally)
```javascript
// Source: ARCHITECTURE.md Pattern 1
// backend/src/routes/webhook.routes.js
import express from 'express';
import { webhookAuth } from '../middlewares/webhook-auth.middleware.js';
import webhookController from '../controllers/webhook.controller.js';

const router = express.Router();

// Raw body capture — must be first middleware on this router
router.use(express.raw({ type: '*/*', limit: '1mb' }));

router.post('/:providerSlug', webhookAuth, webhookController.receive.bind(webhookController));

export default router;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `require()` for dynamic module loading | ES dynamic `import()` | Node.js 12+, ES modules | Required because project uses `"type": "module"` — `require()` not available |
| `===` token comparison | `crypto.timingSafeEqual()` | Security best practice | Prevents timing side-channel attacks; non-negotiable for secret comparison |
| Global `express.json()` for all routes | Per-router `express.raw()` for webhook routes | Express 4.16+ | Allows raw body access without global `verify` callback |

**Deprecated/outdated:**
- `express.bodyParser()`: Deprecated since Express 3; replaced by `express.json()` and `express.urlencoded()` — already correct in this codebase.
- `require()` dynamic loading: Cannot be used in this project due to ES module requirement.

---

## Open Questions

1. **Token comparison target — plain vs. DB-stored**
   - What we know: Phase 1 decision was to store tokens plain text (not hashed). Current schema has `webhookToken String? @unique` with no indication of hashing.
   - What's unclear: If a future phase adds bcrypt hashing, `timingSafeEqual` won't work (bcrypt comparison is async and different). The auth middleware must be designed to tolerate this change.
   - Recommendation: Implement with plain-text `timingSafeEqual` now. Add a comment: `// TODO: If webhookToken is hashed in future, replace with bcrypt.compare()`.

2. **Adapter normalization contract — what does `normalize()` return?**
   - What we know: No real adapter exists yet. Phase 2 creates the infrastructure; adapters come in Phase 3+.
   - What's unclear: The exact shape of the normalized object is undefined until a provider's payload format is known.
   - Recommendation: Define a TypeScript-style JSDoc interface in `webhook.service.js` documenting what `createWebhookTicket` expects (`drawId`, `externalTicketId`, `totalAmount`, `details[]`). Phase 3 adapter must conform to this interface.

3. **`headers` field in `WebhookLog`**
   - What we know: Phase 1 schema has `headers Json?` on `WebhookLog`. This was added as a "hard dependency for Phase 4 log viewer" (LOGS-04).
   - What's unclear: Should Phase 2 populate `headers` when logging, or leave it null for now?
   - Recommendation: Populate `headers` in Phase 2 (it's one line: `headers: req.headers`). The field is nullable so it won't break if omitted, but populating it now means Phase 4 log viewer works with historical data.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | YES | v25.4.0 | — |
| `express` | Webhook router | YES | ^4.21.1 | — |
| `prisma` client | DB access | YES | ^6.16.3 | — |
| `zod` | Adapter validation | YES | ^3.23.8 | — |
| `crypto` (built-in) | `timingSafeEqual` | YES | Node.js built-in | — |
| PostgreSQL | DB backend | YES | 16 (Docker local) | — |
| `backend/src/webhooks/adapters/` | Dynamic import path | NOT YET (dir missing) | — | Create in Wave 1 |

**Missing dependencies with no fallback:**
- `backend/src/webhooks/adapters/` directory — must be created in Phase 2 Wave 1 before any code that imports from it.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (NODE_OPTIONS='--experimental-vm-modules') |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npm test -- --testPathPattern=webhook` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WHOOK-01 | `POST /api/webhooks/:slug` returns 200 with valid token | unit (middleware) | `npm test -- --testPathPattern=webhook-auth` | No — Wave 0 |
| WHOOK-02 | No adapter → `WebhookLog` created with status `DISCOVERED` | unit (service) | `npm test -- --testPathPattern=webhook.service` | No — Wave 0 |
| WHOOK-03 | Adapter found → `Ticket` created with `source=WEBHOOK_PUSH` | unit (service) | `npm test -- --testPathPattern=webhook.service` | No — Wave 0 |
| WHOOK-04 | Missing/invalid token → 401, no `WebhookLog` created | unit (middleware) | `npm test -- --testPathPattern=webhook-auth` | No — Wave 0 |
| WHOOK-05 | Duplicate payload → second call returns without new `Ticket` row | unit (service) | `npm test -- --testPathPattern=webhook.service` | No — Wave 0 |
| WHOOK-06 | Token comparison uses `timingSafeEqual` not `===` | unit (middleware) | `npm test -- --testPathPattern=webhook-auth` | No — Wave 0 |

**Test pattern reference** (from `backend/src/__tests__/terminal-pantera.test.js`):
- Uses `jest.unstable_mockModule` for Prisma singleton and logger
- Uses `jest.fn()` for all Prisma model methods
- Uses `@jest/globals` imports — not global jest

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --testPathPattern=webhook --forceExit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/webhook-auth.middleware.test.js` — covers WHOOK-01, WHOOK-04, WHOOK-06
- [ ] `backend/src/__tests__/webhook.service.test.js` — covers WHOOK-02, WHOOK-03, WHOOK-05
- [ ] Shared mock setup for `prisma.webhookLog` and `prisma.ticket` in test files

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `backend/src/index.js` — middleware chain order, route registration pattern, existing `__dirname` equivalent pattern
- Direct inspection: `backend/src/services/api-integration.service.js` — `deleteMany` scope confirmed safe at lines 321-329; external ticket creation pattern at lines 565-585
- Direct inspection: `backend/prisma/schema.prisma` — `ApiSystem`, `WebhookLog`, `WebhookLogStatus` enum, `TicketSource.WEBHOOK_PUSH`, `Ticket` model — Phase 1 changes confirmed in place
- Direct inspection: `backend/src/routes/provider.routes.js` — existing route file structure (additive extension pattern)
- Direct inspection: `backend/src/controllers/provider.controller.js` — existing controller class pattern
- Direct inspection: `backend/src/middlewares/auth.middleware.js` — JWT `authenticate` middleware (confirmed separate from webhook auth)
- Direct inspection: `backend/src/__tests__/terminal-pantera.test.js` — Jest mock pattern (`jest.unstable_mockModule`) used in this project
- Project research: `.planning/research/ARCHITECTURE.md` — component design, build order, anti-patterns
- Project research: `.planning/research/PITFALLS.md` — PULL+PUSH race (verified safe), idempotency, `timingSafeEqual` requirement
- Node.js docs: `crypto.timingSafeEqual` — Buffer comparison, length requirement

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — overall architecture approach, confirmed SRQ `deleteMany` already scoped

### Tertiary (LOW confidence)
- None — all claims verified against codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against `backend/package.json`; no new installs required
- Architecture: HIGH — derived from direct codebase inspection; route registration order verified in `index.js`
- Pitfalls: HIGH — each pitfall traced to specific line numbers in actual code
- Schema gap (WHOOK-05): HIGH — unique constraint absence confirmed by reading `schema.prisma`
- SRQ safety: HIGH — `deleteMany` scope confirmed safe at specific lines in `api-integration.service.js`

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase; no fast-moving dependencies)
