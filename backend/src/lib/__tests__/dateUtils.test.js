/**
 * Tests for VE ISO-week helpers added in Phase 12 Plan 12-01.
 *
 * F-15 (pitfall): naive Sunday-Monday math + getFullYear silently miscompute the ISO week
 * around the year boundary. The week containing 2026-12-29..2027-01-03 is ISO 2026-W53 — but
 * getFullYear() on 2027-01-01 returns 2027, so the wrong settlement bucket is hit. The fix is
 * date-fns getISOWeek + getISOWeekYear applied to the date already zoned to Venezuela
 * (America/Caracas, UTC-4 no-DST since 2007).
 *
 * Six tests:
 *   1. 2026-12-29 12:00 VE → { 2026, 53 }
 *   2. 2027-01-01 12:00 VE → { 2026, 53 } (the F-15 trap)
 *   3. 2027-01-04 12:00 VE → { 2027, 1 }
 *   4. startOfISOWeekVE: UTC ISO string is the Monday 04:00:00.000Z of the corresponding ISO week
 *   5. endOfISOWeekVE(d) > startOfISOWeekVE(d) AND < startOfISOWeekVE(d) + 7d
 *   6. getISOWeekVE(d).isoWeek is always 1..53 inclusive (never 0)
 */

import { describe, test, expect } from '@jest/globals';

import {
  getISOWeekVE,
  startOfISOWeekVE,
  endOfISOWeekVE,
} from '../dateUtils.js';

describe('VE ISO-week helpers (F-15 boundary safety)', () => {
  test('Test 1: 2026-12-29 12:00 VE → { isoYear: 2026, isoWeek: 53 }', () => {
    const d = new Date('2026-12-29T12:00:00-04:00');
    expect(getISOWeekVE(d)).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  test('Test 2: 2027-01-01 12:00 VE → { isoYear: 2026, isoWeek: 53 } (F-15 trap: getFullYear would say 2027)', () => {
    const d = new Date('2027-01-01T12:00:00-04:00');
    expect(getISOWeekVE(d)).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  test('Test 3: 2027-01-04 12:00 VE → { isoYear: 2027, isoWeek: 1 }', () => {
    const d = new Date('2027-01-04T12:00:00-04:00');
    expect(getISOWeekVE(d)).toEqual({ isoYear: 2027, isoWeek: 1 });
  });

  test('Test 4: startOfISOWeekVE returns Monday 04:00:00.000Z (i.e., Monday 00:00 VE)', () => {
    // 2026-12-29 12:00 VE is in ISO 2026-W53. The week's Monday is 2026-12-28 00:00 VE,
    // which is 2026-12-28 04:00 UTC.
    const d = new Date('2026-12-29T12:00:00-04:00');
    const start = startOfISOWeekVE(d);
    expect(start.toISOString()).toBe('2026-12-28T04:00:00.000Z');
  });

  test('Test 5: endOfISOWeekVE(d) > startOfISOWeekVE(d) and < start + 7 days', () => {
    const d = new Date('2026-12-29T12:00:00-04:00');
    const start = startOfISOWeekVE(d);
    const end = endOfISOWeekVE(d);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(end.getTime() - start.getTime()).toBeLessThan(sevenDaysMs);
  });

  test('Test 6: getISOWeekVE(d).isoWeek is between 1 and 53 (never 0) — sampled across the year', () => {
    const samples = [
      new Date('2026-01-01T12:00:00-04:00'),
      new Date('2026-03-15T12:00:00-04:00'),
      new Date('2026-06-30T12:00:00-04:00'),
      new Date('2026-09-30T12:00:00-04:00'),
      new Date('2026-12-29T12:00:00-04:00'),
      new Date('2027-01-01T12:00:00-04:00'),
      new Date('2027-01-04T12:00:00-04:00'),
      new Date('2025-12-31T12:00:00-04:00'),
    ];
    for (const d of samples) {
      const { isoWeek } = getISOWeekVE(d);
      expect(isoWeek).toBeGreaterThanOrEqual(1);
      expect(isoWeek).toBeLessThanOrEqual(53);
    }
  });
});
