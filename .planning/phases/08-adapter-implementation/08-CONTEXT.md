# Phase 8: Adapter Implementation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the virtuales webhook adapter to fully process incoming webhook payloads — resolving draw slots to daily Draw UUIDs, mapping numbers to GameItems, creating multi-play tickets, and rejecting invalid bets with clear reasons. Pure backend work: no UI, no schema changes.

</domain>

<decisions>
## Implementation Decisions

### Multi-draw Plays
- **D-01:** One Ticket per webhook payload, regardless of how many draws the plays target. The Ticket.drawId FK uses the first play's resolved drawId. Each TicketDetail stores its specific drawId in the TicketDetail.drawId field.
- **D-02:** If any play in the payload targets an invalid/closed draw, the entire ticket is rejected (all-or-nothing).

### Rejection Strategy
- **D-03:** `normalize()` returns a structured object `{ rejected: true, reason: '...' }` for validation failures instead of throwing errors. Throwing is reserved for unexpected crashes only.
- **D-04:** `webhook.service.js` checks `if (normalized.rejected)` before calling `createWebhookTicket()`. Rejected payloads get WebhookLog status `FAILED` with the rejection reason in `errorMessage`. No new enum value needed.

### Animal Cross-validation
- **D-05:** Trust the `number` field for GameItem lookup. Ignore any mismatch between provider's `animal` field and the GameItem.name in our DB. The original payload (including `animal`) is preserved in `providerData` for reference.

### Partial Acceptance
- **D-06:** All-or-nothing validation. If any play has a validation error (bad number, invalid slot, closed/drawn/cancelled draw), the entire ticket is rejected. The provider retries the full payload if needed.

### Claude's Discretion
- Internal function structure within the adapter (helper functions, validation order)
- Error message wording for rejection reasons
- Whether to validate all plays first then create, or validate-and-collect in a single pass
- Test structure and fixture design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Webhook System
- `backend/src/webhooks/adapters/virtuales.adapter.draft.js` — Current adapter skeleton with resolveDrawId() and normalize() stubs
- `backend/src/webhooks/adapters/virtuales.slots.js` — 48-slot config mapping slotId to gameId + drawTime
- `backend/src/services/webhook.service.js` — Dispatch pipeline: log-first, adapter import, normalize, createWebhookTicket
- `backend/src/controllers/webhook.controller.js` — Thin handler, always returns 200
- `backend/src/middlewares/webhook-auth.middleware.js` — Token auth via crypto.timingSafeEqual

### Data Models
- `backend/prisma/schema.prisma` — Ticket (line ~945), TicketDetail (line ~979), GameItem (line ~61), Draw model
- GameItem: `@@unique([gameId, number])` — lookup key is `gameId` + `number`
- Ticket: `@@unique([drawId, externalTicketId, source])` — dedup key

### Utilities
- `backend/src/lib/dateUtils.js` — `getVenezuelaDate()` for timezone-aware date resolution
- `backend/src/lib/prisma.js` — Prisma singleton

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveDrawId()` in `virtuales.adapter.draft.js`: Already resolves slotId → Draw UUID via Prisma query. Needs extension to also return draw status.
- `SLOTS` config in `virtuales.slots.js`: Complete 48-slot mapping, ready to use as-is.
- `createWebhookTicket()` in `webhook.service.js`: Handles ticket creation with dedup check. Expects normalized adapter output contract.
- `getVenezuelaDate()` in `dateUtils.js`: Timezone-correct date for today's draw resolution.

### Established Patterns
- Adapter contract: `normalize(payload)` returns `{ drawId, externalTicketId, totalAmount, providerData, details: [{ gameItemId, amount, multiplier }] }`
- Log-first: WebhookLog created as DISCOVERED before any processing
- Error isolation: Processing errors caught in webhook.service.js, never bubbled to HTTP response (controller always returns 200)

### Integration Points
- `webhook.service.js` line ~110: `adapterModule.normalize(JSON.parse(rawPayload))` — this is where the adapter is called
- The adapter file must be renamed from `.draft.js` to `.js` for auto-import to work (Phase 10 scope)
- `GameItem` lookup: `prisma.gameItem.findFirst({ where: { gameId, number } })` using `@@unique([gameId, number])`

</code_context>

<specifics>
## Specific Ideas

- Provider payload format confirmed: `{ ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }`
- `drawSlotId` arrives as string from provider — must parseInt before slot lookup
- `externalTicketId` = payload.ticketId (provider's ID)
- `totalAmount` = sum of all play amounts
- Each play maps to one TicketDetail: `{ gameItemId: resolved from number, amount: play.amount, multiplier: GameItem.multiplier }`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-adapter-implementation*
*Context gathered: 2026-04-07*
