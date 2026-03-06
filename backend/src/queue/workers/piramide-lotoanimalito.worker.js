import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import logger from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const BASES1 = path.join(STORAGE, 'bases/1');
const PIRAMIDE_PATH = path.join(BASES1, 'piramide');
const FONTS_PATH = path.join(STORAGE, 'fonts');
const OUTPUT_PATH = path.join(STORAGE, 'results');

// Background rotation: dayOfYear % 3
const BACKGROUNDS = ['fondo_azul.png', 'fondo_rojo.png', 'fondo_verde.png'];

// 36 cell coordinates detected from fondo_azul.png (each cell 70x63)
const CELL_COORDS = [
  // Row 0: 8 cells (top)
  { x: 209, y: 251, w: 70, h: 63 }, { x: 293, y: 251, w: 70, h: 63 },
  { x: 378, y: 251, w: 70, h: 63 }, { x: 462, y: 251, w: 70, h: 63 },
  { x: 546, y: 251, w: 70, h: 63 }, { x: 630, y: 251, w: 70, h: 63 },
  { x: 714, y: 251, w: 70, h: 63 }, { x: 799, y: 251, w: 70, h: 63 },
  // Row 1: 7 cells
  { x: 251, y: 340, w: 70, h: 63 }, { x: 335, y: 340, w: 70, h: 63 },
  { x: 419, y: 340, w: 70, h: 63 }, { x: 504, y: 340, w: 70, h: 63 },
  { x: 588, y: 340, w: 70, h: 63 }, { x: 672, y: 340, w: 70, h: 63 },
  { x: 756, y: 340, w: 70, h: 63 },
  // Row 2: 6 cells
  { x: 298, y: 429, w: 70, h: 63 }, { x: 383, y: 429, w: 70, h: 63 },
  { x: 467, y: 429, w: 70, h: 63 }, { x: 551, y: 429, w: 70, h: 63 },
  { x: 635, y: 429, w: 70, h: 63 }, { x: 719, y: 429, w: 70, h: 63 },
  // Row 3: 5 cells
  { x: 340, y: 518, w: 70, h: 63 }, { x: 424, y: 518, w: 70, h: 63 },
  { x: 509, y: 518, w: 70, h: 63 }, { x: 593, y: 518, w: 70, h: 63 },
  { x: 677, y: 518, w: 70, h: 63 },
  // Row 4: 4 cells
  { x: 387, y: 607, w: 70, h: 63 }, { x: 472, y: 607, w: 70, h: 63 },
  { x: 556, y: 607, w: 70, h: 63 }, { x: 640, y: 607, w: 70, h: 63 },
  // Row 5: 3 cells
  { x: 430, y: 696, w: 70, h: 63 }, { x: 515, y: 696, w: 70, h: 63 },
  { x: 599, y: 696, w: 70, h: 63 },
  // Row 6: 2 cells
  { x: 480, y: 786, w: 70, h: 63 }, { x: 564, y: 786, w: 70, h: 63 },
  // Row 7: 1 cell (bottom)
  { x: 526, y: 873, w: 70, h: 63 },
];

/**
 * Pyramid algorithm: DDMMYYYY → sum adjacent digits % 10, row by row.
 */
function calculatePyramid(dateStr) {
  const rows = [dateStr.split('').map(Number)];
  while (rows[rows.length - 1].length > 1) {
    const lastRow = rows[rows.length - 1];
    const newRow = [];
    for (let i = 0; i < lastRow.length - 1; i++) {
      newRow.push((lastRow[i] + lastRow[i + 1]) % 10);
    }
    rows.push(newRow);
  }
  return rows;
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function generatePiramideLotoanimalito(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Determine background (no efemerides on pyramid)
  const localDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const bgIndex = getDayOfYear(localDate) % 3;
  const bgPath = path.join(PIRAMIDE_PATH, BACKGROUNDS[bgIndex]);

  // 2. Calculate pyramid (DDMMYYYY sum-adjacent)
  const dateStr = `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCFullYear()}`;
  const pyramid = calculatePyramid(dateStr);

  // 3. Build composite layers — SVG text digits in cells
  const layers = [];
  const fontPath = path.join(FONTS_PATH, 'panda.otf');

  let svgContent = `<svg width="1080" height="1080">
    <style>
      @font-face {
        font-family: 'Panda';
        src: url('file://${fontPath}');
        font-weight: bold;
      }
    </style>`;

  let cellIndex = 0;
  for (const row of pyramid) {
    for (const digit of row) {
      const pos = CELL_COORDS[cellIndex++];
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h * 0.68;
      svgContent += `
        <text x="${cx}" y="${cy}"
          font-family="Panda"
          font-size="42px"
          font-weight="bold"
          fill="#000000"
          text-anchor="middle">${digit}</text>`;
    }
  }

  svgContent += '</svg>';
  layers.push({ input: Buffer.from(svgContent), left: 0, top: 0 });

  // 4. Date text overlay inside "Fecha" badge (top-right, below label text)
  // Badge label "Fecha" occupies y=40-72 at x=935-1052. Date goes below at y=100.
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face {
          font-family: 'Panda';
          src: url('file://${fontPath}');
          font-weight: bold;
        }
      </style>
      <text x="993" y="105" font-family="Panda" font-size="28px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 5. Composite and save
  const outputFilename = `piramide_lotoanimalito_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[piramide-lotoanimalito] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath };
}

export async function piramideLotoanimalitoWorker(job) {
  const { date } = job.data;
  logger.info(`[piramide-lotoanimalito] Generando pirámide para ${date}`);
  const result = await generatePiramideLotoanimalito(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `🔺 Pirámide LOTOANIMALITO - ${date}`);
  } catch (err) {
    logger.warn(`[piramide-lotoanimalito] Error enviando al admin: ${err.message}`);
  }

  return { success: true, ...result };
}
