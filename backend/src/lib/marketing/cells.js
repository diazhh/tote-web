import sharp from 'sharp';
import { fileExists } from './assets.js';

export function cardSvg(rect, cfg) {
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="22" ry="22"
    fill="${cfg.palette.card}" stroke="${cfg.palette.border}" stroke-width="3"/>`;
}

export function hourSvg(rect, label, cfg, displayFamily) {
  return `<text x="${rect.x + rect.w / 2}" y="${rect.y + 34}" font-family="${displayFamily}"
    font-size="22px" font-weight="bold" fill="${cfg.palette.hour}" text-anchor="middle">${label}</text>`;
}

export function animalTextSvg(rect, { number, name }, cfg, displayFamily) {
  const cx = rect.x + rect.w / 2;
  const numY = rect.y + rect.h - 40;
  const nameY = rect.y + rect.h - 14;
  return `
    <text x="${cx}" y="${numY}" font-family="${displayFamily}" font-size="50px" font-weight="bold"
      fill="${cfg.palette.number}" text-anchor="middle">${number}</text>
    <text x="${cx}" y="${nameY}" font-family="${displayFamily}" font-size="22px" font-weight="bold"
      fill="${cfg.palette.name}" text-anchor="middle">${name}</text>`;
}

export function numberTextSvg(rect, { number }, cfg, displayFamily) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 + 28;
  return `<text x="${cx}" y="${cy}" font-family="${displayFamily}" font-size="78px" font-weight="bold"
    fill="${cfg.palette.number}" text-anchor="middle" letter-spacing="4">${number}</text>`;
}

export async function animalRasterLayer(rect, animalPath) {
  if (!animalPath || !(await fileExists(animalPath))) return null;
  const artH = Math.round(rect.h * 0.5);
  const artW = Math.round(rect.w * 0.78);
  const buf = await sharp(animalPath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(artW, artH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const meta = await sharp(buf).metadata();
  return {
    input: buf,
    left: Math.round(rect.x + (rect.w - meta.width) / 2),
    top: Math.round(rect.y + 44),
  };
}
