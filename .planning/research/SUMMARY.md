# Project Research Summary

**Project:** Multi-provider webhook ingestion system (tote-web PUSH extension)
**Domain:** PUSH-based webhook receiver integrated into existing Express/Prisma lottery backend
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

This project adds a PUSH-based webhook ingestion layer to an existing lottery management platform that currently polls one provider (SRQ) via a PULL mechanism. The recommended approach is entirely additive: no existing packages need replacing, no major refactors are required. All cryptographic and validation needs are covered by Node.js built-in `crypto`, `express.json({ verify })` raw body capture, and the already-installed `express-rate-limit` and `zod` packages. The new subsystem introduces a file-based adapter pattern (one file per provider slug) that allows new providers to be onboarded by dropping a file into `webhooks/adapters/` — no registry, no configuration changes.

The two highest-risk decisions are architectural: whether to process tickets synchronously or asynchronously, and how to prevent the existing SRQ PULL sync from clobbering PUSH-created tickets. Both must be resolved in Phase 1, before any adapter ships. The synchronous path is simpler but creates a retry storm risk during the draw-close window (5:55–6:00 PM) when the DB is maximally loaded. The PULL/PUSH coexistence risk is concrete: `sync-api-tickets.job.js` runs `deleteMany({ source: 'EXTERNAL_API' })` every 5 minutes; this will silently delete any webhook-created tickets unless the `deleteMany` is source-scoped before the first PUSH provider goes live.

The overall build is well-understood: 9 sequential components in a clear dependency order, all fitting within the existing codebase conventions. The admin UI work is an extension of the existing provider management page and follows established Next.js + TailwindCSS patterns already present in the repo. Confidence is high across all research areas because the architecture research was based on direct codebase inspection rather than external guesswork.

## Key Findings

### Recommended Stack

No new packages are required. The existing stack covers every technical need: raw body capture via the `verify` option of `express.json()` (built into Express 4.16+), HMAC and token cryptography via Node.js built-in `crypto`, per-provider rate limiting via the already-installed `express-rate-limit@^7.4.1` with `keyGenerator`, and adapter payload validation via `zod@^3.23.8` with `safeParse`. The only code change to existing infrastructure is adding the `verify` callback to the global `express.json()` call in `src/index.js`.

**Core technologies:**
- `express.json({ verify })` built-in: raw body preservation — canonical pattern from Stripe/GitHub docs, zero dependencies
- Node.js `crypto.randomBytes` + `timingSafeEqual`: token generation and comparison — required to prevent timing attacks; never use `===`
- `express-rate-limit` (already installed): per-provider rate limiting via `keyGenerator: (req) => req.apiSystem.slug` — isolates webhook traffic from browser API budget
- `zod` (already installed): adapter-level payload validation via `safeParse` — never throws, returns discriminated union
- `uuid` (already installed): `WebhookLog` record IDs

### Expected Features

**Must have (table stakes):**
- `POST /api/webhooks/:slug` endpoint with `X-Webhook-Token` header auth — the core receiver; providers cannot connect without it
- Raw payload logged to `WebhookLog` on every request before any processing — idempotency source and discovery audit trail
- Discovery mode: return 200 and log when no adapter file exists — prevents payload loss during provider onboarding
- Provider CRUD UI extensions: PULL/PUSH mode toggle, slug field, token generation button — operators cannot onboard providers without these
- Webhook log viewer in admin dashboard: table with provider, time, status, payload preview — operators need visibility into what arrived
- Schema migration: `ApiSystem` gets `slug`, `webhookToken`, `mode`; new `WebhookLog` model — hard dependency for everything else

**Should have (differentiators):**
- Payload inspector modal in log viewer: formatted JSON view with copy-to-clipboard — accelerates adapter development
- Replay feature: re-run stored `rawPayload` through current adapter without waiting for provider resend — critical during adapter bugs
- Processing status on log entries: RECEIVED / PROCESSED / NO_ADAPTER / DUPLICATE / ERROR / UNRESOLVABLE_DRAW — operational clarity
- Adapter status badge per provider (Adapter ready vs Discovery mode) — derived from filesystem check

**Defer (v2+):**
- Webhook metrics dashboard (volume per provider, error rates) — deferred until 3+ providers live
- HMAC signature verification — deferred; regional lottery providers unlikely to implement it
- Log retention policy / auto-cleanup — deferred until log table grows large enough to matter
- Provider health status (last seen, error rate) — deferred until monitoring burden emerges

### Architecture Approach

The architecture is a standard layered webhook receiver: an Express router mounts at `/api/webhooks` with its own `express.raw()` body capture middleware before the global `express.json()` runs. A dedicated `webhook-auth.middleware.js` handles token lookup (DB query against `ApiSystem`) and attaches `req.apiSystem`. `webhook.service.js` executes the core flow: log raw payload, attempt dynamic import of `webhooks/adapters/{slug}.adapter.js`, run normalization if adapter found, create ticket via Prisma transaction. All responses to the provider return HTTP 200 regardless of processing outcome — errors are surfaced in `WebhookLog.status`, never via HTTP error codes.

**Major components:**
1. `middlewares/webhook-auth.middleware.js` — token lookup, attaches `req.apiSystem`; separate from JWT `auth.middleware.js`
2. `services/webhook.service.js` — log raw payload, dynamic adapter import, ticket creation, status update
3. `webhooks/adapters/{slug}.adapter.js` — per-provider payload normalization; file presence = adapter ready, file absent = discovery mode
4. `prisma schema: ApiSystem` (modified) — adds `slug`, `webhookToken`, `mode` (PULL/PUSH), `isActive` fields
5. `prisma schema: WebhookLog` (new) — raw payload storage with status enum and `ticketId` FK for idempotency
6. `frontend/app/admin/proveedores/webhook-logs/page.js` (new) — admin log viewer
7. `controllers/provider.controller.js` (modified) — adds `generateToken()` and `getWebhookLogs()` methods

### Critical Pitfalls

1. **PULL + PUSH race condition** — `sync-api-tickets.job.js` runs `deleteMany({ source: 'EXTERNAL_API' })` every 5 minutes. Before the first PUSH provider goes live, this `deleteMany` must be source-scoped to only delete `EXTERNAL_API` tickets, not `WEBHOOK_PUSH` tickets. Add a DB unique constraint `@@unique([drawId, externalTicketId, source])` to reject duplicates at the DB level regardless of timing.

2. **Duplicate tickets from provider retries (no idempotency)** — Providers guarantee at-least-once delivery. Without idempotency, retry after a network blip creates a second Ticket row for the same bet. Prevention: store `webhookEventId` (provider's delivery ID) in `WebhookLog`; check it before processing; use Prisma `$transaction` with unique constraint enforcement; always return 200 even for duplicates.

3. **Slow adapter causes timeout retry storm during draw-close** — The draw-close window (5:55–6:00 PM) is when the DB is busiest and when providers most likely send final bet webhooks. Synchronous ticket creation during this window risks exceeding provider response timeouts (typically 5 seconds), triggering retries that compound load. Decision: lock the sync-vs-async architecture in Phase 1; if sync, add a 3-second adapter execution timeout with async fallback.

4. **Token leaked in logs** — The existing Winston request logger logs enough context that a provider mistakenly sending the token in the query string will expose it in `combined.log`. Prevention: enforce header-only token (`X-Webhook-Token`); add a log sanitizer; store tokens hashed (bcrypt already in project at `^5.1.1`); show token only once in admin UI.

5. **Missing draw mapping silently discards bets** — Adapter cannot map provider draw ID to local `Draw` UUID if `ApiDrawMapping` is not populated. Must log `WebhookLog.status = 'UNRESOLVABLE_DRAW'` with raw provider draw ID instead of silently discarding. Send Telegram admin alert when this status appears. Include in Phase 1.

6. **Venezuela timezone mismatch** — Providers may send timestamps in UTC; `Draw.drawDate` stores Venezuela calendar date as UTC midnight. Draws at 8:00 PM Venezuela (00:00 UTC next day) will fail to resolve. All adapters must normalize timestamps using `lib/dateUtils.getVenezuelaDateAsUTC()` before draw lookup. Document this as the adapter interface contract.

## Implications for Roadmap

Based on research, the dependency order is strict and well-defined. Six of the critical pitfalls must be addressed in Phase 1 — not Phase 2 or later. The admin UI work can be parallelized with adapter development in a later phase.

### Phase 1: Webhook Infrastructure Foundation

**Rationale:** Everything else depends on this. Schema migration unblocks all subsequent work. The PULL/PUSH race condition and idempotency constraints must be in place before any provider sends live traffic — retrofitting these after the first adapter ships causes data integrity incidents in a real-money system.

**Delivers:** A working webhook endpoint that safely receives, logs, and acknowledges payloads from any provider with a valid token; discovery mode for providers without adapters; source-scoped SRQ sync that won't clobber PUSH tickets.

**Addresses features from FEATURES.md:**
- `ApiSystem` schema extension (slug, webhookToken, mode, isActive) — P1 blocker
- `WebhookLog` Prisma model with full status enum including `UNRESOLVABLE_DRAW` — P1 blocker
- `POST /api/webhooks/:slug` with token auth middleware — P1 core
- Discovery mode (log + 200 when no adapter) — P1 core
- `WEBHOOK_PUSH` enum value in `TicketSource`

**Avoids (from PITFALLS.md):**
- PULL/PUSH race: source-scope `deleteMany` in `sync-api-tickets.job.js` before endpoint is live
- Duplicate tickets: DB unique constraint `@@unique([drawId, externalTicketId, source])` + idempotency check in service
- Token leaks: header-only enforcement, log sanitizer, bcrypt storage
- Missing draw mapping: `UNRESOLVABLE_DRAW` status + Telegram alert hook
- Timezone: `getVenezuelaDateAsUTC()` utility documented as adapter contract
- Sync/async decision: locked in this phase (recommendation: log + return 200 first, process asynchronously)

**Build order within this phase** (from ARCHITECTURE.md):
1. Schema migration (unblocks everything)
2. `webhooks/adapters/` directory stub
3. `webhook-auth.middleware.js`
4. `webhook.service.js`
5. `webhook.controller.js` + `webhook.routes.js`
6. Register route in `index.js` (before global `express.json()`)
7. Modify `sync-api-tickets.job.js` source-scope (safety prerequisite before route is live)

### Phase 2: Admin Provider Management Extensions

**Rationale:** Operators need to onboard providers (generate tokens, set slugs, toggle PULL/PUSH mode) and see what payloads are arriving. This unblocks adapter development by giving developers raw payload samples to work from. Should be built before the first real adapter, not after.

**Delivers:** Extended provider management UI with token generation, PULL/PUSH mode toggle, slug field; webhook log viewer with status filtering; payload inspector modal.

**Addresses features from FEATURES.md:**
- Provider CRUD UI extensions (mode, token gen, slug) — P1
- Token generation UI (show-once UX, bcrypt hash on save) — P1
- Webhook log viewer — P1
- Payload inspector modal — P2

**Uses (from STACK.md):**
- `crypto.randomBytes(32).toString('hex')` for token generation in `provider.controller.js`
- Masked token display (show once after generation, `tote_...f3a2` thereafter)

**Implements (from ARCHITECTURE.md):**
- `GET /api/providers/webhook-logs` + `POST /api/providers/systems/:id/generate-token`
- `frontend/app/admin/proveedores/page.js` modifications
- `frontend/app/admin/proveedores/webhook-logs/page.js` (new)

**Avoids (from PITFALLS.md):**
- Token visible in admin list: return only masked token in API responses after creation
- Token shown multiple times: show-once copy pattern in UI

### Phase 3: First Adapter + Ticket Creation

**Rationale:** Adapter development can only start after Phase 1 infrastructure is live and Phase 2 UI is providing real payload samples from discovery mode. This phase wires the first real provider end-to-end and validates the entire pipeline with live data.

**Delivers:** First concrete adapter for one provider; real ticket creation from webhook payloads; duplicate detection validation with live data; replay feature for adapter development iteration.

**Addresses features from FEATURES.md:**
- Real-time ticket creation via adapter — P2 (after discovery data)
- Processing status tracking (DUPLICATE detection via `ticketId` FK) — P2
- Replay feature — P2
- Adapter status indicator badge — P2

**Avoids (from PITFALLS.md):**
- Venezuela timezone: adapter unit tests with 8:00 PM boundary case
- N+1 queries in adapter: batch `gameItem` lookups before processing details
- Provider cancellation events: adapter must handle `anulado` events

### Phase 4: Operational Hardening

**Rationale:** After at least one adapter is live and producing tickets, operational concerns become real. Log growth, monitoring gaps, and security hardening can be addressed with production data to guide decisions.

**Delivers:** Log retention policy; provider health status display; replay button in log viewer; WebhookLog growth management; timestamp validation (anti-replay attack).

**Addresses features from FEATURES.md:**
- Webhook log retention policy — v2+
- Provider health status (last seen, error rate) — v2+
- Webhook metrics dashboard — v2+ (defer until 3+ providers)

**Avoids (from PITFALLS.md):**
- Unbounded `WebhookLog` growth: retention job + index on `(apiSystemId, createdAt)`
- Timestamp validation: `X-Webhook-Timestamp` header enforcement, 300-second window
- IP allowlist per provider in `ApiSystem` (if needed)

### Phase Ordering Rationale

- **Schema first in Phase 1** because every other component depends on `ApiSystem.slug`, `ApiSystem.webhookToken`, and `WebhookLog`. This is the hard blocker documented in both FEATURES.md and ARCHITECTURE.md.
- **PULL sync fix before route goes live** because the race condition (PITFALL 1) can silently delete real-money bets from the first day. This must precede any live provider traffic.
- **Admin UI in Phase 2, not Phase 1** because it depends on the backend API endpoints from Phase 1, and its absence doesn't block the webhook endpoint from functioning.
- **First adapter in Phase 3** because adapter development benefits from real payload samples captured in discovery mode during Phase 1/2. Writing an adapter blind (before seeing real provider payloads) leads to normalizer errors and requires multiple redeploys.
- **Operational hardening in Phase 4** because the right retention policy and monitoring thresholds can only be determined from real production traffic volume.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (First adapter):** Provider-specific payload format is unknown until discovery mode produces real samples. Adapter design cannot be fully specified until the target provider's payload structure is documented or observed. Flag for research when the specific provider is identified.
- **Phase 4 (Operational hardening):** Log retention requirements depend on regulatory/compliance context (lottery platforms in Venezuela may have record-keeping requirements). Verify before choosing a retention window.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Webhook infrastructure):** All patterns are well-documented and verified in STACK.md and ARCHITECTURE.md. Dynamic import, token auth, raw body capture — all have direct codebase precedents.
- **Phase 2 (Admin UI):** Follows existing Next.js + TailwindCSS + Zustand patterns already in `frontend/app/admin/`. No new UI patterns required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against existing `package.json`; no new installs required; patterns from official Stripe/Node.js docs |
| Features | MEDIUM | Table stakes features are well-understood; betting-specific webhook features are inferred from patterns (no direct lottery webhook documentation found) |
| Architecture | HIGH | Based on direct codebase inspection; component boundaries derived from existing file structure; dynamic import pattern already used in `queue/register.js` |
| Pitfalls | HIGH | PULL/PULL race condition and idempotency pitfalls verified against actual source code in `sync-api-tickets.job.js` and `api-integration.service.js`; not theoretical |

**Overall confidence:** HIGH

### Gaps to Address

- **Provider payload format:** No research can determine what the first PUSH provider's webhook payload looks like. Discovery mode is specifically designed to capture this. Phase 3 adapter work is blocked on payload samples from production discovery mode.
- **Sync vs. async processing decision:** Research documents both options but the final decision depends on measured DB response times during draw-close load on production hardware. The recommendation is async (log first, process in background), but this should be confirmed with a load test before Phase 1 ships.
- **Token storage: plain vs. hashed:** Research recommends hashed storage (bcrypt already in project). Final decision should be made with the operator — if tokens must be displayable after creation for provider configuration retrieval, hashing makes re-display impossible without regeneration.
- **`ApiSystem` slug for existing SRQ record:** Migration requires backfilling `slug = 'srq'` for the existing SRQ `ApiSystem` row. The migration strategy (nullable-first vs. default value) must be confirmed before the Phase 1 migration runs against production.

## Sources

### Primary (HIGH confidence)
- Node.js Crypto API Docs — `randomBytes`, `createHmac`, `timingSafeEqual`
- Stripe Webhook Signature Docs — raw body + `timingSafeEqual` canonical pattern
- express-rate-limit Configuration Docs — `keyGenerator` API, v7 feature set
- Tote-web codebase: `backend/src/index.js`, `backend/prisma/schema.prisma`, `backend/src/middlewares/auth.middleware.js`, `backend/src/services/api-integration.service.js`, `backend/src/jobs/sync-api-tickets.job.js`, `backend/src/queue/register.js`, `frontend/app/admin/proveedores/page.js`

### Secondary (MEDIUM confidence)
- Hookdeck — webhook idempotency, webhook data integrity guides
- Svix — webhook timeout best practices, security best practices
- webhooks.fyi — replay prevention, provider best practices
- Beeceptor, SystemDesignHandbook.com — webhook architecture patterns
- DEV Community — HMAC signing, webhook-at-scale patterns

### Tertiary (LOW confidence)
- Lottery-specific webhook documentation — none found; patterns extrapolated from payment webhook documentation

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
