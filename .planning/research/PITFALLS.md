# Pitfalls Research

**Domain:** Multi-provider webhook system added to existing lottery/betting platform
**Researched:** 2026-04-01
**Confidence:** HIGH (codebase verified + multiple authoritative sources)

---

## Critical Pitfalls

### Pitfall 1: Duplicate Ticket Creation from Webhook + SRQ PULL Race

**What goes wrong:**
A provider sends a webhook for a ticket at 5:53 PM. The webhook adapter creates the ticket in the database. Three minutes later, at 5:55 PM, `sync-api-tickets.job.js` runs its every-5-minute PULL cycle. It calls `importSRQTickets(drawId, clearExisting: true)`, which executes `prisma.ticket.deleteMany({ where: { drawId, source: 'EXTERNAL_API' } })` and then re-inserts all tickets from the SRQ API. The webhook-created ticket is deleted and re-created if SRQ includes it, or permanently deleted if SRQ has not yet registered it.

Reverse race: the PULL sync imports a ticket from SRQ. The provider later sends a webhook for the same ticket (common during onboarding or when providers activate PUSH for an already-active draw). The webhook adapter checks `externalTicketId` uniqueness — but only if the adapter correctly maps the provider's ticket ID to the same field that SRQ uses. If the provider uses a different field name for the same ticket ID, two records are created.

**Why it happens:**
The SRQ PULL system uses a destructive sync pattern (delete-all then re-insert) designed for full state refresh. PUSH webhooks assume additive, event-driven creation. These two assumptions are incompatible without a coordination layer.

**How to avoid:**
- Assign each `ApiSystem` record a `mode` field (`PULL` | `PUSH`). In `importSRQTickets`, skip the `deleteMany` step if any active webhook source exists for the same draw.
- Alternatively: namespace ticket sources. PULL tickets get `source: 'EXTERNAL_API'`. PUSH tickets get `source: 'WEBHOOK'`. Make `deleteMany` filter only `source: 'EXTERNAL_API'`.
- All ticket-creation paths (PULL and PUSH) must use the same `externalTicketId` uniqueness check via `prisma.ticket.findFirst` before inserting.
- Add a database unique constraint: `@@unique([drawId, externalTicketId, source])` so the DB itself rejects duplicates regardless of timing.

**Warning signs:**
- Ticket count for a draw jumps unexpectedly between syncs
- Prize processor runs and finds zero eligible tickets for a draw that had bets
- Log entries showing `deleted X tickets` immediately after webhook log entries for the same draw

**Phase to address:**
Phase 1 (Webhook infrastructure) — before any adapter is wired up. The source-scoped `deleteMany` must be in place before the first PUSH provider goes live. Implementing idempotency at the DB level (unique constraint) is a prerequisite for the ticket-creation step.

---

### Pitfall 2: No Idempotency — Webhook Retries Create Duplicate Bets

**What goes wrong:**
Providers guarantee at-least-once delivery. If the server returns a non-2xx response (network blip, slow DB write, deploy restart), the provider retries the webhook. The adapter runs again and creates a second `Ticket` record for the same bet. In a real-money betting system this means the same bet is counted twice in prize calculations.

This is distinct from Pitfall 1 — this is purely within the PUSH path, without the PULL system involved.

**Why it happens:**
The current `saveTicketWithDetails` in `api-integration.service.js` checks `prisma.ticket.findFirst` before inserting — this check is not atomic. Two concurrent webhook deliveries for the same ticket can both pass the check before either has committed the insert.

**How to avoid:**
- Use a database-level unique constraint on `(drawId, externalTicketId)` (scoped per source or globally). This makes the insert fail deterministically on duplicates.
- Wrap the check-then-insert in a Prisma `$transaction` with `isolation: 'Serializable'` or use `createMany` with `skipDuplicates: true`.
- Store a `webhookEventId` (the provider's delivery ID, if provided) in `WebhookLog` and check it before processing. Return 200 immediately for known event IDs.
- Always return HTTP 200 to the provider even when skipping a duplicate. Returning 409 or 500 causes retries.

**Warning signs:**
- `totalAmount` for a draw is exactly 2x the expected value
- Multiple `Ticket` rows with the same `externalTicketId` in the database
- Provider webhook delivery logs showing repeated retries for the same event ID

**Phase to address:**
Phase 1 (Webhook infrastructure). The `WebhookLog` model needs an `eventId` field (provider-supplied delivery ID). Idempotency check must happen at the controller level, before the adapter runs.

---

### Pitfall 3: Slow Adapter Blocks HTTP Response — Provider Retries Storm

**What goes wrong:**
The `PROJECT.md` decision is: "tickets created synchronously on webhook receipt." If the adapter performs multiple DB lookups (find draw by external ID, find gameItem by number, find or create entities, create Ticket + TicketDetails), the total processing time can reach 200–800ms under normal load. When the production database is under load during draw-close time (prizes processing, stats calculating, SRQ sync all running simultaneously), individual queries can spike to 2–5 seconds. Providers that enforce a 5-second response timeout will retry. Each retry triggers the same slow path, compounding load exactly when the system is most stressed.

**Why it happens:**
The synchronous processing decision was made assuming low webhook volume and fast DB responses. The draw-close window (5:55–6:00 PM for a 6:00 PM draw) is precisely when the system is maximally busy, and it is also when providers most likely send final bet webhooks.

**How to avoid:**
- Accept the webhook, write to `WebhookLog`, return 200 immediately (< 50ms). Process the log record asynchronously via a short-lived in-process async handler or a pg-boss queue job.
- If synchronous processing is kept: add a 3-second timeout to the entire adapter execution. If exceeded, log to `WebhookLog` with `status: 'DEFERRED'` and process asynchronously.
- Move the draw-lookup (by external draw ID) to a pre-validated cache at request time, not inside the adapter.
- Set `express.json({ limit: '100kb' })` specifically for webhook routes, not the global 100KB default, to avoid parsing large payloads synchronously.

**Warning signs:**
- Provider delivery logs show timeout errors (HTTP 504 or no response) during draw-close windows
- Winston logs show webhook route response times > 1000ms
- Cascading retries: 3+ log entries for the same `eventId` within a 30-second window

**Phase to address:**
Phase 1 (Webhook infrastructure). The architecture decision (sync vs. async) must be locked in Phase 1. If the synchronous approach is kept, the timeout guard must be built in the same phase.

---

### Pitfall 4: Bearer Token Leaked in Logs or Error Responses

**What goes wrong:**
The existing request logger in `index.js` logs `req.method`, `req.path`, `ip`, and `userAgent`. However, the full URL is logged via `req.path`. If a provider mistakenly sends the token in the query string instead of the `X-Webhook-Token` header (a common provider misconfiguration), the token appears in combined.log. Winston rotates logs but they remain readable for days. Additionally, if an error occurs during token validation and the error handler echoes back `err.message` (which the global error handler does in development), the token value can appear in the HTTP response body seen by the provider.

Beyond logs: the `ApiSystem.webhookToken` field stores tokens in plaintext in PostgreSQL. Any database dump or Prisma Studio session exposes all tokens.

**Why it happens:**
Token logging happens passively — no one intends it, but the existing middleware logs enough context that query-string tokens appear automatically. Plaintext storage is the path of least resistance.

**How to avoid:**
- Accept tokens ONLY in the `X-Webhook-Token` header. Reject any request that has a token in the query string with 400 (without echoing the query string back).
- Add a log sanitizer that strips any header named `x-webhook-token`, `authorization`, or `apikey` from request log metadata.
- Store `webhookToken` as a bcrypt hash or SHA-256 hash in the database. On receipt, hash the incoming token and compare. Never store or log the raw token after generation.
- The admin UI must show tokens only once (at generation time), then display only a masked version (e.g., `tote_...f3a2`).
- In the global error handler, never echo `err.message` to the response in production — the existing code already does this correctly, but must be verified for the new webhook routes.

**Warning signs:**
- Log grep for `x-webhook-token` or `token=` in combined.log returns results
- Provider contacts support saying their token was in a 400 error response body
- Database dump shows `webhookToken` fields with readable token strings

**Phase to address:**
Phase 1 (Webhook infrastructure) for the header-only enforcement, log sanitizer, and error handler review. Phase 2 (Admin UI) for token generation UI showing tokens only once.

---

### Pitfall 5: Missing Draw Mapping Silently Discards Bets

**What goes wrong:**
A provider sends a webhook with their internal draw ID (e.g., `sorteo_id: 4821`). The adapter attempts to resolve this to a local `Draw` UUID. If no `ApiDrawMapping` row exists (mapping not yet synced, wrong date sent by provider, or the planning sync job has not run yet today), the adapter either throws an error or returns silently. Bets are lost with no visibility.

In discovery mode (no adapter exists), this is expected. But once an adapter is wired, a missing mapping is a silent data loss event. The `WebhookLog` will show a raw payload, but unless someone monitors it, real-money bets are never registered.

**Why it happens:**
The mapping resolution step depends on `ApiDrawMapping` being populated by the planning sync job (runs at 6 AM via `sync-api-planning.job.js`). If a new provider sends webhooks before their draws are mapped, or if they use a draw ID format that the mapper does not recognize, the lookup returns null.

**How to avoid:**
- When draw mapping fails, log to `WebhookLog` with `status: 'UNRESOLVABLE_DRAW'` and include the raw provider draw ID.
- Implement a monitoring alert (Telegram admin notification) when `WebhookLog` has more than N entries with `status: 'UNRESOLVABLE_DRAW'` in the last hour.
- When mapping fails, do not silently discard. Return HTTP 200 (to prevent retries) but queue the raw payload for manual review.
- The admin webhook log viewer must filter by `status: 'UNRESOLVABLE_DRAW'` and display the raw `externalDrawId` from the payload.
- Consider a fallback: if the draw ID is not in `ApiDrawMapping`, attempt to match by game + date + time before discarding.

**Warning signs:**
- `WebhookLog` entries with `status: 'UNRESOLVABLE_DRAW'`
- Provider reports "we sent bets but they do not appear in results"
- `ApiDrawMapping` table is empty for a provider that has been sending webhooks

**Phase to address:**
Phase 1 (Webhook infrastructure). The unresolvable-draw log status must be in the initial implementation. Phase 3 (Admin UI) for the monitoring view.

---

### Pitfall 6: Venezuela Timezone Mismatch in Draw Lookup

**What goes wrong:**
Providers may send draw timestamps in UTC or in their local timezone (which may differ from Venezuela UTC-4). The adapter resolves the draw by comparing the provider's timestamp against `Draw.drawDate` (a PostgreSQL `@db.Date` field stored in UTC) and `Draw.drawTime` (a plain string in `HH:MM:SS` format representing Venezuela time). If the adapter naively parses the provider's timestamp as UTC and compares it to `drawTime`, draws at 8 PM Venezuela time (which is midnight UTC) will fail to match because the date component differs.

The existing SRQ service has already encountered this: `getVenezuelaDateAsUTC()` exists precisely because `drawDate` stores the Venezuela calendar date as a UTC midnight timestamp, and naive date comparisons break around midnight.

**Why it happens:**
Venezuela does not observe daylight saving time (fixed UTC-4), which creates a consistent offset, but providers from other countries may send timestamps in their own timezone or in UTC. The SRQ integration sidesteps this by using a `sorteoID` mapping rather than timestamp matching. New PUSH providers will use timestamps, not pre-mapped IDs.

**How to avoid:**
- All adapters must normalize provider timestamps to Venezuela time using `lib/dateUtils.js` before any draw lookup.
- Draw lookup in adapters must use `getVenezuelaDateAsUTC(providerDate)` for the `drawDate` field and compare against `drawTime` in HH:MM format.
- Document the timezone contract in the adapter interface: "all timestamps passed to `resolveDrawId()` must be pre-converted to Venezuela local time."
- Test adapters with timestamps at 8:00 PM Venezuela (00:00 UTC next day) to verify the date boundary case.

**Warning signs:**
- Draws at or after 8:00 PM Venezuela time systematically fail to resolve
- The draw that resolves is one day off from the expected draw

**Phase to address:**
Phase 1 (Webhook infrastructure), in the adapter base class or utility function. Document the contract before any adapter is written.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Synchronous ticket creation (no queue) | Simpler code, immediate feedback | Timeout retries storm during draw-close windows; hard to retrofit queue later | Only if strict p95 response time < 500ms is verified under draw-close load |
| Store `webhookToken` as plaintext | No hashing implementation needed | Database dump or Prisma Studio leaks all provider tokens | Never in production |
| Single `WebhookLog` table for all providers | Simple initial schema | Log becomes unqueryable at volume; no per-provider retention policy | Acceptable for MVP, add provider-scoped indexes before second provider onboards |
| Return HTTP 500 on processing errors | Honest error reporting | Provider retries indefinitely; creates retry storm | Never — always 200 or 202 after logging the error |
| Skip idempotency check for "low volume" | Faster implementation | First production incident guarantees a duplicate draw result | Never — idempotency is not an optimization, it is a correctness requirement |
| Shared rate limiter for webhooks and browser API | No new configuration | Burst of provider webhooks consumes the 1000/15min budget shared with admin UI | Webhook endpoint must have its own rate limiter with higher burst tolerance |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SRQ (PULL) coexistence | Assuming PULL sync only runs at 6 AM — it also runs every 5 min (`sync-api-tickets`) | Verify that `deleteMany` in PULL sync is source-scoped before enabling any PUSH provider |
| New PUSH provider onboarding | Testing the adapter with a single ticket, not during draw-close window concurrency | Always integration-test during simulated draw-close (prizes + stats + PULL sync running simultaneously) |
| Provider draw ID format | Assuming all providers use numeric IDs like SRQ's `sorteoID` | Adapter interface must accept string IDs; `ApiDrawMapping.externalDrawId` is already `String`, use it |
| Provider cancellation events | Ignoring `anulado`/cancellation events | Adapter must handle cancellation by voiding the ticket, not ignoring the event |
| Provider payload evolution | Building adapter against first few payloads | Store raw payload in `WebhookLog.rawPayload` always; adapter bugs can be replayed against stored payloads |
| `ApiSystem` slug uniqueness | Using `name` as the routing key instead of a slug | Slugs are URL-safe, lowercase, unique; `name` may have spaces and is display-only |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries in adapter (one `findFirst` per ticket detail) | Adapter takes 2–5 seconds per webhook during draw-close | Batch `gameItem` lookups by number array before processing details | At 50+ ticket details per webhook |
| Unbounded `WebhookLog` growth | DB disk usage climbs; log viewer page load times out | Add a retention policy: archive or delete logs older than 30 days; index on `(apiSystemId, createdAt)` | After 90 days at 100 webhooks/day |
| Single database transaction for entire webhook | DB connection held open during slow operations; connection pool exhausted | Split into: (1) write log, (2) commit, (3) process async | At 10+ concurrent webhooks per second |
| Rate limiter shared with browser API | Admin dashboard becomes inaccessible during webhook burst | Create `/api/webhooks/*` as a separate Express router with its own `rateLimit` instance | At any burst > 50 requests/minute |
| Adapter resolution cache miss on every request | DB hit on every webhook to load `ApiSystem` + `ApiConfiguration` | Cache `ApiSystem` slug-to-config mapping in memory (invalidated on admin config change) | At 10+ webhooks/second |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Token in query string accepted | Token logged by request logger and in server access logs | Enforce header-only (`X-Webhook-Token`); return 400 for query string tokens without echoing value |
| Timing-vulnerable token comparison | Attacker can determine valid token prefixes via response timing | Use `crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(stored))` — never use `===` for token comparison |
| Webhook endpoint hit from any IP | No way to detect compromised token; attacker has unlimited attempts | Add optional IP allowlist per provider in `ApiSystem`; log IP on every webhook receipt |
| No timestamp validation | Replay attack: captured valid webhook can be resent hours later to insert old bets | Require `X-Webhook-Timestamp` header; reject requests where `|now - timestamp| > 300 seconds` |
| `rawPayload` stored indefinitely in `WebhookLog` | Bet amounts, user IDs, taquilla IDs accumulate in a single queryable table | Apply field-level masking before writing to `WebhookLog.rawPayload`: mask `monto`, `taquillaID`, `userId` fields; store metadata only after 30 days |
| Token visible in admin list endpoint | Token exposed in JSON response of `GET /api/admin/providers` | Return only masked token (`tote_...f3a2`) in API responses; never return full token after creation |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Token shown multiple times in admin UI | Users screenshot it in less secure contexts; token persists in browser history | Show token exactly once after generation with "Copy" button; subsequent views show masked version only |
| Webhook log viewer shows raw JSON without structure | Admin cannot understand what a payload means without knowing provider format | Parse known fields (drawId, ticketId, amount) and display in structured columns; show raw JSON in expandable accordion |
| Provider status shows "active" even when last 10 webhooks failed | Admin thinks system is working; provider thinks bets are being received | Show last-webhook-received timestamp and last error prominently on provider card |
| No way to replay a failed webhook | Admin must ask provider to resend; providers often cannot | Add "Replay" button on `WebhookLog` entries with `status: 'ERROR'`; re-run the stored `rawPayload` through the adapter |
| Unclear distinction between PULL and PUSH providers | Admin creates duplicate configs | Provider list must display mode (`PULL` / `PUSH`) prominently; PUSH providers show webhook URL; PULL providers show sync schedule |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Webhook endpoint registered:** Verify `PULL` sync's `deleteMany` is source-scoped before the endpoint receives live traffic — the route existing is not sufficient.
- [ ] **Token auth passing:** Confirm comparison uses `crypto.timingSafeEqual`, not `===`.
- [ ] **Discovery mode logging:** Verify `rawPayload` is written to `WebhookLog` even when adapter does not exist — not just when adapter throws.
- [ ] **Draw mapping resolution:** Test with a draw at 8:00 PM Venezuela time (midnight UTC boundary) to verify date component is correct.
- [ ] **Duplicate prevention:** Confirm the unique constraint on `(drawId, externalTicketId)` exists in schema AND is enforced at the adapter level with a graceful skip (not a 500 error).
- [ ] **Rate limiter isolation:** Confirm webhook routes use a separate `rateLimit` instance, not the `generalLimiter` from `index.js`.
- [ ] **Error response safety:** Confirm the global error handler in `index.js` returns `'Error interno del servidor'` (not `err.message`) for production on webhook routes — this is already true for the general handler but must be verified for any webhook-specific error handling.
- [ ] **Token masking in logs:** Run `grep -i 'webhook-token\|x-apikey\|token=' combined.log` after a test webhook delivery and confirm no token value appears.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate tickets created | HIGH | (1) Identify affected draw IDs from duplicate `externalTicketId` pairs; (2) manually delete duplicate rows; (3) re-run prize processor for affected draws; (4) audit payouts for the draw |
| Token leaked in logs | HIGH | (1) Immediately rotate token via admin UI (provider must update their config); (2) delete affected log files; (3) audit `WebhookLog` for any successful requests from unexpected IPs |
| Bets discarded due to missing draw mapping | MEDIUM | (1) Identify affected `WebhookLog` entries with `status: 'UNRESOLVABLE_DRAW'`; (2) manually create `ApiDrawMapping` rows; (3) replay stored `rawPayload` through adapter; (4) verify ticket totals match provider records |
| Slow adapter causing timeout retries | LOW | (1) Identify duplicate `eventId` entries in `WebhookLog`; (2) deduplicate in DB; (3) add async processing path as hotfix without full refactor |
| Timezone mismatch causing wrong draw resolution | MEDIUM | (1) Find misrouted tickets via wrong `drawId`; (2) delete and re-create in correct draw; (3) re-run prize processor if affected draw is already DRAWN |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PULL + PUSH race condition (Pitfall 1) | Phase 1: Source-scoped `deleteMany` in SRQ sync | Write a test: create ticket via PUSH adapter, run PULL sync, verify ticket still exists |
| Duplicate tickets from retries (Pitfall 2) | Phase 1: Unique constraint + idempotency check | Send same `rawPayload` twice, verify only one `Ticket` row created |
| Slow adapter timeout storm (Pitfall 3) | Phase 1: Architecture decision locked; timeout guard implemented | Load test with 20 concurrent webhooks during simulated draw-close (prizes job running) |
| Token leaked in logs (Pitfall 4) | Phase 1: Token-header enforcement; Phase 2: Admin token masking | Deliver test webhook, grep logs for token value |
| Missing draw mapping silent discard (Pitfall 5) | Phase 1: `UNRESOLVABLE_DRAW` status; Phase 3: Admin monitoring view | Send webhook with unknown draw ID, verify `WebhookLog` entry exists with correct status |
| Timezone mismatch (Pitfall 6) | Phase 1: Adapter utility function using `lib/dateUtils.js` | Unit test adapter with timestamp at 8:00 PM Venezuela (UTC next-day boundary) |
| Static token security (Security section) | Phase 1: `timingSafeEqual`; Phase 2: token-once UI | Automated security test: attempt timing attack on token comparison |
| `WebhookLog` log growth (Performance section) | Phase 3 (Admin UI) | Verify retention job exists; check log viewer performance with 10,000 rows |

---

## Sources

- Postmark: [Why idempotency is important](https://postmarkapp.com/blog/why-idempotency-is-important)
- Hookdeck: [Implement webhook idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- Hookdeck: [Webhooks at scale best practices](https://hookdeck.com/blog/webhooks-at-scale)
- Hookdeck: [How to solve webhook data integrity issues](https://hookdeck.com/webhooks/guides/how-solve-webhook-data-integrity-issues)
- DEV Community: [Webhooks at scale — idempotent, replay-safe, observable system](https://dev.to/art_light/webhooks-at-scale-designing-an-idempotent-replay-safe-and-observable-webhook-system-7lk)
- Svix: [Webhook timeout best practices](https://www.svix.com/resources/webhook-university/reliability/webhook-timeout-best-practices/)
- Svix: [Webhook security best practices](https://www.svix.com/resources/webhook-best-practices/security/)
- APIsec: [Securing webhook endpoints](https://www.apisec.ai/blog/securing-webhook-endpoints-best-practices)
- webhooks.fyi: [Replay prevention](https://webhooks.fyi/security/replay-prevention)
- DEV Community (Security Boulevard): [Bearer tokens explained](https://securityboulevard.com/2026/01/bearer-tokens-explained-complete-guide-to-bearer-token-authentication-security/)
- Pedro Alonso: [Stripe webhooks — solving race conditions](https://www.pedroalonso.net/blog/stripe-webhooks-solving-race-conditions/)
- Creative Software: [Webhook handling in the real world](https://www.creativesoftware.com/blog-posts/webhook-handling-in-the-real-world-what-can-go-wrong-and-how-we-handled-it)
- BetterStack: [Logging sensitive data best practices](https://betterstack.com/community/guides/logging/sensitive-data/)
- nodebestpractices: [Limit payload size](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/security/requestpayloadsizelimit.md)
- Tote-web codebase: `backend/src/services/api-integration.service.js`, `backend/src/jobs/sync-api-tickets.job.js`, `backend/src/index.js`

---

*Pitfalls research for: multi-provider webhook system on lottery/betting platform*
*Researched: 2026-04-01*
