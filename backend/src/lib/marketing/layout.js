export const CANVAS = {
  portrait: { w: 1080, h: 1350 },
  story:    { w: 1080, h: 1920 },
  square:   { w: 1080, h: 1080 },
};

export const DAILY_GRID = { cols: 3, rows: 4, margin: 40, gutter: 24, headerH: 250, footerH: 60 };

export function gridRects(canvas, grid) {
  const { cols, rows, margin, gutter, headerH, footerH } = grid;
  const contentX = margin;
  const contentY = headerH;
  const contentW = canvas.w - 2 * margin;
  const contentH = canvas.h - headerH - footerH;
  const cellW = (contentW - (cols - 1) * gutter) / cols;
  const cellH = (contentH - (rows - 1) * gutter) / rows;
  const rects = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      index: i,
      x: Math.round(contentX + col * (cellW + gutter)),
      y: Math.round(contentY + row * (cellH + gutter)),
      w: Math.round(cellW),
      h: Math.round(cellH),
    });
  }
  return rects;
}

export function hourLabel(hour) {
  const period = hour < 12 ? 'am' : 'pm';
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:00 ${period}`;
}

export function dateLabel(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = String(date.getUTCFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}
