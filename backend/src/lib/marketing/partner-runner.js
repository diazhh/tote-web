// Renderiza y publica las piezas "¿dónde jugar?": story diaria (IG/FB/Telegram)
// y directorio on-demand para Twitter. Calca resumen-runner.
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import logger from '../logger.js';
import { renderTemplateToPng } from './html-renderer.js';
import { loadPartners, pickDailyGroup, buildLinksCaption, chunkThread } from './partner-catalog.js';
import { buildDondeJugarStoryFill, buildDondeJugarDirectorioFill, getFamily } from './partner-fill.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../../../storage/results');

function stampOf(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Story diaria "¿dónde jugar?" → IG/FB (story nativa) + Telegram (imagen + caption con 4 links).
 * @param {{date:(string|Date), family:string}} args
 * @param {object} [deps] inyección para tests
 */
export async function runDailyDondeJugar({ date, family }, deps = {}) {
  const {
    render = renderTemplateToPng,
    writeFile = fs.writeFile,
    mkdir = fs.mkdir,
    publication = null,
    findGameBySlug = (slug) => prisma.game.findFirst({ where: { slug } }),
  } = deps;
  const pub = publication || (await import('../../services/publication.service.js')).default;

  const fam = getFamily(family);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  await mkdir(OUTPUT_PATH, { recursive: true });

  const partners = await loadPartners();
  const group = pickDailyGroup(partners, dateObj);
  logger.info(`[donde-jugar:${family}] casas del día: ${group.map((p) => p.name).join(', ')}`);

  const { templatePath, fill } = buildDondeJugarStoryFill(family, group);
  const buf = await render({ templatePath, fill, width: 1080, height: 1920 });

  const storyFilename = `dondejugar_${family}_${stampOf(dateObj)}_story.png`;
  const storyPath = path.join(OUTPUT_PATH, storyFilename);
  await writeFile(storyPath, buf);

  const game = await findGameBySlug(fam.gameSlug);
  if (!game) throw new Error(`Game ${fam.gameSlug} not found`);

  const caption = buildLinksCaption(group);

  try {
    await pub.publishStoryToChannels(game.id, storyPath, storyFilename, caption, {
      channelTypes: ['INSTAGRAM', 'FACEBOOK', 'TELEGRAM'],
    });
  } catch (err) {
    logger.warn(`[donde-jugar:${family}] error publicando story: ${err.message}`);
  }

  return { success: true, gameId: game.id, storyFilename, storyPath };
}

/**
 * Directorio (16 logos) para Twitter, on-demand: tweet raíz con imagen + hilo de links.
 * El pin es manual (la API de X no lo soporta). Devuelve las URLs de los tweets raíz.
 * @param {{family:string}} args
 * @param {object} [deps] inyección para tests
 */
export async function runTwitterDirectorio({ family }, deps = {}) {
  const {
    render = renderTemplateToPng,
    writeFile = fs.writeFile,
    mkdir = fs.mkdir,
    twitter = null,
    findGameBySlug = (slug) => prisma.game.findFirst({ where: { slug } }),
    findTwitterChannels = (gameId) => prisma.gameChannel.findMany({ where: { gameId, channelType: 'TWITTER', isActive: true } }),
  } = deps;
  const tw = twitter || (await import('../../services/twitter.service.js')).default;

  const fam = getFamily(family);
  await mkdir(OUTPUT_PATH, { recursive: true });

  const partners = await loadPartners();
  const { templatePath, fill } = buildDondeJugarDirectorioFill(family, partners);
  const buf = await render({ templatePath, fill, width: 1080, height: 1350 });

  const filename = `dondejugar_${family}_directorio.png`;
  await writeFile(path.join(OUTPUT_PATH, filename), buf);

  const game = await findGameBySlug(fam.gameSlug);
  if (!game) throw new Error(`Game ${fam.gameSlug} not found`);
  const channels = await findTwitterChannels(game.id);

  const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
  const imageUrl = `${baseUrl}/api/public/images/results/${filename}`;
  const rootText = '🎰 ¿Dónde jugar? Estas son las casas donde puedes jugar 👇 Todos los links en el hilo.';
  const thread = chunkThread(partners);

  const out = [];
  for (const ch of channels) {
    const root = await tw.publishTweet(ch.twitterInstanceId, rootText, imageUrl);
    if (!root.success) {
      out.push({ channel: ch.name, success: false, error: root.error });
      continue;
    }
    let lastId = root.tweetId;
    for (const chunk of thread) {
      const r = await tw.replyTweet(ch.twitterInstanceId, chunk, lastId);
      if (r.success) lastId = r.tweetId;
    }
    out.push({ channel: ch.name, success: true, rootTweetId: root.tweetId, url: `https://x.com/i/web/status/${root.tweetId}` });
  }
  return { success: out.some((o) => o.success), results: out };
}
