import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import { STORY_TEMPLATE, DIRECTORIO_TEMPLATE } from '../partner-fill.js';

describe('donde-jugar templates', () => {
  test('story template exists with #board and 4 logo slots', () => {
    const html = fs.readFileSync(STORY_TEMPLATE, 'utf8');
    expect(html).toContain('id="board"');
    for (let n = 1; n <= 4; n++) {
      expect(html).toContain(`data-logo="${n}"`);
    }
    expect(html).toContain('class="logo__img"');
    expect(html).toContain('class="logo__name"');
    expect(html).toContain('class="logo__url"');
    expect(html).toContain('board__handle');
    expect(html).toContain('var(--bg1');
  });
  test('directorio template exists with #board and 16 logo slots', () => {
    const html = fs.readFileSync(DIRECTORIO_TEMPLATE, 'utf8');
    expect(html).toContain('id="board"');
    for (let n = 1; n <= 16; n++) {
      expect(html).toContain(`data-logo="${n}"`);
    }
  });
});
