# Requirements: Tote-Web

**Defined:** 2026-04-01
**Core Value:** Reliable draw lifecycle management — draws execute on schedule, results publish, prizes process correctly.

## v1.0 Requirements

Requirements for Multi-Provider Webhook System milestone. Each maps to roadmap phases.

### Webhook Infrastructure

- [x] **WHOOK-01**: System can receive POST requests at `/api/webhooks/:providerSlug` with token-based auth
- [x] **WHOOK-02**: System logs raw payload to `WebhookLog` when no adapter exists (discovery mode)
- [x] **WHOOK-03**: System creates tickets in real-time when provider has a wired adapter
- [x] **WHOOK-04**: System rejects requests with invalid or missing tokens (401)
- [x] **WHOOK-05**: System prevents duplicate ticket creation via DB unique constraint on `(drawId, externalTicketId)`
- [x] **WHOOK-06**: System uses `crypto.timingSafeEqual` for token comparison

### Schema

- [x] **SCHEMA-01**: `ApiSystem` model has `slug` (unique), `webhookToken`, and `mode` (PULL/PUSH) fields
- [x] **SCHEMA-02**: `WebhookLog` model stores raw payload, headers, provider reference, processing status, and timestamp
- [x] **SCHEMA-03**: `WebhookLog.status` enum: DISCOVERED, PROCESSED, DUPLICATE, FAILED

### Admin Provider Management

- [x] **ADMIN-01**: Admin can create/edit providers with PULL or PUSH mode selection
- [x] **ADMIN-02**: Admin can set provider slug (auto-generated from name, editable)
- [x] **ADMIN-03**: Admin can generate webhook token (shown once on creation, masked after)
- [x] **ADMIN-04**: Admin can regenerate token for existing provider
- [x] **ADMIN-05**: Admin sees provider mode badge (PULL/PUSH) in provider list
- [x] **ADMIN-06**: Admin sees adapter status badge (Ready/Discovery) per provider

### Webhook Log Viewer

- [ ] **LOGS-01**: Admin can view webhook log table with columns: provider, timestamp, status, payload preview
- [ ] **LOGS-02**: Admin can filter logs by provider and by status
- [ ] **LOGS-03**: Admin can click a log entry to see full raw JSON payload in a modal (inspector)
- [ ] **LOGS-04**: Admin can see request headers in the inspector modal

## v1.x Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Operational

- **REPLAY-01**: Admin can replay a logged payload through the current adapter
- **HEALTH-01**: Provider health monitoring with last-seen timestamp and error rate
- **RETAIN-01**: WebhookLog retention policy with auto-cleanup job
- **HMAC-01**: Optional HMAC signature verification per provider

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Refactoring SRQ into adapter pattern | SRQ stays as-is (PULL); user decision to not touch working system |
| Queue-based webhook processing | Low volume expected; synchronous processing sufficient |
| HMAC signature verification | Regional providers unlikely to implement; bearer token sufficient |
| PII masking in stored payloads | Lottery payloads don't contain GDPR-level PII |
| Auto-adapter generation from payloads | Unreliable code generation; manual adapter writing preferred |
| Per-provider rate limiting | Providers are trusted internal partners; token auth is sufficient |
| Modifying SRQ deleteMany behavior | SRQ not to be touched; PUSH tickets use different source value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 1 | Complete |
| SCHEMA-02 | Phase 1 | Complete |
| SCHEMA-03 | Phase 1 | Complete |
| WHOOK-01 | Phase 2 | Complete |
| WHOOK-02 | Phase 2 | Complete |
| WHOOK-03 | Phase 2 | Complete |
| WHOOK-04 | Phase 2 | Complete |
| WHOOK-05 | Phase 2 | Complete |
| WHOOK-06 | Phase 2 | Complete |
| ADMIN-01 | Phase 3 | Complete |
| ADMIN-02 | Phase 3 | Complete |
| ADMIN-03 | Phase 3 | Complete |
| ADMIN-04 | Phase 3 | Complete |
| ADMIN-05 | Phase 3 | Complete |
| ADMIN-06 | Phase 3 | Complete |
| LOGS-01 | Phase 4 | Pending |
| LOGS-02 | Phase 4 | Pending |
| LOGS-03 | Phase 4 | Pending |
| LOGS-04 | Phase 4 | Pending |

**Coverage:**
- v1.0 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation — all 19 requirements mapped*
