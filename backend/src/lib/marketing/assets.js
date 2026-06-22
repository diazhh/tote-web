import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_PATH = path.join(__dirname, '../../../storage/fonts');

export async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export function fontPath(file) { return path.join(FONTS_PATH, file); }

export function fontFace(family, file) {
  return `@font-face { font-family: '${family}'; src: url('file://${fontPath(file)}'); font-weight: bold; }`;
}

export async function resolveBackground(cfg, canvas) {
  const bgFile = path.join(cfg.marketingDir, 'background.png');
  if (await fileExists(bgFile)) {
    return sharp(bgFile).resize(canvas.w, canvas.h, { fit: 'cover', position: 'centre' }).png().toBuffer();
  }
  const grad = Buffer.from(`
    <svg width="${canvas.w}" height="${canvas.h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cfg.palette.bg1}"/>
          <stop offset="100%" stop-color="${cfg.palette.bg2}"/>
        </linearGradient>
      </defs>
      <rect width="${canvas.w}" height="${canvas.h}" fill="url(#g)"/>
    </svg>`);
  return sharp(grad).resize(canvas.w, canvas.h).png().toBuffer();
}

export async function logoLayer(cfg, canvas, { top = 40, maxH = 150 } = {}) {
  if (!(await fileExists(cfg.logo))) return null;
  const { data: input, info } = await sharp(cfg.logo).resize({ height: maxH, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  return { input, left: Math.round((canvas.w - info.width) / 2), top };
}

export async function mascotLayer(cfg, canvas, { maxH = 170 } = {}) {
  const mascotFile = path.join(cfg.marketingDir, 'mascot.png');
  if (!(await fileExists(mascotFile))) return null;
  const { data: input, info } = await sharp(mascotFile).resize({ height: maxH, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  return { input, left: canvas.w - info.width - 30, top: 20 };
}
