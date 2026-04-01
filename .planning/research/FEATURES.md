# Feature Research

**Domain:** Multi-provider webhook ingestion system for lottery/betting platform
**Researched:** 2026-04-01
**Confidence:** MEDIUM (pattern research HIGH; betting-specific webhook specifics LOW — no direct comparable lottery webhook docs found)

## Feature Landscape

### Table Stakes (Users Expect These)

Features operators and integrators assume exist. Missing any of these means the system is not usable as a webhook platform.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single POST endpoint per provider slug | Every webhook system routes by provider identifier — `POST /api/webhooks/:slug` is the standard shape | LOW | Slug comes from extended `ApiSystem.slug` field (already in schema at line 21 of schema.prisma) |
| Token-based auth per provider | Providers must prove identity before any payload is processed; header token (`X-Webhook-Token` or `Authorization: Bearer`) is the minimum viable auth | LOW | Token stored in `ApiSystem.webhookToken`; middleware validates before routing |
| HTTP 200 returned immediately | All major providers (Stripe, GitHub, PayPal) document that slow or error responses trigger retries; responding before processing is non-negotiable | LOW | Return `{ received: true }` synchronously; process after |
| Raw payload logged to DB on every request | Operators need audit trail; discovery mode requires this for unknown adapters; also idempotency check source | MEDIUM | New `WebhookLog` model needed; log: slug, raw body (JSON), headers subset, timestamp, processing status, adapter found Y/N |
| Provider CRUD admin UI | Operators must be able to add/edit/disable providers without code changes | MEDIUM | Extends existing `/admin` dashboard; needs PULL/PUSH mode toggle; extends existing `/api/providers/systems` CRUD |
| Token generation UI | Manually crafting secure tokens is error-prone; UI must generate and reveal tokens once | LOW | `crypto.randomBytes(32).toString('hex')` pattern; show-once UX on creation |
| Webhook log viewer in admin dashboard | Operators need to see what payloads arrived, when, and whether they were processed | MEDIUM | Table with: provider, timestamp, payload preview, status (PROCESSED/LOGGED/FAILED), link to raw JSON |
| Adapter not-found → log-only mode (discovery) | When a provider starts sending before their adapter is built, payloads must not be dropped silently | LOW | If `adapters/{slug}.adapter.js` does not exist, log the raw payload and return 200 — no error |

### Differentiators (Competitive Advantage)

Features that make this system better than a generic webhook receiver, relevant to the lottery management context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Payload inspector in admin UI | Operators can click any log entry and see the full raw JSON, headers, and processing result — accelerates adapter development by showing exactly what providers send | MEDIUM | Modal/drawer with formatted JSON view, copy-to-clipboard; feeds directly into adapter writing workflow |
| Adapter status indicator per provider | Admin immediately knows which providers have a wired adapter vs are in discovery mode — operational clarity | LOW | Badge on provider card: "Adapter ready" vs "Discovery mode"; derived from filesystem check at startup or config flag |
| Replay single webhook entry | Re-process a logged payload through the current adapter without waiting for provider to re-send — critical during adapter development and bug fixes | MEDIUM | Button in log viewer: fetches raw body from `WebhookLog`, re-runs through adapter pipeline; does NOT re-run if ticket already created (idempotency check) |
| Processing status on log entries | Distinguish between DISCOVERED (no adapter), PROCESSED (ticket created), DUPLICATE (idempotency hit), FAILED (adapter threw) — gives operators a full picture | LOW | Enum field on `WebhookLog.status`; set by webhook handler after each attempt |
| Provider mode badge in UI (PULL vs PUSH) | Operators managing both SRQ (PULL) and new webhook providers (PUSH) need visual distinction to avoid confusion | LOW | Chip/badge in provider list; `ApiSystem.mode` enum field (already planned per PROJECT.md) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Queue-based webhook processing | "What if processing is slow?" — teams instinctively reach for queues | Adds pg-boss job + worker complexity for expected low volume; makes replay harder; PROJECT.md explicitly scoped this out | Process synchronously in request handler; if timeout risk emerges in a later milestone, add queue then |
| HMAC signature verification | "Proper" webhook security uses HMAC-SHA256 like Stripe | External lottery providers in this region are unlikely to implement HMAC; adds onboarding friction; token-in-header is sufficient for internal providers | Bearer token auth; add HMAC as optional per-provider config in a future milestone if a provider requires it |
| Webhook retry FROM this system | Retrying outbound webhooks is for when this system is the sender, not receiver | This system is the receiver, not sender; providers own retry logic; adds complexity with no value here | Log failures; operators can use replay feature manually if needed |
| Full payload PII masking/scrubbing before storage | "We store raw payloads, we need GDPR compliance" | Lottery ticket payloads in Venezuela do not contain GDPR-level PII; scrubbing before storage would destroy the discovery mode value | Log raw payloads as-is; revisit if a provider sends PII in a future milestone |
| Per-provider rate limiting | "Protect the system from floods" | Providers are trusted internal partners, not public internet traffic; rate limiting adds middleware complexity | Validate token (rejects unauthenticated requests); if abuse occurs, disable provider in UI |
| Automatic adapter scaffolding from observed payloads | "Generate the adapter code from logged payloads" | Code generation for business logic is unreliable; requires LLM or complex heuristics | Use payload inspector + copy-to-clipboard; developer writes the adapter manually using the logged sample |

## Feature Dependencies

```
[Token auth middleware]
    └──required by──> [Webhook endpoint (POST /api/webhooks/:slug)]
                          └──required by──> [Raw payload logging (WebhookLog)]
                                                └──required by──> [Webhook log viewer UI]
                                                └──required by──> [Payload inspector UI]
                                                └──required by──> [Replay feature]

[Provider CRUD UI (PUSH mode)]
    └──required by──> [Token generation UI]
    └──required by──> [Adapter status indicator]

[ApiSystem schema extension (slug, webhookToken, mode)]
    └──required by──> [Token auth middleware]
    └──required by──> [Provider CRUD UI (PUSH mode)]

[WebhookLog model (Prisma migration)]
    └──required by──> [Raw payload logging]
    └──required by──> [Webhook log viewer UI]
    └──required by──> [Replay feature]

[Adapter file (webhooks/adapters/{slug}.adapter.js)]
    └──required by──> [Real-time ticket creation]
    └──enhances──> [Adapter status indicator]

[Existing Ticket/TicketDetail models (source=EXTERNAL_API)]
    └──required by──> [Real-time ticket creation from adapter]
    └──already built──> no migration needed for basic ticket creation
```

### Dependency Notes

- **Schema extension required before anything else:** `ApiSystem` needs `slug`, `webhookToken`, and `mode` fields before the auth middleware can function. This is the hard Phase 1 blocker.
- **WebhookLog model required before log viewer:** The Prisma migration for `WebhookLog` must land before the admin UI log viewer can display anything meaningful.
- **Replay requires idempotency:** Replay must check whether a ticket was already created from a given log entry. The `WebhookLog` needs a `ticketId` FK or a `status` enum to prevent double-creation on replay.
- **Adapter file not required for Phase 1:** Discovery mode works without any adapter. The file's existence is checked at request time, not at startup.
- **Existing `Ticket` model usable as-is:** `source = 'EXTERNAL_API'` and `providerData: Json` already exist. No migration needed to create tickets from webhook data — the adapter just maps to the existing shape.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to receive, log, and inspect external webhook payloads.

- [ ] `ApiSystem` schema extension: add `slug` (unique), `webhookToken`, `mode` (PULL/PUSH) — unblocks everything
- [ ] `WebhookLog` Prisma model: `id`, `apiSystemId`, `slug`, `rawBody: Json`, `headers: Json`, `status` (DISCOVERED/PROCESSED/DUPLICATE/FAILED), `ticketId?`, `createdAt` — enables all logging and viewer features
- [ ] Webhook endpoint `POST /api/webhooks/:slug` with token auth middleware — the core receiver
- [ ] Discovery mode: log raw payload + return 200 when no adapter file found — prevents payload loss during onboarding
- [ ] Provider CRUD UI extensions: add PULL/PUSH mode toggle, token generation button, slug field — operators can onboard providers
- [ ] Webhook log viewer in admin dashboard: table with provider, time, status, payload preview — operators can see what arrived

### Add After Validation (v1.x)

Features to add once core ingestion is confirmed working with at least one real provider.

- [ ] Payload inspector modal — add when operators start building adapters and need to inspect samples
- [ ] Replay feature — add when first adapter is being developed and developers need to re-run without waiting for provider
- [ ] Real-time ticket creation via first adapter — add when provider payload format is known from discovery logs
- [ ] Processing status tracking (DUPLICATE detection via `ticketId` check) — add when first adapter is wired

### Future Consideration (v2+)

Features to defer until multiple adapters are running in production.

- [ ] Webhook log retention policy / auto-cleanup — add when log table grows large enough to matter
- [ ] HMAC signature verification (optional per-provider) — add if a provider requires it
- [ ] Webhook metrics dashboard (volume per provider, error rates, latency) — add when operating 3+ providers
- [ ] Provider health status (last seen, error rate) — add when monitoring multiple live providers becomes operational burden

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| ApiSystem schema extension (slug/token/mode) | HIGH | LOW | P1 |
| WebhookLog Prisma model | HIGH | LOW | P1 |
| POST /api/webhooks/:slug endpoint + token auth | HIGH | LOW | P1 |
| Discovery mode (log-only when no adapter) | HIGH | LOW | P1 |
| Provider CRUD UI extensions (mode, token gen) | HIGH | MEDIUM | P1 |
| Webhook log viewer (admin dashboard) | HIGH | MEDIUM | P1 |
| Payload inspector modal | MEDIUM | LOW | P2 |
| Replay feature | MEDIUM | MEDIUM | P2 |
| Adapter status indicator (badge in UI) | LOW | LOW | P2 |
| Real-time ticket creation via adapter | HIGH | MEDIUM | P2 (after discovery data) |
| Provider health monitoring | LOW | MEDIUM | P3 |
| HMAC signature verification | LOW | MEDIUM | P3 |
| Webhook metrics dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — system is not functional without these
- P2: Should have — add once P1 is confirmed working with real provider traffic
- P3: Nice to have — future consideration after multiple adapters live

## Competitor Feature Analysis

Direct lottery/webhook platform comparisons are not publicly available. Patterns drawn from analogous webhook management platforms (Hookdeck, Svix, Stripe) and internal system design.

| Feature | Hookdeck / Svix (SaaS webhook platforms) | Stripe Webhook Handling | Our Approach |
|---------|------------------------------------------|-------------------------|--------------|
| Provider routing | Source → destination routing by URL/token | Single endpoint, event type routing | Slug in URL path (`/webhooks/:slug`), adapter file per slug |
| Payload logging | Full request log with replay UI | Dashboard log viewer, 30-day retention | `WebhookLog` table, no expiry in v1 |
| Auth | HMAC signatures, OAuth | HMAC-SHA256 with `Stripe-Signature` header | Bearer token per provider (simpler, sufficient for internal providers) |
| Discovery / unknown events | Drops unknowns or routes to catch-all | Ignores unhandled event types | Log-first: always store raw; adapter presence determines whether to create ticket |
| Replay | UI replay with idempotency | API replay endpoint | Admin UI button on log entry; idempotency via `WebhookLog.ticketId` check |
| Admin UI | Embeddable Svix dashboard or Hookdeck portal | Stripe Dashboard | Extends existing `/admin` Next.js routes |

## Implementation Notes: Existing Model Dependencies

| Feature | Depends On (Existing) | What's Missing |
|---------|----------------------|----------------|
| Token auth middleware | `ApiSystem.webhookToken` | Field doesn't exist yet — add in migration |
| Slug-based routing | `ApiSystem.slug` | Field exists at schema line 21 (Game model) — `ApiSystem` needs its own `slug` |
| Ticket creation from adapter | `Ticket.source = 'EXTERNAL_API'`, `Ticket.providerData` | Already exists; adapter normalizes to this shape |
| Log viewer API endpoint | `WebhookLog` model | Model doesn't exist yet — new migration required |
| Provider CRUD extensions | Existing `/api/providers/systems` CRUD | Add `slug`, `webhookToken`, `mode` to create/update endpoints |

## Sources

- [Webhook Architecture Design Pattern — Beeceptor](https://beeceptor.com/docs/webhook-feature-design/) — MEDIUM confidence
- [Design a Webhook System — System Design Handbook](https://www.systemdesignhandbook.com/guides/design-a-webhook-system/) — MEDIUM confidence
- [Webhook Security Best Practices 2025-2026 — DEV Community](https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n) — MEDIUM confidence
- [Best Practices for Webhook Providers — webhooks.fyi](https://webhooks.fyi/best-practices/webhook-providers) — MEDIUM confidence
- [Designing payment webhook — TianPan.co](https://tianpan.co/notes/166-designing-payment-webhook) — MEDIUM confidence
- [Enterprise Realtime Webhooks Reliability Guide 2025 — Hooklistener](https://www.hooklistener.com/learn/realtime-webhooks-reliability) — MEDIUM confidence
- [Hookdeck — Reliable webhook infrastructure](https://hookdeck.com/) — MEDIUM confidence (SaaS reference for feature patterns)
- [Svix — Webhooks as a Service](https://www.svix.com/) — MEDIUM confidence (SaaS reference for feature patterns)
- Existing codebase: `backend/prisma/schema.prisma`, `backend/src/routes/provider.routes.js`, `backend/src/services/api-integration.service.js` — HIGH confidence (direct inspection)
- PROJECT.md milestone context — HIGH confidence (authoritative for scope decisions)

---
*Feature research for: Multi-provider webhook ingestion system (tote-web v1.0 milestone)*
*Researched: 2026-04-01*
