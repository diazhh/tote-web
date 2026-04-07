# Requirements: Tote-Web

**Defined:** 2026-04-07
**Core Value:** Reliable draw lifecycle management — draws execute on schedule, results publish, prizes process correctly.

## v1.2 Requirements

Requirements for Webhook Provider Integration (Virtuales). Each maps to roadmap phases.

### Adapter Core

- [ ] **ADAPT-01**: Adapter resolves `drawSlotId` (1-48) to the correct daily Draw UUID using the slots config
- [ ] **ADAPT-02**: Adapter maps `number` from payload (e.g., "05") to the correct `GameItem.id` by matching `GameItem.number` within the resolved game; `animal` field used as optional cross-validation
- [ ] **ADAPT-03**: Adapter handles multi-play tickets (`plays[]` array) creating one Ticket with multiple TicketDetails
- [ ] **ADAPT-04**: Adapter parses `drawSlotId` as string or number (provider sends strings)

### Validation

- [ ] **VALID-01**: System rejects bets for draws in `DRAWN` or `CANCELLED` status with a clear rejection reason
- [ ] **VALID-02**: System rejects bets for draws in `CLOSED` status (past the acceptance window)
- [ ] **VALID-03**: System rejects bets with invalid `drawSlotId` (outside 1-48 range or non-existent slot)
- [ ] **VALID-04**: System rejects bets with unrecognized `number` that doesn't match any GameItem in the resolved game

### Response Contract

- [ ] **RESP-01**: Successful ticket creation returns `{ received: true, logId, ticket: { id, status: "ACCEPTED" } }`
- [ ] **RESP-02**: Rejected bets return `{ received: true, logId, ticket: { status: "REJECTED", reason: "..." } }`
- [ ] **RESP-03**: Discovery mode (no adapter) continues returning `{ received: true, logId }` unchanged

### Deployment

- [ ] **DEPL-01**: Adapter is activated in production (rename `.draft.js` → `.js`, deploy to VPS)
- [ ] **DEPL-02**: End-to-end test with provider sending real payloads and receiving acceptance/rejection responses

## v1.1 Requirements (Complete)

<details>
<summary>All 15 requirements complete</summary>

### Fix
- [x] **FIX-01**: /admin/reportes loads without client-side errors

### Filters
- [x] **FILT-01**: Admin can select a date range (from/to) for the report
- [x] **FILT-02**: Admin can filter by game (all games or specific game)
- [x] **FILT-03**: Admin can filter by source (Online, SRQ, Webhook) and by specific provider (ApiSystem)
- [x] **FILT-04**: Filters apply to both summary cards and detail table simultaneously

### Summary
- [x] **SUMM-01**: Admin sees summary cards with total sales, total prizes, total profit, and ticket count
- [x] **SUMM-02**: Admin sees aggregated totals by game (one row per game with sales/prizes/profit)
- [x] **SUMM-03**: Admin sees aggregated totals by provider/source

### Detail
- [x] **DETL-01**: Admin sees a per-draw detail table with: date, time, game, status, winner, sales, prizes, balance, ticket count
- [x] **DETL-02**: Detail table supports pagination for large date ranges
- [x] **DETL-03**: Detail table is sortable by date/time

### Export
- [x] **EXPO-01**: Admin can download the current filtered report as PDF

### Backend
- [x] **BACK-01**: Backend endpoint supports date range (dateFrom/dateTo) query params
- [x] **BACK-02**: Backend endpoint supports source and apiSystemId filters
- [x] **BACK-03**: Backend returns game-level and provider-level aggregations in the response

</details>

## v2 Requirements

Deferred to future releases.

- **RATE-01**: Rate limiting per provider to prevent webhook abuse
- **RATE-02**: Provider-specific daily bet volume caps
- **PROV-01**: Admin UI to manage slot mappings per provider (instead of hardcoded config)
- **PROV-02**: Admin UI to view real-time ticket acceptance/rejection stats per provider
- **EXPO-02**: Excel export
- **DETL-04**: Drill-down from summary row to filtered detail

## Out of Scope

| Feature | Reason |
|---------|--------|
| Commercial network hierarchy (comercializadora/banca/grupo) for webhook providers | Not needed — userId stays null, providerData stores original payload, reports filter by source + apiSystemId |
| Queue-based webhook processing | Ticket volume expected to be low enough for real-time processing |
| Multi-provider slot configs | Only Virtuales for now; generalize when second provider arrives |
| Refactoring SRQ into adapter pattern | SRQ stays as PULL with its own sync jobs |
| Real-time updating reports | Reports are read-only snapshots, not live dashboards |
| Scheduled email reports | Future feature |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 5 | Complete |
| BACK-01 | Phase 5 | Complete |
| BACK-02 | Phase 5 | Complete |
| BACK-03 | Phase 5 | Complete |
| FILT-01 | Phase 6 | Complete |
| FILT-02 | Phase 6 | Complete |
| FILT-03 | Phase 6 | Complete |
| FILT-04 | Phase 6 | Complete |
| SUMM-01 | Phase 6 | Complete |
| SUMM-02 | Phase 6 | Complete |
| SUMM-03 | Phase 6 | Complete |
| DETL-01 | Phase 6 | Complete |
| DETL-02 | Phase 6 | Complete |
| DETL-03 | Phase 6 | Complete |
| EXPO-01 | Phase 7 | Complete |
| ADAPT-01 | Phase 8 | Pending |
| ADAPT-02 | Phase 8 | Pending |
| ADAPT-03 | Phase 8 | Pending |
| ADAPT-04 | Phase 8 | Pending |
| VALID-01 | Phase 8 | Pending |
| VALID-02 | Phase 8 | Pending |
| VALID-03 | Phase 8 | Pending |
| VALID-04 | Phase 8 | Pending |
| RESP-01 | Phase 9 | Pending |
| RESP-02 | Phase 9 | Pending |
| RESP-03 | Phase 9 | Pending |
| DEPL-01 | Phase 10 | Pending |
| DEPL-02 | Phase 10 | Pending |

**Coverage:**
- v1.2 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after v1.2 roadmap created (Phases 8-10)*
