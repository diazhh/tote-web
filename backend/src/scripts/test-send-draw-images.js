/**
 * Send all 12:00 draw images to admin for verification
 */
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';

async function main() {
  const bot = await prisma.adminTelegramBot.findFirst({ where: { isActive: true } });
  const tgBot = new TelegramBot(bot.botToken);
  const chatId = '5279866729';

  const images = [
    { file: 'triple_20260305_1200.png', caption: 'TRIPLE PANTERA 12:00 PM' },
    { file: 'animalitos_20260305_1200.png', caption: 'LOTTOPANTERA 12:00 PM' },
    { file: 'ruleta_20260305_1200.png', caption: 'LOTOANIMALITO 12:00 PM' },
  ];

  for (const img of images) {
    const fullPath = path.resolve('./storage/results', img.file);
    if (!fs.existsSync(fullPath)) {
      console.log(`MISSING: ${img.file}`);
      continue;
    }
    try {
      await tgBot.sendPhoto(chatId, fs.createReadStream(fullPath), { caption: img.caption });
      console.log(`Sent: ${img.caption}`);
    } catch (err) {
      console.error(`Error ${img.file}: ${err.message}`);
    }
  }

  await prisma.$disconnect();
}

main();
