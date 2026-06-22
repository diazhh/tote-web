// backend/src/lib/marketing/pizarra-runner.js
// Weekly "pizarra" board (7 days × 12 hours). Renders feed 1080×1350 and
// story 1080×1920. Cadence is decided by the worker: every day → story only;
// Sunday → story + feed. Story/feed go to IG/FB/TG/WA (never Twitter).
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import logger from '../logger.js';
import { renderTemplateToPng } from './html-renderer.js';
import { buildPizarraFill } from './board-fill.js';
import { getGameConfig } from './game-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../../../storage/results');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Channels a pizarra reaches (no Twitter — sin stories y fuera del alcance pedido).
export const PIZARRA_CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'TELEGRAM', 'WHATSAPP'];

// Monday..Sunday (UTC-midnight, matching how drawDate is keyed to the VE date).
function weekRange(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday, sunday };
}

function weekLabel(monday, sunday) {
  const dd = (x) => String(x.getUTCDate()).padStart(2, '0');
  if (monday.getUTCMonth() === sunday.getUTCMonth()) {
    return `${dd(monday)} – ${dd(sunday)} ${MONTHS[sunday.getUTCMonth()]}`;
  }
  return `${dd(monday)} ${MONTHS[monday.getUTCMonth()]} – ${dd(sunday)} ${MONTHS[sunday.getUTCMonth()]}`;
}

/** True when `date` falls on a Sunday (VE calendar). */
export function isSunday(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getUTCDay() === 0;
}

/**
 * Build the week matrix[12 hours][7 days] of winning numbers for a game.
 */
async function buildMatrix(game, cfg, monday, sunday) {
  const draws = await prisma.draw.findMany({
    where: { gameId: game.id, drawDate: { gte: monday, lte: sunday }, status: 'DRAWN', winnerItemId: { not: null } },
    include: { winnerItem: true },
  });
  const matrix = Array.from({ length: 12 }, () => Array(7).fill(null));
  for (const draw of draws) {
    const dd = new Date(draw.drawDate);
    const col = (dd.getUTCDay() + 6) % 7;          // 0=Mon .. 6=Sun
    const row = parseInt(draw.drawTime.split(':')[0], 10) - 8; // hour 8..19 → 0..11
    if (row < 0 || row > 11 || col < 0 || col > 6) continue;
    const n = String(draw.winnerItem.number);
    matrix[row][col] = cfg.cellMode === 'number' ? n.padStart(3, '0') : n.padStart(2, '0');
  }
  return matrix;
}

/**
 * Generate pizarra pieces. Always renders the story PNG; renders the feed PNG
 * only when `withFeed` (Sunday).
 */
export async function generatePizarraImage({ slug, fileSlug, date: dateInput, withFeed = false }) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  await fs.mkdir(OUTPUT_PATH, { recursive: true });

  const game = await prisma.game.findFirst({ where: { slug } });
  if (!game) throw new Error(`Game ${slug} not found`);
  const cfg = getGameConfig(slug);

  const { monday, sunday } = weekRange(date);
  const weekText = weekLabel(monday, sunday);
  const matrix = await buildMatrix(game, cfg, monday, sunday);

  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const base = fileSlug || slug;

  // Story 1080×1920 (always)
  const story = buildPizarraFill(slug, { weekText, matrix, variant: 'story' });
  const storyBuf = await renderTemplateToPng({ templatePath: story.templatePath, fill: story.fill, width: 1080, height: 1920 });
  const storyFilename = `pizarra_${base}_${stamp}_story.png`;
  const storyPath = path.join(OUTPUT_PATH, storyFilename);
  await fs.writeFile(storyPath, storyBuf);

  // Feed 1080×1350 (Sunday only)
  let feedFilename = null, feedPath = null;
  if (withFeed) {
    const feed = buildPizarraFill(slug, { weekText, matrix, variant: 'feed' });
    const feedBuf = await renderTemplateToPng({ templatePath: feed.templatePath, fill: feed.fill, width: 1080, height: 1350 });
    feedFilename = `pizarra_${base}_${stamp}.png`;
    feedPath = path.join(OUTPUT_PATH, feedFilename);
    await fs.writeFile(feedPath, feedBuf);
  }

  logger.info(`[pizarra:${slug}] Generado story${withFeed ? '+feed' : ''} (${weekText})`);
  return { gameId: game.id, weekText, storyFilename, storyPath, feedFilename, feedPath, withFeed };
}

export async function runPizarraWorker({ slug, fileSlug, displayName, jobs }) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { date } = job.data;
  const withFeed = isSunday(date);
  logger.info(`[pizarra:${slug}] Generando pizarra para ${date} (withFeed=${withFeed})`);
  const r = await generatePizarraImage({ slug, fileSlug, date, withFeed });

  const caption = `🗓️ Pizarra semanal ${displayName} (${r.weekText})`;

  try {
    const adminBot = (await import('../../services/admin-telegram-bot.service.js')).default;
    await adminBot.sendImageToAdmins(r.storyPath, caption);
  } catch (err) {
    logger.warn(`[pizarra:${slug}] Error enviando al admin: ${err.message}`);
  }
  try {
    const publicationService = (await import('../../services/publication.service.js')).default;
    // Story diaria → IG/FB story nativa + TG/WA imagen (sin Twitter)
    await publicationService.publishStoryToChannels(r.gameId, r.storyPath, r.storyFilename, caption, { channelTypes: PIZARRA_CHANNELS });
    // Domingo → además feed a IG/FB/TG/WA
    if (withFeed && r.feedFilename) {
      await publicationService.publishImageToChannels(r.gameId, r.feedPath, r.feedFilename, caption, { channelTypes: PIZARRA_CHANNELS });
    }
  } catch (err) {
    logger.warn(`[pizarra:${slug}] Error publicando en redes sociales: ${err.message}`);
  }
  return { success: true, ...r };
}
