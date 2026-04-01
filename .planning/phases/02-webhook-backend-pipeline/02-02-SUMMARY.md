---
phase: 02-webhook-backend-pipeline
plan: 02
subsystem: webhook-pipeline
tags: [webhook, auth, middleware, express, prisma, adapter-pattern, idempotency]

# Dependency graph
requires:
  - phase: 02-webhook-backend-pipeline
    plan: 01
    provides: DB unique constraint on (drawId, externalTicketId, source) + adapters directory
provides:
  - Token auth middleware (webhookAuth) with timing-safe comparison
  - Core dispatch service (dispatchWebhook) with log-first + adapter loading
  - HTTP controller (receive) always returning 200 after auth
  - Express router with express.raw() body handling
affects: [02-webhook-backend-pipeline, webhook-subsystem]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Log-first dispatch: WebhookLog(DISCOVERED) written before any adapter attempt"
    - "Dynamic adapter loading via import() with ERR_MODULE_NOT_FOUND discovery mode"
    - "Timing-safe token comparison with Buffer length guard before crypto.timingSafeEqual"
    - "Always-200 webhook controller: errors in WebhookLog.status not HTTP status"

key-files:
  created:
    - backend/src/middlewares/webhook-auth.middleware.js
    - backend/src/services/webhook.service.js
    - backend/src/controllers/webhook.controller.js
    - backend/src/routes/webhook.routes.js
  modified: []

key-decisions:
  - "Token comparison done client-side after DB fetch — DB query does not filter by webhookToken to avoid timing leakage from query plan differences"
  - "Length guard before timingSafeEqual is mandatory — the Node.js function throws (not returns false) on length mismatch"
  - "dispatchWebhook never rethrows — all errors are captured in WebhookLog.status; controller always returns 200"
  - "express.raw({ type: '*/*', limit: '1mb' }) applied at router level so req.body is a Buffer before webhookAuth or receive runs"

patterns-established:
  - "Adapter contract: normalize(parsedPayload) returns { drawId, externalTicketId, totalAmount, providerData?, details: [{ gameItemId, amount, multiplier }] }"
  - "Idempotency check in createWebhookTicket: findFirst(drawId + externalTicketId + source=WEBHOOK_PUSH) before create"
  - "Duplicate detection updates log to DUPLICATE status and returns existing ticket (no second DB insert)"

requirements-completed: [WHOOK-01, WHOOK-02, WHOOK-03, WHOOK-04, WHOOK-06]

# Metrics
duration: 8min
completed: 2026-04-01
---

# Phase 02 Plan 02: Webhook Auth, Service, Controller, Routes Summary

**Complete webhook receiver pipeline: timing-safe token auth middleware, log-first dispatch service with dynamic adapter loading, thin HTTP controller, and Express router with raw body parsing — subsystem fully implemented but not yet registered in index.js**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Created `webhook-auth.middleware.js` with named export `webhookAuth`:
  - Rejects missing X-Webhook-Token header immediately (pre-DB 401)
  - Queries `ApiSystem` by `slug` + `isActive=true` + `mode=PUSH`
  - Buffer length guard before `crypto.timingSafeEqual` to prevent throw on mismatch
  - Attaches `req.apiSystem` and calls `next()` on success

- Created `webhook.service.js` with named export `dispatchWebhook`:
  - Step 1 (always): `prisma.webhookLog.create({ status: 'DISCOVERED' })`
  - Step 2: dynamic `import()` of `webhooks/adapters/{slug}.adapter.js`
  - `ERR_MODULE_NOT_FOUND` → returns `{ status: 'discovery' }`, log stays `DISCOVERED`
  - Other import error → log updated to `FAILED` with error message
  - Step 3 (adapter found): `adapter.normalize()` + `createWebhookTicket()` with idempotency
  - All adapter/ticket errors caught and returned as `{ status: 'failed' }` — never rethrown

- Created `webhook.controller.js` with named export `receive`:
  - Calls `dispatchWebhook(req.apiSystem, req.body, req.headers)`
  - Always returns HTTP 200 after auth passes
  - Catch-all catches truly unhandled errors and still returns 200

- Created `webhook.routes.js` with default export (Express router):
  - `express.raw({ type: '*/*', limit: '1mb' })` applied at router level (first)
  - `POST /:providerSlug` bound to `webhookAuth, receive`

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create webhook-auth.middleware.js | `09f7959` |
| 2 | Create webhook service, controller, routes | `0a6a308` |

## Files Created

- `backend/src/middlewares/webhook-auth.middleware.js` — Token auth middleware
- `backend/src/services/webhook.service.js` — Core dispatch with log-first + adapter pattern
- `backend/src/controllers/webhook.controller.js` — Thin always-200 HTTP handler
- `backend/src/routes/webhook.routes.js` — Express router with raw body parsing

## Decisions Made

1. **Token comparison after DB fetch (not in query WHERE):** Avoids timing leakage from query plan differences when matching token values in the database engine.
2. **Length guard before timingSafeEqual:** Node's `crypto.timingSafeEqual` throws a `RangeError` if the two Buffers have different byte lengths — the guard converts this from a runtime error into a clean 401.
3. **Always-200 controller:** Webhook providers retry on non-200 responses. Processing failures are observable via `WebhookLog.status`, not via HTTP status codes.
4. **`express.raw()` at router level (not app level):** Avoids interfering with `express.json()` used by all other routes. The raw body must arrive as a `Buffer` so adapters can inspect the original bytes before any JSON parse attempt.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stub data or placeholders introduced.

## Self-Check: PASSED

Files verified:
- `backend/src/middlewares/webhook-auth.middleware.js` FOUND
- `backend/src/services/webhook.service.js` FOUND
- `backend/src/controllers/webhook.controller.js` FOUND
- `backend/src/routes/webhook.routes.js` FOUND

Commits verified:
- `09f7959` FOUND (feat(02-02): create webhook-auth.middleware.js)
- `0a6a308` FOUND (feat(02-02): create webhook service, controller, routes)

## Next Phase Readiness

- All four webhook subsystem files are implemented and load cleanly
- The subsystem is NOT yet active — route registration in `index.js` is Plan 03's responsibility
- Plan 03 must register the webhook router BEFORE `app.use(express.json())` on line 99 of `index.js`
- Plan 03 can also implement the admin provider CRUD endpoints for token management

---
*Phase: 02-webhook-backend-pipeline*
*Completed: 2026-04-01*
