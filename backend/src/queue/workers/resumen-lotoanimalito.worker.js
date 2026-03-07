import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, '../../../storage');
const RESUMEN_PATH = path.join(STORAGE, 'bases/1/resultados dia');
const FONTS_PATH = path.join(STORAGE, 'fonts');
const OUTPUT_PATH = path.join(STORAGE, 'results');

// Time slots: left column 08-13, right column 14-19
const TIME_SLOTS = [
  { hour: 8,  label: '08:00 am', col: 'left',  row: 0 },
  { hour: 9,  label: '09:00 am', col: 'left',  row: 1 },
  { hour: 10, label: '10:00 am', col: 'left',  row: 2 },
  { hour: 11, label: '11:00 am', col: 'left',  row: 3 },
  { hour: 12, label: '12:00 pm', col: 'left',  row: 4 },
  { hour: 13, label: '01:00 pm', col: 'left',  row: 5 },
  { hour: 14, label: '02:00 pm', col: 'right', row: 0 },
  { hour: 15, label: '03:00 pm', col: 'right', row: 1 },
  { hour: 16, label: '04:00 pm', col: 'right', row: 2 },
  { hour: 17, label: '05:00 pm', col: 'right', row: 3 },
  { hour: 18, label: '06:00 pm', col: 'right', row: 4 },
  { hour: 19, label: '07:00 pm', col: 'right', row: 5 },
];

// Circle center positions (measured from fondo resumen.png: 121x118 circles)
const LEFT_COL_X = 431;
const RIGHT_COL_X = 910;
const FIRST_ROW_Y = 229;
const ROW_SPACING = 150;

export async function generateResumenLotoanimalito(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  // 1. Query draws for this date
  const game = await prisma.game.findFirst({ where: { slug: 'lotoanimalito' } });
  if (!game) throw new Error('Game lotoanimalito not found');

  const drawDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const draws = await prisma.draw.findMany({
    where: { gameId: game.id, drawDate, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
    orderBy: { drawTime: 'asc' },
  });

  // Map draws by hour
  const drawsByHour = {};
  for (const draw of draws) {
    const hour = parseInt(draw.drawTime.split(':')[0]);
    drawsByHour[hour] = draw;
  }

  // 2. Load background
  const bgPath = path.join(RESUMEN_PATH, 'fondo resumen.png');

  // 3. Build composite layers — SVG text "NN NOMBRE" in each slot
  const layers = [];
  const fontPath = path.join(FONTS_PATH, 'panda.otf');

  let slotSvg = `<svg width="1080" height="1080">
    <style>
      @font-face { font-family: 'Panda'; src: url('file://${fontPath}'); font-weight: bold; }
    </style>`;

  for (const slot of TIME_SLOTS) {
    const draw = drawsByHour[slot.hour];
    if (!draw) continue;

    const cx = slot.col === 'left' ? LEFT_COL_X : RIGHT_COL_X;
    const cy = FIRST_ROW_Y + slot.row * ROW_SPACING;
    const num = String(draw.winnerItem.number).padStart(2, '0');
    const nombre = (draw.winnerItem.name || '').toUpperCase();

    slotSvg += `
      <text x="${cx}" y="${cy - 8}" font-family="Panda" font-size="34px"
        font-weight="bold" fill="#000000" text-anchor="middle">${num}</text>
      <text x="${cx}" y="${cy + 22}" font-family="Panda" font-size="16px"
        font-weight="bold" fill="#333333" text-anchor="middle">${nombre}</text>`;
  }

  slotSvg += '</svg>';
  layers.push({ input: Buffer.from(slotSvg), left: 0, top: 0 });

  // 4. Date text overlay — inside the white banner area at top
  // Banner "Resultados Diarios" spans roughly x=130-350, y=65-100 (white area)
  const displayDate = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  const dateSvg = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face { font-family: 'Panda'; src: url('file://${fontPath}'); }
      </style>
      <text x="90" y="180" font-family="Panda" font-size="40px" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayDate}</text>
    </svg>
  `);
  layers.push({ input: dateSvg, left: 0, top: 0 });

  // 6. Composite and save
  const outputFilename = `resumen_lotoanimalito_${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);

  await sharp(bgPath)
    .composite(layers)
    .toFile(outputPath);

  logger.info(`[resumen-lotoanimalito] Imagen generada: ${outputPath}`);
  return { filename: outputFilename, path: outputPath, gameId: game.id };
}

export async function resumenLotoanimalitoWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  logger.info(`[resumen-lotoanimalito] Generando resumen para ${date}`);
  const result = await generateResumenLotoanimalito(date);

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(result.path, `📋 Resumen LOTOANIMALITO - ${date}`);
  } catch (err) {
    logger.warn(`[resumen-lotoanimalito] Error enviando al admin: ${err.message}`);
  }

  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    await publicationService.publishImageToChannels(
      result.gameId,
      result.path,
      result.filename,
      `📋 Resumen LOTOANIMALITO - ${date}`
    );
  } catch (err) {
    logger.warn(`[resumen-lotoanimalito] Error publicando en redes sociales: ${err.message}`);
  }

  return { success: true, ...result };
}
