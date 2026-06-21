import { describe, test, expect } from '@jest/globals';
import { CANVAS, DAILY_GRID, gridRects, hourLabel, dateLabel } from '../layout.js';

describe('layout', () => {
  test('gridRects returns 12 uniform rects within the content area', () => {
    const rects = gridRects(CANVAS.portrait, DAILY_GRID);
    expect(rects).toHaveLength(12);
    const w0 = rects[0].w, h0 = rects[0].h;
    for (const r of rects) {
      expect(r.w).toBe(w0);
      expect(r.h).toBe(h0);
      expect(r.x).toBeGreaterThanOrEqual(DAILY_GRID.margin);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS.portrait.w - DAILY_GRID.margin + 1);
      expect(r.y).toBeGreaterThanOrEqual(DAILY_GRID.headerH);
      expect(r.y + r.h).toBeLessThanOrEqual(CANVAS.portrait.h - DAILY_GRID.footerH + 1);
    }
    // row-major: index 1 is to the right of index 0; index 3 starts a new row
    expect(rects[1].x).toBeGreaterThan(rects[0].x);
    expect(rects[1].y).toBe(rects[0].y);
    expect(rects[3].x).toBe(rects[0].x);
    expect(rects[3].y).toBeGreaterThan(rects[0].y);
  });

  test('hourLabel formats 12h with am/pm', () => {
    expect(hourLabel(8)).toBe('08:00 am');
    expect(hourLabel(12)).toBe('12:00 pm');
    expect(hourLabel(19)).toBe('07:00 pm');
  });

  test('dateLabel formats DD/MM/YY in UTC', () => {
    expect(dateLabel(new Date(Date.UTC(2026, 5, 21)))).toBe('21/06/26');
  });
});
