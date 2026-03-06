/**
 * Test: send draw result image to admin via Telegram
 */
import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import path from 'path';

async function main() {
  // Check recent draw images
  const resultsDir = './storage/results';
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.png')).sort().slice(-5);
  console.log('Recent images:', files);

  // Get bot info
  const bot = await prisma.adminTelegramBot.findFirst({ where: { isActive: true } });
  if (!bot) { console.log('No active bot'); return; }
  console.log(`Bot: @${bot.botUsername}`);

  // Send image directly via Telegram API
  const TelegramBot = (await import('node-telegram-bot-api')).default;
  const tgBot = new TelegramBot(bot.botToken);

  const chatId = '5279866729';
  const imagePath = path.resolve(resultsDir, files[files.length - 1]);
  console.log(`Sending ${imagePath} to ${chatId}...`);

  try {
    await tgBot.sendPhoto(chatId, fs.createReadStream(imagePath), {
      caption: `Test: ${files[files.length - 1]}`,
    });
    console.log('Image sent successfully!');
  } catch (err) {
    console.error('Error sending image:', err.message);
  }

  await prisma.$disconnect();
}

main();
