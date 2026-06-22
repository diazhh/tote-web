import { describe, test, expect } from '@jest/globals';
import { dateLabel } from '../layout.js';

describe('layout', () => {
  test('dateLabel formats DD/MM/YY in UTC', () => {
    expect(dateLabel(new Date(Date.UTC(2026, 5, 21)))).toBe('21/06/26');
    expect(dateLabel(new Date(Date.UTC(2026, 0, 1)))).toBe('01/01/26');
  });
});
