# Requirements: Tote-Web

**Defined:** 2026-04-01
**Core Value:** Reliable draw lifecycle management — draws execute on schedule, results publish, prizes process correctly.

## v1.1 Requirements

Requirements for Reports Dashboard milestone. Each maps to roadmap phases.

### Fix

- [ ] **FIX-01**: /admin/reportes loads without client-side errors

### Filters

- [ ] **FILT-01**: Admin can select a date range (from/to) for the report
- [ ] **FILT-02**: Admin can filter by game (all games or specific game)
- [ ] **FILT-03**: Admin can filter by source (Online, SRQ, Webhook) and by specific provider (ApiSystem)
- [ ] **FILT-04**: Filters apply to both summary cards and detail table simultaneously

### Summary

- [ ] **SUMM-01**: Admin sees summary cards with total sales, total prizes, total profit, and ticket count
- [ ] **SUMM-02**: Admin sees aggregated totals by game (one row per game with sales/prizes/profit)
- [ ] **SUMM-03**: Admin sees aggregated totals by provider/source

### Detail

- [ ] **DETL-01**: Admin sees a per-draw detail table with: date, time, game, status, winner, sales, prizes, balance, ticket count
- [ ] **DETL-02**: Detail table supports pagination for large date ranges
- [ ] **DETL-03**: Detail table is sortable by date/time

### Export

- [ ] **EXPO-01**: Admin can download the current filtered report as PDF

### Backend

- [ ] **BACK-01**: Backend endpoint supports date range (dateFrom/dateTo) query params
- [ ] **BACK-02**: Backend endpoint supports source and apiSystemId filters
- [ ] **BACK-03**: Backend returns game-level and provider-level aggregations in the response

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
| FIX-01 | -- | Pending |
| FILT-01 | -- | Pending |
| FILT-02 | -- | Pending |
| FILT-03 | -- | Pending |
| FILT-04 | -- | Pending |
| SUMM-01 | -- | Pending |
| SUMM-02 | -- | Pending |
| SUMM-03 | -- | Pending |
| DETL-01 | -- | Pending |
| DETL-02 | -- | Pending |
| DETL-03 | -- | Pending |
| EXPO-01 | -- | Pending |
| BACK-01 | -- | Pending |
| BACK-02 | -- | Pending |
| BACK-03 | -- | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
