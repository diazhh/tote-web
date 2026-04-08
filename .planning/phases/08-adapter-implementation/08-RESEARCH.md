# Phase 8: Adapter Implementation - Research

**Researched:** 2026-04-07
**Domain:** Webhook adapter — draw resolution, GameItem mapping, multi-play ticket creation, all-or-nothing validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** One Ticket per webhook payload, regardless of how many draws the plays target. The Ticket.drawId FK uses the first play's resolved drawId. Each TicketDetail stores its specific drawId in the TicketDetail.drawId field.
- **D-02:** If any play in the payload targets an invalid/closed draw, the entire ticket is rejected (all-or-nothing).
- **D-03:** `normalize()` returns a structured object `{ rejected: true, reason: '...' }` for validation failures instead of throwing errors. Throwing is reserved for unexpected crashes only.
- **D-04:** `webhook.service.js` checks `if (normalized.rejected)` before calling `createWebhookTicket()`. Rejected payloads get WebhookLog status `FAILED` with the rejection reason in `errorMessage`. No new enum value needed.
- **D-05:** Trust the `number` field for GameItem lookup. Ignore any mismatch between provider's `animal` field and the GameItem.name in our DB. The original payload (including `animal`) is preserved in `providerData` for reference.
- **D-06:** All-or-nothing validation. If any play has a validation error (bad number, invalid slot, closed/drawn/cancelled draw), the entire ticket is rejected.

### Claude's Discretion

- Internal function structure within the adapter (helper functions, validation order)
- Error message wording for rejection reasons
- Whether to validate all plays first then create, or validate-and-collect in a single pass
- Test structure and fixture design

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADAPT-01 | Adapter resolves `drawSlotId` (1-48) to the correct daily Draw UUID using the slots config | resolveDrawId() skeleton already does this; needs to also return draw status |
| ADAPT-02 | Adapter maps `number` from payload to correct `GameItem.id` by matching `GameItem.number` within the resolved game | Prisma findFirst with `@@unique([gameId, number])` — exact match query |
| ADAPT-03 | Adapter handles multi-play tickets (`plays[]` array) creating one Ticket with multiple TicketDetails | webhook.service createWebhookTicket already maps normalized.details array to TicketDetail.create[] |
| ADAPT-04 | Adapter parses `drawSlotId` as string or number (provider sends strings) | parseInt() coercion before SLOTS lookup |
| VALID-01 | System rejects bets for draws in `DRAWN` or `CANCELLED` status with a clear rejection reason | resolveDrawId() already selects draw.status; add status check after resolution |
| VALID-02 | System rejects bets for draws in `CLOSED` status | Same path as VALID-01; CLOSED added to rejected statuses |
| VALID-03 | System rejects bets with invalid `drawSlotId` (outside 1-48 range or non-existent slot) | SLOTS[slotId] lookup returns undefined for bad slots |
| VALID-04 | System rejects bets with unrecognized `number` that doesn't match any GameItem in the resolved game | gameItem.findFirst returns null → rejection object |
</phase_requirements>

---

## Summary

Phase 8 is a pure backend code change: completing `virtuales.adapter.draft.js` into a fully functional adapter. All surrounding infrastructure (slots config, webhook.service dispatch pipeline, createWebhookTicket, Prisma schema) is already in place and verified in the codebase.

The adapter must implement two behaviors: draw resolution (slotId → Draw UUID + status check) and payload normalization (plays[] → ticket + ticketDetails structure). Both behaviors interact only via the existing Prisma models and the established adapter contract. No schema changes, no new routes, no frontend changes.

The one required change outside the adapter file is to `webhook.service.js`: it currently passes all normalized output directly to `createWebhookTicket()`, but D-03/D-04 require it to first check `if (normalized.rejected)` and route to a FAILED log update instead of ticket creation. This is a small, surgical addition to the existing try/catch block in `dispatchWebhook()`.

**Primary recommendation:** Complete the adapter in a single file (`virtuales.adapter.js` — note: still `.draft.js` until Phase 10 renames it), wire the rejection check into `webhook.service.js`, and cover all 8 requirements with unit tests using Jest's `unstable_mockModule` pattern (matching the existing test in `src/__tests__/terminal-pantera.test.js`).

---

## Project Constraints (from CLAUDE.md)

| Directive | Detail |
|-----------|--------|
| ES modules throughout | `import`/`export` only — no `require()` |
| Prisma singleton | Always `import { prisma } from '../lib/prisma.js'` |
| Timezone | Venezuela time via `lib/dateUtils.js` — use `getVenezuelaDateString()` for draw date resolution |
| Draw status for completed draws | Filter by `DRAWN` in local/dev; production uses `PUBLISHED` (legacy). For validation rejections, reject `DRAWN`, `CANCELLED`, `CLOSED` — no `PUBLISHED` confusion here since we're rejecting bets going forward |
| Test runner | `NODE_OPTIONS='--experimental-vm-modules' jest --forceExit` |
| Test pattern | `jest.unstable_mockModule` for ES module mocks (verified in existing test) |

---

## Standard Stack

### Core — Already Present, No New Installs

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| Prisma Client | ^6.16.3 | GameItem and Draw queries | [VERIFIED: package.json] |
| Jest | ^29.7.0 | Unit tests with ES module support | [VERIFIED: package.json] |
| date-fns | ^4.1.0 | Venezuela timezone date utilities | [VERIFIED: package.json] |

No new packages required for this phase. [VERIFIED: codebase inspection]

---

## Architecture Patterns

### Adapter Contract (Existing — Verified)

The established adapter output contract is documented in `virtuales.adapter.draft.js` and consumed by `webhook.service.js` line 110-111. [VERIFIED: codebase]

**Success path:**
```javascript
// Source: backend/src/webhooks/adapters/virtuales.adapter.draft.js (contract comment)
// + backend/src/services/webhook.service.js (consumer)
{
  drawId:           string,   // UUID of the first play's Draw (Ticket.drawId FK)
  externalTicketId: string,   // payload.ticketId
  totalAmount:      number,   // sum of all play amounts
  providerData:     object,   // original payload for audit
  details: [{
    gameItemId:   string,     // UUID from GameItem lookup
    amount:       number,     // play.amount
    multiplier:   number,     // GameItem.multiplier (from DB)
    drawId:       string,     // this detail's specific Draw UUID (D-01: each detail owns its drawId)
  }]
}
```

**Rejection path (D-03):**
```javascript
// New: returned instead of thrown for validation failures
{
  rejected: true,
  reason: string   // human-readable, stored in WebhookLog.errorMessage
}
```

### webhook.service.js Modification Required (D-04)

The current `dispatchWebhook()` step 3 calls `createWebhookTicket(normalized, log.id)` unconditionally after `normalize()`. It must be patched to check the rejection sentinel first. [VERIFIED: webhook.service.js lines 109-111]

```javascript
// Source: webhook.service.js (existing pattern, needs this insertion)
const normalized = await adapterModule.normalize(JSON.parse(rawPayload));

// NEW: check rejection before ticket creation (D-04)
if (normalized.rejected) {
  await prisma.webhookLog.update({
    where: { id: log.id },
    data: { status: 'FAILED', errorMessage: normalized.reason },
  });
  logger.warn(`[webhook] Payload rejected by adapter "${slug}" (logId=${log.id}): ${normalized.reason}`);
  return { status: 'failed', logId: log.id, error: normalized.reason };
}

const ticket = await createWebhookTicket(normalized, log.id);
```

### Draw Resolution Pattern

`resolveDrawId()` already queries `prisma.draw.findFirst` with `gameId + drawDate + drawTime` and `select: { id, status }`. [VERIFIED: virtuales.adapter.draft.js lines 51-61]

The current function returns only `draw?.id ?? null`. It needs to return both id and status so callers can validate the draw state. Two implementation options, both within Claude's discretion:

**Option A** — Return `{ id, status } | null` from resolveDrawId():
```javascript
return draw ? { id: draw.id, status: draw.status } : null;
```

**Option B** — Inline the draw lookup per play in normalize() and keep resolveDrawId() as is.

Option A is cleaner for multi-play (resolves once per unique slotId, reuses result). [ASSUMED — design preference]

### Multi-Play Resolution Strategy

Provider payload: `{ ticketId, game, plays: [{ drawSlotId, amount, animal, number }], timestamp }`

Per D-01 and D-06: validate ALL plays before creating any ticket. Two-pass approach:

```javascript
// Pass 1: resolve + validate all plays
const resolvedPlays = [];
for (const play of payload.plays) {
  const slotId = parseInt(play.drawSlotId, 10);
  const slot = SLOTS[slotId];
  if (!slot) return { rejected: true, reason: `Invalid drawSlotId: ${play.drawSlotId}` };

  const draw = await resolveDrawId(slotId);        // returns { id, status } | null
  if (!draw) return { rejected: true, reason: `No draw found for slotId ${slotId} today` };
  if (['DRAWN', 'CANCELLED', 'CLOSED'].includes(draw.status)) {
    return { rejected: true, reason: `Draw ${draw.id} is ${draw.status} — bets not accepted` };
  }

  const gameItem = await prisma.gameItem.findFirst({
    where: { gameId: slot.gameId, number: String(play.number) },
    select: { id: true, multiplier: true },
  });
  if (!gameItem) return { rejected: true, reason: `Number "${play.number}" not found in game ${slot.gameName}` };

  resolvedPlays.push({ draw, slot, gameItem, play });
}

// Pass 2: build normalized output (only reached if all plays are valid)
return {
  drawId: resolvedPlays[0].draw.id,
  externalTicketId: String(payload.ticketId),
  totalAmount: resolvedPlays.reduce((sum, rp) => sum + Number(rp.play.amount), 0),
  providerData: payload,
  details: resolvedPlays.map(rp => ({
    gameItemId: rp.gameItem.id,
    amount: Number(rp.play.amount),
    multiplier: Number(rp.gameItem.multiplier),
    drawId: rp.draw.id,
  })),
};
```

### GameItem Lookup Key

The `@@unique([gameId, number])` constraint on GameItem means `findFirst` with `gameId + number` is a unique lookup. [VERIFIED: schema.prisma line 79]

The `number` field is a String (e.g., `"05"`, `"000"`). The provider sends numbers as strings. Always coerce with `String(play.number)` to handle edge cases where the provider sends integer `5` instead of `"05"`. [VERIFIED: schema.prisma line 64 — `number String`]

Note: `String(5)` → `"5"`, not `"05"`. If the provider sends integers the padding is lost. The CONTEXT.md says `drawSlotId` arrives as string and needs parseInt, but `number` is described as `"05"` (already a string). Trust D-05 — look up by `number` as-is from payload. If `String(play.number)` doesn't match, reject with VALID-04. [ASSUMED — string coercion behavior; verify against actual provider payload samples when available]

### Date Resolution for Draw Lookup

`getVenezuelaDateString()` returns `YYYY-MM-DD`. The draw query uses `drawDate: new Date(today)` where `today` is that string. [VERIFIED: virtuales.adapter.draft.js line 49]

The correct function to call is `getVenezuelaDateString()` (not `getVenezuelaDateAsUTC()`). The draw's `drawDate` is stored as `@db.Date` (date-only), so the query constructs `new Date('2026-04-07')` which Prisma handles as a UTC midnight date. [VERIFIED: schema.prisma line 115, dateUtils.js line 25-33]

### Anti-Patterns to Avoid

- **Throwing on validation failures:** D-03 explicitly prohibits this. Return `{ rejected: true, reason }` for all expected validation failures. Throw only for unexpected crashes (Prisma connection error, etc.).
- **Creating ticket before validating all plays:** D-06 requires all-or-nothing. Always complete the full validation pass before any ticket creation attempt.
- **Using `animal` for GameItem lookup:** D-05. GameItem.name stores the animal name; the lookup key is `number`, not `name`.
- **Coercing number with padded parseInt:** `parseInt('05')` → `5`. Use `String(play.number)` to preserve the original string from the payload, not a numeric conversion.
- **Activating the adapter in this phase:** The file stays as `.draft.js`. Renaming to `.js` is Phase 10 (DEPL-01). The adapter code lives in `.draft.js` throughout this phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ticket deduplication | Custom upsert logic | `createWebhookTicket()` in webhook.service.js | Already handles `@@unique([drawId, externalTicketId, source])` check and DUPLICATE log update |
| Date/timezone handling | Manual UTC offset math | `getVenezuelaDateString()` from dateUtils.js | Venezuela is UTC-4 — DST edge cases handled |
| Draw lookup | Raw SQL | `prisma.draw.findFirst` with existing index `[gameId, drawDate, drawTime]` | Index exists for exactly this query pattern |
| GameItem lookup | Scanning all items | `prisma.gameItem.findFirst({ where: { gameId, number } })` | `@@unique([gameId, number])` index makes this O(1) |

---

## Common Pitfalls

### Pitfall 1: `resolveDrawId` Returns Id-Only, Status Lost

**What goes wrong:** The current `resolveDrawId()` returns `draw?.id ?? null`. If a caller only gets the ID back, it has no way to validate draw status without a second DB query.
**Why it happens:** The function was written as a stub before validation requirements were finalized.
**How to avoid:** Return `{ id, status } | null` so the caller can do the status check in the same resolution step.
**Warning signs:** Any place that calls `resolveDrawId()` and then separately queries the draw for status.

### Pitfall 2: `SLOTS[slotId]` Lookup With String Key

**What goes wrong:** `SLOTS` is built with integer keys (`SLOTS[1]`, `SLOTS[2]`, ...). If `slotId` is still a string `"12"` after coming from the provider, `SLOTS["12"]` works in JS (object property coercion) but `parseInt()` is needed to be explicit and safe.
**Why it happens:** JS object keys are strings internally, so `SLOTS["12"] === SLOTS[12]` is true. But explicit `parseInt` documents intent and prevents subtle bugs if the lookup ever moves to a Map.
**How to avoid:** Always `parseInt(play.drawSlotId, 10)` before the slot lookup. Check `isNaN(slotId)` as well.
**Warning signs:** Tests pass with string keys but a Map-based refactor later breaks.

### Pitfall 3: `number` Field String Padding

**What goes wrong:** Provider sends `number: 5` (integer). `String(5)` → `"5"`. DB stores `"05"`. `findFirst` returns null. Ticket rejected with VALID-04 even though the number is valid.
**Why it happens:** The provider payload spec says strings but JSON deserializes bare numbers as integers.
**How to avoid:** If provider is known to send zero-padded strings (e.g., `"05"`), assert `typeof play.number === 'string'` in tests. If provider may send integers, apply padding: `String(play.number).padStart(2, '0')` for 2-digit games, `String(play.number).padStart(3, '0')` for 3-digit. Confirm against actual provider payload samples.
**Warning signs:** Unit tests with string input pass but integration tests with integer input fail VALID-04.

### Pitfall 4: Validation Stops at First Failure vs. Collects All Errors

**What goes wrong:** D-06 rejects the whole ticket, but the rejection reason only mentions the first invalid play. Provider has no visibility into whether other plays were also invalid.
**Why it happens:** Early return on first failure loses subsequent error info.
**How to avoid:** This is within Claude's discretion. Including the index in the reason (`"Play 2: number '99' not found"`) is more useful than a bare message. Collect all errors in a pass then join them if desired. The decision is discretionary — a single early-return reason is acceptable.

### Pitfall 5: `dispatchWebhook` Try/Catch Catches Rejection Objects

**What goes wrong:** If `normalize()` returns `{ rejected: true, reason }` (not throws), the existing try/catch does NOT catch it — the flow continues to `createWebhookTicket()`. The rejection check must be inserted BEFORE the `createWebhookTicket()` call. [VERIFIED: webhook.service.js lines 109-111]
**Why it happens:** The current code assumes either a successful return or a thrown error. The rejection sentinel pattern is new.
**How to avoid:** Insert `if (normalized.rejected)` immediately after the `await adapterModule.normalize()` line, before any ticket creation.

---

## Code Examples

### Verified Prisma Query Patterns

```javascript
// Source: backend/prisma/schema.prisma (@@unique constraint) + verified DB indexes
// GameItem lookup by game + number
const gameItem = await prisma.gameItem.findFirst({
  where: {
    gameId: slot.gameId,    // from SLOTS[slotId]
    number: play.number,    // string, e.g., "05"
  },
  select: { id: true, multiplier: true },
});
// Returns null if not found → VALID-04 rejection
```

```javascript
// Source: backend/src/webhooks/adapters/virtuales.adapter.draft.js (lines 51-61)
// Draw lookup (current — returns id only)
const draw = await prisma.draw.findFirst({
  where: {
    gameId: slot.gameId,
    drawDate: new Date(today),
    drawTime: slot.drawTime,
  },
  select: { id: true, status: true },  // already selects status
});
// Extend: return { id: draw.id, status: draw.status } not just draw.id
```

```javascript
// Source: backend/src/services/webhook.service.js (lines 34-55)
// createWebhookTicket expects this shape in normalized.details[]
details: {
  create: normalized.details.map((d) => ({
    gameItemId:  d.gameItemId,
    amount:      d.amount,
    multiplier:  d.multiplier,
    prize:       0,
    status:      'ACTIVE',
    // drawId is NOT explicitly set here in the current implementation
    // If TicketDetail.drawId must be set per D-01, the map needs: drawId: d.drawId
  })),
}
```

**Note on TicketDetail.drawId:** The schema shows `TicketDetail.drawId String?` (optional, line 983). The current `createWebhookTicket` does not pass `drawId` when creating details. Per D-01, each TicketDetail stores its specific drawId. The normalized adapter output must include `drawId` per detail, AND `createWebhookTicket` must include it in the `create` map. This requires a small change to `createWebhookTicket` as well. [VERIFIED: schema.prisma line 983, webhook.service.js lines 43-52]

### Rejection Return Pattern (D-03)

```javascript
// Source: CONTEXT.md D-03 decision
// Use this pattern — do NOT throw for expected validation failures
if (!SLOTS[slotId]) {
  return { rejected: true, reason: `Invalid drawSlotId: ${play.drawSlotId} — valid range 1-48` };
}
```

### Test Pattern (Existing — Verified)

```javascript
// Source: backend/src/__tests__/terminal-pantera.test.js (established pattern)
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findFirst: jest.fn() },
  gameItem: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../lib/dateUtils.js', () => ({
  getVenezuelaDateString: jest.fn().mockReturnValue('2026-04-07'),
}));

// Dynamic import AFTER mocks are registered
let normalize;
beforeAll(async () => {
  ({ normalize } = await import('../webhooks/adapters/virtuales.adapter.draft.js'));
});

beforeEach(() => { jest.clearAllMocks(); });
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && NODE_OPTIONS='--experimental-vm-modules' jest --testPathPattern=virtuales --forceExit` |
| Full suite command | `cd backend && NODE_OPTIONS='--experimental-vm-modules' jest --forceExit` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | File |
|--------|----------|-----------|------|
| ADAPT-01 | `drawSlotId=5` resolves to correct Draw UUID (LOTOANIMALITO 12:00:00) | unit | `src/__tests__/virtuales-adapter.test.js` (Wave 0 gap) |
| ADAPT-02 | `number: "05"` resolves to GameItem whose `.number === "05"` | unit | same |
| ADAPT-03 | Payload with 2 plays creates 1 Ticket + 2 TicketDetails | unit | same |
| ADAPT-04 | `drawSlotId: "12"` (string) resolves identically to integer `12` | unit | same |
| VALID-01 | Payload for `DRAWN` draw returns `{ rejected: true, reason }` | unit | same |
| VALID-01 | Payload for `CANCELLED` draw returns `{ rejected: true, reason }` | unit | same |
| VALID-02 | Payload for `CLOSED` draw returns `{ rejected: true, reason }` | unit | same |
| VALID-03 | `drawSlotId: 0` returns `{ rejected: true, reason }` | unit | same |
| VALID-03 | `drawSlotId: 49` returns `{ rejected: true, reason }` | unit | same |
| VALID-04 | `number: "99"` not in game returns `{ rejected: true, reason }` | unit | same |
| D-04 wire | `webhook.service.js` routes rejected normalizations to FAILED log (no ticket created) | unit | `src/__tests__/webhook-service-rejection.test.js` (Wave 0 gap) |

### Wave 0 Gaps

- [ ] `src/__tests__/virtuales-adapter.test.js` — covers ADAPT-01 through VALID-04
- [ ] `src/__tests__/webhook-service-rejection.test.js` — covers D-04 wiring in webhook.service.js

*(Framework and existing test infrastructure already in place — only the two test files are missing)*

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — phase is pure backend code changes; all tools verified present via package.json and existing codebase).

---

## Security Domain

This phase modifies webhook payload processing. Relevant ASVS considerations:

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | Yes | `parseInt(drawSlotId, 10)` + range check; `String(number)` normalization; reject unknown values explicitly |
| V4 Access Control | Handled upstream | webhookAuth middleware already validates `X-Webhook-Token` via `crypto.timingSafeEqual` before the adapter is called — no changes needed |
| V6 Cryptography | No | Token validation is upstream — adapter receives authenticated payloads only |

**Key threat pattern for this phase:** Malformed payload fields (missing `plays`, non-array `plays`, missing `drawSlotId` within a play, missing `number`). The validation pass must guard against these. Return `{ rejected: true, reason }` for missing required fields — do not let `undefined` propagate to Prisma queries.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Option A (return `{ id, status }` from resolveDrawId) is cleaner than inline lookup | Architecture Patterns | Low — both options produce correct behavior; it's a style choice |
| A2 | `String(play.number)` is sufficient coercion and provider sends zero-padded strings | Common Pitfalls #3 | Medium — if provider sends integer `5` and DB stores `"05"`, VALID-04 false rejection occurs. Confirm with provider payload samples |
| A3 | `createWebhookTicket` needs the `drawId` field added to the TicketDetail create map | Code Examples note | Low — TicketDetail.drawId is nullable and optional; omitting it means it stays null, which may be acceptable if per-detail draw tracking is only needed for multi-draw plays. Confirm whether D-01 requires it to be populated |

---

## Open Questions (RESOLVED)

1. **TicketDetail.drawId population**
   - What we know: `TicketDetail.drawId` is `String?` (optional). D-01 says "Each TicketDetail stores its specific drawId." Current `createWebhookTicket` does NOT pass `drawId` when creating details.
   - What's unclear: Does the planner need to include a change to `createWebhookTicket` to pass `drawId`, or should that be added directly in this phase?
   - Recommendation: Include the `createWebhookTicket` change in Phase 8 plan since it's required by D-01 and the adapter output already includes per-detail `drawId`.
   - RESOLVED: Plan 02 Task 1 Change 2 adds `d.drawId` to the `createWebhookTicket` details create map.

2. **Number padding behavior**
   - What we know: GameItem.number is a String. Provider sends `number: "05"` per CONTEXT.md specifics.
   - What's unclear: Will the provider ever send an integer `5` instead of string `"05"`?
   - Recommendation: Use `String(play.number)` as-is in the adapter. Add a test with both `"05"` and `5` as input to document the behavior. If integer `5` must match `"05"`, add padding logic specific to each game's number width.
   - RESOLVED: Plan 01 Task 2 uses `String(play.number)` as-is. Plan 01 Task 1 includes test cases with both string "05" and integer 5 as input to document behavior.

---

## Sources

### Primary (HIGH confidence)
- `backend/src/webhooks/adapters/virtuales.adapter.draft.js` — existing skeleton, resolveDrawId() implementation
- `backend/src/webhooks/adapters/virtuales.slots.js` — 48-slot config, verified complete
- `backend/src/services/webhook.service.js` — dispatch pipeline, createWebhookTicket(), D-04 injection point
- `backend/prisma/schema.prisma` — Ticket (line 945), TicketDetail (line 979), GameItem (line 61), Draw (line 111), DrawStatus enum (line 163)
- `backend/src/lib/dateUtils.js` — getVenezuelaDateString() implementation
- `backend/src/__tests__/terminal-pantera.test.js` — established Jest ES module mock pattern
- `backend/jest.config.js` — test runner configuration
- `backend/package.json` — dependency versions

### Secondary (MEDIUM confidence)
- `.planning/phases/08-adapter-implementation/08-CONTEXT.md` — locked decisions D-01 through D-06

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing dependencies verified in package.json
- Architecture: HIGH — adapter contract, Prisma models, and dispatch pipeline all verified in codebase
- Pitfalls: HIGH — all pitfalls derived from direct codebase inspection of the existing draft adapter and service
- Test patterns: HIGH — existing test file confirms exact mock and import patterns to use

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no moving targets)
