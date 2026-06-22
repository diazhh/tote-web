// Only `dateLabel` survives the pivot to HTML/CSS templates rendered by Puppeteer
// (html-renderer.js + board-fill.js). The Sharp-era layout math (CANVAS, DAILY_GRID,
// gridRects, hourLabel) lived in renderer.js, which was removed.

export function dateLabel(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = String(date.getUTCFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}
