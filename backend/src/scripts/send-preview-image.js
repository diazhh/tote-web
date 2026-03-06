/**
 * Script para generar y enviar imágenes de prueba vía Telegram.
 * Usa los mismos generadores que el sistema usa automáticamente.
 *
 * Tipos disponibles por juego:
 *   pyramid game 1         → piramide-lotoanimalito.worker
 *   pyramid game 2         → piramide-lottopantera.worker
 *   resumen game 1         → resumen-lotoanimalito.worker
 *   resumen game 2         → resumen-lottopantera.worker
 *   resumen game 3         → resumen-triple.worker
 *   recommendations game 3 → recomendaciones-triple.worker
 *   draw game 1|2|3        → imageService.generateDrawImage
 *
 * Uso:
 *   node src/scripts/send-preview-image.js --game 1 --date 2026-03-06 --type pyramid
 *   node src/scripts/send-preview-image.js --game 3 --date 2026-03-06 --type resumen
 *   node src/scripts/send-preview-image.js --game 2 --date 2026-03-06 --type draw
 *   node src/scripts/send-preview-image.js --game 3 --date 2026-03-06 --type recommendations
 *
 * --game:  1=LOTOANIMALITO, 2=LOTTOPANTERA, 3=TRIPLE PANTERA
 * --date:  YYYY-MM-DD (default: hoy en Venezuela)
 * --type:  pyramid | resumen | recommendations | draw
 */

import { prisma } from '../lib/prisma.js';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { OUTPUT_PATH } from '../lib/imageGenerator.js';
import { generatePiramideLotoanimalito } from '../queue/workers/piramide-lotoanimalito.worker.js';
import { generatePiramideLottopantera }  from '../queue/workers/piramide-lottopantera.worker.js';
import { generateRecomendacionesTriple } from '../queue/workers/recomendaciones-triple.worker.js';
import { generateResumenLotoanimalito }  from '../queue/workers/resumen-lotoanimalito.worker.js';
import { generateResumenLottopantera }   from '../queue/workers/resumen-lottopantera.worker.js';
import { generateResumenTriple }         from '../queue/workers/resumen-triple.worker.js';
import { generateDrawImage }             from '../services/imageService.js';

const GAME_SLUGS = {
  1: { slug: 'lotoanimalito',  name: 'LOTOANIMALITO'  },
  2: { slug: 'lottopantera',   name: 'LOTTOPANTERA'   },
  3: { slug: 'triple-pantera', name: 'TRIPLE PANTERA' },
};

const VALID_COMBOS = {
  pyramid:         [1, 2],
  resumen:         [1, 2, 3],
  recommendations: [3],
  draw:            [1, 2, 3],
};

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    result[key] = args[i + 1];
  }
  return result;
}

function todayVenezuela() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

async function main() {
  const args    = parseArgs();
  const gameNum = parseInt(args.game);
  const dateStr = args.date || todayVenezuela();
  const type    = (args.type || 'draw').toLowerCase();

  if (!GAME_SLUGS[gameNum]) {
    console.error('❌ --game debe ser 1, 2 o 3');
    process.exit(1);
  }

  const validGames = VALID_COMBOS[type];
  if (!validGames) {
    console.error(`❌ --type debe ser: ${Object.keys(VALID_COMBOS).join(' | ')}`);
    process.exit(1);
  }
  if (!validGames.includes(gameNum)) {
    console.error(`❌ --type ${type} no disponible para game ${gameNum}. Válido para game: ${validGames.join(', ')}`);
    process.exit(1);
  }

  const { slug, name } = GAME_SLUGS[gameNum];
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateUTC = new Date(Date.UTC(year, month - 1, day));

  console.log(`\n📸 Generando imagen`);
  console.log(`   Juego : ${name} (game ${gameNum})`);
  console.log(`   Fecha : ${dateStr}`);
  console.log(`   Tipo  : ${type}\n`);

  // ── 1. Generar imagen con el worker real ──────────────────────────────────
  let imageResult;

  if (type === 'pyramid' && gameNum === 1) {
    console.log('🔺 Generando pirámide LOTOANIMALITO...');
    imageResult = await generatePiramideLotoanimalito(dateUTC);

  } else if (type === 'pyramid' && gameNum === 2) {
    console.log('🔺 Generando pirámide LOTTOPANTERA...');
    imageResult = await generatePiramideLottopantera(dateUTC);

  } else if (type === 'recommendations') {
    console.log('📊 Generando recomendaciones TRIPLE PANTERA...');
    imageResult = await generateRecomendacionesTriple(dateUTC);

  } else if (type === 'resumen' && gameNum === 1) {
    console.log('📋 Generando resumen LOTOANIMALITO...');
    imageResult = await generateResumenLotoanimalito(dateUTC);

  } else if (type === 'resumen' && gameNum === 2) {
    console.log('📋 Generando resumen LOTTOPANTERA...');
    imageResult = await generateResumenLottopantera(dateUTC);

  } else if (type === 'resumen' && gameNum === 3) {
    console.log('📋 Generando resumen TRIPLE PANTERA...');
    imageResult = await generateResumenTriple(dateUTC);

  } else {
    // draw: buscar un sorteo DRAWN del día y generar su imagen de resultado
    console.log(`🎲 Buscando sorteo DRAWN del ${dateStr} para ${name}...`);

    const game = await prisma.game.findFirst({ where: { slug } });
    if (!game) {
      console.error(`❌ Juego '${slug}' no encontrado en BD`);
      process.exit(1);
    }

    const draws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        drawDate: dateUTC,
        status: 'DRAWN',
        winnerItemId: { not: null },
      },
      include: { winnerItem: true },
      orderBy: { drawTime: 'asc' },
    });

    if (draws.length === 0) {
      console.error(`❌ No hay sorteos DRAWN para ${name} el ${dateStr}`);
      process.exit(1);
    }

    const draw = draws[Math.floor(Math.random() * draws.length)];
    console.log(`   → Sorteo: ${draw.id} | hora: ${draw.drawTime} | resultado: ${draw.winnerItem.number}`);

    const result = await generateDrawImage(draw.id);
    imageResult = {
      filename: result.filename,
      path: path.join(OUTPUT_PATH, result.filename),
    };
  }

  console.log(`✅ Imagen generada: ${imageResult.filename}`);
  console.log(`   Ruta: ${imageResult.path}\n`);

  // ── 2. Obtener bot activo ─────────────────────────────────────────────────
  const botRecord = await prisma.adminTelegramBot.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!botRecord) {
    console.error('❌ No hay ningún AdminTelegramBot activo en la BD');
    process.exit(1);
  }

  console.log(`🤖 Usando bot: ${botRecord.name} (@${botRecord.botUsername || 'sin username'})`);

  // ── 3. Obtener admins con telegramChatId ──────────────────────────────────
  const gameRecord = await prisma.game.findFirst({ where: { slug } });
  let chatIds = [];

  if (gameRecord) {
    const userGames = await prisma.userGame.findMany({
      where: {
        gameId: gameRecord.id,
        notify: true,
        user: { isActive: true, telegramChatId: { not: null } },
      },
      include: { user: { select: { telegramChatId: true, username: true } } },
    });
    chatIds = userGames.map(ug => ug.user.telegramChatId);
    userGames.forEach(ug => console.log(`   → ${ug.user.username}: ${ug.user.telegramChatId}`));
  }

  if (chatIds.length === 0) {
    console.log('⚠️  Sin admins con notify=true para este juego, buscando cualquier usuario con chat ID...');
    const users = await prisma.user.findMany({
      where: { isActive: true, telegramChatId: { not: null } },
      select: { telegramChatId: true, username: true },
    });
    chatIds = users.map(u => u.telegramChatId);
    users.forEach(u => console.log(`   → ${u.username}: ${u.telegramChatId}`));
  }

  if (chatIds.length === 0) {
    console.error('❌ Ningún usuario tiene telegramChatId configurado en la BD');
    process.exit(1);
  }

  console.log(`\n📬 Enviando a ${chatIds.length} destinatario(s)...\n`);

  // ── 4. Enviar vía Telegram ────────────────────────────────────────────────
  const bot     = new TelegramBot(botRecord.botToken, { polling: false });
  const caption = `🖼 <b>${name}</b> — ${type}\n📅 ${dateStr}`;

  let sent = 0;
  for (const chatId of chatIds) {
    try {
      const s = fs.createReadStream(imageResult.path);
      await bot.sendPhoto(chatId, s, { caption, parse_mode: 'HTML' });
      console.log(`✅ Enviado a ${chatId}`);
      sent++;
    } catch (err) {
      console.error(`❌ Error enviando a ${chatId}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Listo: ${sent}/${chatIds.length} enviados`);
  console.log(`   Archivo: ${imageResult.path}\n`);
}

main()
  .catch(err => {
    console.error('\n❌ Error fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
