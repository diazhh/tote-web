// backend/src/lib/marketing/renderer.js
import sharp from 'sharp';
import { CANVAS, DAILY_GRID, gridRects, hourLabel } from './layout.js';
import { getGameConfig } from './game-config.js';
import { resolveBackground, logoLayer, mascotLayer, fontFace } from './assets.js';
import { cardSvg, hourSvg, animalTextSvg, numberTextSvg, animalRasterLayer } from './cells.js';

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const DISPLAY_FAMILY = 'Display';

export async function renderResultsBoard({ slug, canvasName = 'portrait', title, dateText, slots }) {
  const cfg = getGameConfig(slug);
  const canvas = CANVAS[canvasName];
  const rects = gridRects(canvas, DAILY_GRID);

  const background = await resolveBackground(cfg, canvas);

  const headerLayers = [];
  const logo = await logoLayer(cfg, canvas);
  if (logo) headerLayers.push(logo);
  const mascot = await mascotLayer(cfg, canvas);
  if (mascot) headerLayers.push(mascot);

  const animalLayers = [];
  let cards = '';
  let texts = '';

  texts += `<text x="${canvas.w / 2}" y="210" font-family="${DISPLAY_FAMILY}" font-size="44px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${title}</text>`;
  texts += `<text x="${canvas.w / 2}" y="244" font-family="${DISPLAY_FAMILY}" font-size="26px" font-weight="bold" fill="${cfg.palette.border}" text-anchor="middle">${dateText}</text>`;

  for (let i = 0; i < HOURS.length; i++) {
    const rect = rects[i];
    const hour = HOURS[i];
    const slot = slots[hour];
    cards += cardSvg(rect, cfg);
    texts += hourSvg(rect, hourLabel(hour), cfg, DISPLAY_FAMILY);
    if (!slot) {
      texts += `<text x="${rect.x + rect.w / 2}" y="${rect.y + rect.h / 2 + 20}" font-family="${DISPLAY_FAMILY}" font-size="40px" fill="#FFFFFF" text-anchor="middle" opacity="0.5">&#8212;</text>`;
      continue;
    }
    if (cfg.cellMode === 'animal') {
      const layer = await animalRasterLayer(rect, cfg.assetFor(slot.number));
      if (layer) animalLayers.push(layer);
      texts += animalTextSvg(rect, { number: String(slot.number).padStart(2, '0'), name: (slot.name || '').toUpperCase() }, cfg, DISPLAY_FAMILY);
    } else {
      texts += numberTextSvg(rect, { number: String(slot.number).padStart(3, '0') }, cfg, DISPLAY_FAMILY);
    }
  }

  const fontCss = fontFace(DISPLAY_FAMILY, cfg.fonts.display);
  const cardsSvg = `<svg width="${canvas.w}" height="${canvas.h}" xmlns="http://www.w3.org/2000/svg">${cards}</svg>`;
  const textSvg = `<svg width="${canvas.w}" height="${canvas.h}" xmlns="http://www.w3.org/2000/svg"><style>${fontCss}</style>${texts}</svg>`;

  const layers = [
    { input: Buffer.from(cardsSvg), left: 0, top: 0 },
    ...animalLayers,
    ...headerLayers,
    { input: Buffer.from(textSvg), left: 0, top: 0 },
  ];

  return sharp(background).composite(layers).png().toBuffer();
}
