# Phase 8: Adapter Implementation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 08-adapter-implementation
**Areas discussed:** Multi-draw plays, Rejection strategy, Animal cross-validation, Partial acceptance

---

## Multi-draw Plays

| Option | Description | Selected |
|--------|-------------|----------|
| One Ticket per draw | Group plays by resolved drawId, create separate Tickets. Each Ticket has its own externalTicketId (e.g., ticketId-drawSlotId). | |
| One Ticket total | Collapse all plays into one Ticket using the first play's drawId. TicketDetail.drawId holds per-play draws. | ✓ |
| Reject mixed-draw payloads | Require all plays to target the same drawSlotId. Reject if draws differ. | |

**User's choice:** One Ticket total
**Notes:** First play's drawId used for Ticket FK. If any play targets an invalid draw, entire ticket is rejected (user specified "all rejected").

---

## Rejection Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Structured return object | normalize() returns { rejected: true, reason: '...' } instead of throwing. | ✓ |
| Custom error class | Create WebhookRejectionError class. Idiomatic Node.js error handling. | |
| Throw with convention | Throw plain Errors with 'REJECTED:' prefix. String parsing for control flow. | |

**User's choice:** Structured return object

### Follow-up: Log status for rejections

| Option | Description | Selected |
|--------|-------------|----------|
| Use FAILED for rejections too | Keep existing 4 statuses. errorMessage distinguishes crash vs validation. | ✓ |
| Add REJECTED status | New enum value. Requires Prisma migration. | |

**User's choice:** Use FAILED for rejections too

---

## Animal Cross-validation

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore mismatch | Trust number field. Log mismatch in providerData for debugging. | ✓ |
| Reject on mismatch | Strict validation — reject if animal doesn't match GameItem.name. | |
| Log warning, accept bet | Accept bet but log warning-level message. Middle ground. | |

**User's choice:** Ignore mismatch

---

## Partial Acceptance

| Option | Description | Selected |
|--------|-------------|----------|
| Reject entire ticket | All-or-nothing. Any invalid play rejects the whole ticket. | ✓ |
| Accept valid plays only | Create ticket with only valid plays, skip invalid ones. | |

**User's choice:** Reject entire ticket

---

## Claude's Discretion

- Internal function structure within the adapter
- Error message wording for rejection reasons
- Validation pass strategy (validate-all-first vs validate-and-collect)
- Test structure and fixture design

## Deferred Ideas

None — discussion stayed within phase scope
