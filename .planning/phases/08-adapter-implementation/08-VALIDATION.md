---
phase: 8
slug: adapter-implementation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=virtuales --no-coverage` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~5 seconds (adapter tests only) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=virtuales --no-coverage`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | ADAPT-01 | — | N/A | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | ADAPT-02 | — | N/A | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | ADAPT-03 | — | N/A | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 1 | ADAPT-04 | — | N/A | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-05 | 01 | 1 | VALID-01 | — | Rejects bets for drawn/cancelled draws | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-06 | 01 | 1 | VALID-02 | — | Rejects bets for closed draws | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-07 | 01 | 1 | VALID-03 | — | Rejects invalid slot IDs | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |
| 08-01-08 | 01 | 1 | VALID-04 | — | Rejects unrecognized numbers | unit | `npx jest --testPathPattern=virtuales` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/virtuales-adapter.test.js` — stubs for ADAPT-01..04, VALID-01..04
- [ ] Test fixtures: mock SLOTS, mock prisma responses, sample payloads

*Existing jest infrastructure covers framework needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
