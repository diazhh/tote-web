// Builds the `fill` spec (selector→value injections) for the marketing templates,
// from the day's draw data. Pairs with html-renderer.renderTemplateToPng.
import { getGameConfig } from './game-config.js';

/**
 * Daily "resultados del día" board.
 * @param {string} slug game slug
 * @param {{dateText:string, slots:Object<number,{number:(string|number), name?:string}>}} data
 *        slots keyed by hour 8..19
 * @returns {{templatePath:string, fill:{texts:[string,string][], attrs:[string,string,string][]}}}
 */
export function buildDailyFill(slug, { dateText, slots, variant = 'feed' }) {
  const cfg = getGameConfig(slug);
  const texts = [['.board__date', dateText]];
  const attrs = [];
  for (let hour = 8; hour <= 19; hour++) {
    const n = hour - 7; // data-slot 1..12
    const slot = slots[hour];
    if (cfg.cellMode === 'animal') {
      const src = slot ? 'file://' + cfg.assetFor(String(slot.number)) : '';
      attrs.push([`[data-slot="${n}"] .cell__art`, 'src', src]);
    } else {
      texts.push([`[data-slot="${n}"] .cell__number`, slot ? String(slot.number).padStart(3, '0') : '—']);
    }
  }
  const templatePath = variant === 'story' ? cfg.dailyStoryTemplate : cfg.dailyTemplate;
  return { templatePath, fill: { texts, attrs } };
}

/**
 * Weekly "pizarra" matrix (7 days × 12 hours).
 * @param {string} slug game slug
 * @param {{weekText:string, matrix:Array<Array<string|number|null>>}} data
 *        matrix[row 0..11][col 0..6]; null/undefined → empty cell
 * @returns {{templatePath:string, fill:{texts:[string,string][]}}}
 */
export function buildPizarraFill(slug, { weekText, matrix, variant = 'feed' }) {
  const cfg = getGameConfig(slug);
  const texts = [['.board__week', weekText]];
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 7; c++) {
      const v = matrix?.[r]?.[c];
      texts.push([`[data-cell="${r + 1}-${c + 1}"]`, v == null ? '' : String(v)]);
    }
  }
  const templatePath = variant === 'story' ? cfg.pizarraStoryTemplate : cfg.pizarraTemplate;
  return { templatePath, fill: { texts } };
}
