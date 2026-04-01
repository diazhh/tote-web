# Requirements: Tote-Web

**Defined:** 2026-04-01
**Core Value:** Reliable draw lifecycle management — draws execute on schedule, results publish, prizes process correctly.

## v1.1 Requirements

Requirements for Reports Dashboard milestone. Each maps to roadmap phases.

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

## v1.x Requirements

Deferred to future releases.

- **EXPO-02**: Excel export
- **DETL-04**: Drill-down from summary row to filtered detail
- **FILT-05**: Provider hierarchy breakdown (banca/comercial/grupo level)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Banca/comercial/grupo level breakdown | Too granular for v1.1; source + provider is enough |
| Real-time updating reports | Reports are read-only snapshots, not live dashboards |
| Scheduled email reports | Future feature |
| Excel export | Deferred to v1.x |

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

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 — traceability filled after roadmap creation*
