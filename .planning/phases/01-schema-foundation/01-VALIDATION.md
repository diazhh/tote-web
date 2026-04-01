---
phase: 1
slug: schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (existing) |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npm test -- --testPathPattern=schema` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx prisma validate`
- **After every plan wave:** Run `cd backend && npx prisma db push --accept-data-loss && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SCHEMA-01 | prisma validate | `cd backend && npx prisma validate` | N/A | pending |
| 1-01-02 | 01 | 1 | SCHEMA-02 | prisma validate | `cd backend && npx prisma validate` | N/A | pending |
| 1-01-03 | 01 | 1 | SCHEMA-03 | prisma validate | `cd backend && npx prisma validate` | N/A | pending |
| 1-01-04 | 01 | 1 | SCHEMA-01 | db push | `cd backend && npx prisma db push` | N/A | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed for schema-only changes. Validation is via `prisma validate` and `prisma db push`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SRQ backfill correctness | SCHEMA-01 | Requires checking production data post-push | Run backfill script, then query: `SELECT slug, mode FROM "ApiSystem"` — expect SRQ row has slug='srq', mode='PULL' |
| Production migration safety | SCHEMA-01, 02, 03 | Requires SSH to VPS 144 | SSH to 144, run `prisma db push`, verify no data loss with `SELECT count(*) FROM "ApiSystem"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
