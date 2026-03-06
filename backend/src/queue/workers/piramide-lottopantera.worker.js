import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import logger from '../../lib/logger.js';
import { isSemanaSanta } from '../../utils/efemerides-venezolanas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const BASES2 = path.join(STORAGE, 'bases/2');
const PIRAMIDE_PATH = path.join(BASES2, 'piramide');
const FONTS_PATH = path.join(STORAGE, 'fonts');
const OUTPUT_PATH = path.join(STORAGE, 'results');

// Backgrounds by day of week from piramide/ folder
const FONDOS_POR_DIA = [
  'fondo piramide azul.png',    // domingo (0)
  'fondo piramide celeste.png', // lunes (1)
  'fondo piramide marron.png',  // martes (2)
  'fondo piramide morado.png',  // miercoles (3)
  'fondo piramide rojo.png',    // jueves (4)
  'fondo piramide verde m.png', // viernes (5)
  'fondo piramide verde.png',   // sábado (6)
];

// 36 cell coordinates detected from piramide2.png white cells (80x80 each)
const CELL_COORDS = [
  // Row 0: 8 cells (top)
  { x: 171, y: 220 }, { x: 265, y: 220 }, { x: 359, y: 220 }, { x: 453, y: 220 },
  { x: 547, y: 220 }, { x: 641, y: 220 }, { x: 735, y: 220 }, { x: 829, y: 220 },
  // Row 1: 7 cells
  { x: 218, y: 318 }, { x: 312, y: 318 }, { x: 406, y: 318 }, { x: 500, y: 318 },
  { x: 594, y: 318 }, { x: 688, y: 318 }, { x: 782, y: 318 },
  // Row 2: 6 cells
  { x: 265, y: 416 }, { x: 359, y: 416 }, { x: 453, y: 416 },
  { x: 547, y: 416 }, { x: 641, y: 416 }, { x: 735, y: 416 },
  // Row 3: 5 cells
  { x: 312, y: 514 }, { x: 406, y: 514 }, { x: 500, y: 514 },
  { x: 594, y: 514 }, { x: 688, y: 514 },
  // Row 4: 4 cells
  { x: 359, y: 612 }, { x: 453, y: 612 }, { x: 547, y: 612 }, { x: 641, y: 612 },
  // Row 5: 3 cells
  { x: 406, y: 710 }, { x: 500, y: 710 }, { x: 594, y: 710 },
  // Row 6: 2 cells
  { x: 453, y: 808 }, { x: 547, y: 808 },
  // Row 7: 1 cell (bottom)
  { x: 500, y: 906 },
];

const CELL_SIZE = 80;

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

function findMostRepeated(pyramid) {
  const counts = {};
  pyramid.forEach(row => {
    row.forEach(num => {
      counts[num] = (counts[num] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([num]) => parseInt(num));
}

export async function generatePiramideLottopantera(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Select background by day of week (Semana Santa uses piramide1.png from BASES2)
  const localDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let bgPath;
  if (isSemanaSanta(localDate)) {
    bgPath = path.join(BASES2, 'piramide1.png');
  } else {
    bgPath = path.join(PIRAMIDE_PATH, FONDOS_POR_DIA[date.getUTCDay()]);
  }

  // 2. Calculate pyramid (DDMMYYYY slice)
  const dateStr = `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}${date.getUTCFullYear()}`;
  const pyramid = calculatePyramid(dateStr);

  // 3. Build composite layers
  const layers = [];
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');

  // 4. Render digits as SVG text centered in each cell
  let svgContent = `<svg width="1080" height="1080">
    <style>
      @font-face {
        font-family: 'Alphakind';
        src: url('file://${fontPath}');
        font-weight: bold;
      }
    </style>`;

  let cellIndex = 0;
  for (const row of pyramid) {
    for (const digit of row) {
      const pos = CELL_COORDS[cellIndex++];
      const cx = pos.x + CELL_SIZE / 2;
      const cy = pos.y + CELL_SIZE / 2 + 15; // +15 for vertical text centering
      svgContent += `
        <text x="${cx}" y="${cy}"
          font-family="Alphakind"
          font-size="45px"
          font-weight="bold"
          fill="#000000"
          text-anchor="middle">
          ${digit}
        </text>`;
    }
  }

  svgContent += '</svg>';
  layers.push({ input: Buffer.from(svgContent), left: 0, top: 0 });

  // 5. Animal overlays for the 4 most repeated digits (corner decorations)
  const dirFiles = await fs.readdir(PIRAMIDE_PATH);
  const mostRepeated = findMostRepeated(pyramid);
  const usedPositions = new Set();

  for (const num of mostRepeated) {
    if (usedPositions.size >= 4) break;
    const animalFile = dirFiles.find(f => f.startsWith(`Piramide${num}_`));
    if (animalFile) {
      const match = animalFile.match(/_(tl|tr|bl|br)\.png$/);
      if (match && !usedPositions.has(match[1])) {
        usedPositions.add(match[1]);
        layers.push({
          input: path.join(PIRAMIDE_PATH, animalFile),
          left: 0,
          top: 0,
        });
      }
    }
  }

  // 6. Date text overlay
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face {
          font-family: 'Alphakind';
          src: url('file://${fontPath}');
          font-weight: bold;
        }
      </style>
      <text x="550" y="105" font-family="Alphakind" font-size="40px" font-weight="bold" fill="#000000">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 7. Composite and save
  const outputFilename = `piramide_lottopantera_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[piramide-lottopantera] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath };
}

export async function piramideLottopanteraWorker(job) {
  const { date } = job.data;
  logger.info(`[piramide-lottopantera] Generando pirámide para ${date}`);
  const result = await generatePiramideLottopantera(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `🔺 Pirámide LOTTOPANTERA - ${date}`);
  } catch (err) {
    logger.warn(`[piramide-lottopantera] Error enviando al admin: ${err.message}`);
  }

  return { success: true, ...result };
}
