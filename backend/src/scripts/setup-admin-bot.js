/**
 * Script para configurar el bot de administración inicial
 * Uso: node src/scripts/setup-admin-bot.js
 */

import { prisma } from '../lib/prisma.js';
import TelegramBot from 'node-telegram-bot-api';

const BOT_TOKEN = '7984703561:AAH8-OUG2NO20bUMXH-vIY14KIPmSNOm17g';
const BOT_NAME = 'Bot Notificaciones Tote';

async function setupAdminBot() {
  try {
    console.log('🤖 Configurando bot de administración...\n');

    // Verificar si ya existe
    const existing = await prisma.adminTelegramBot.findUnique({
      where: { botToken: BOT_TOKEN }
    });

    if (existing) {
      console.log('⚠️  El bot ya está registrado:');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Nombre: ${existing.name}`);
      console.log(`   Username: @${existing.botUsername}`);
      console.log(`   Estado: ${existing.status}`);
      return;
    }

    // Verificar token con Telegram
    console.log('📡 Verificando token con Telegram...');
    const tempBot = new TelegramBot(BOT_TOKEN);
    const botInfo = await tempBot.getMe();
    console.log(`✅ Bot verificado: @${botInfo.username}\n`);

    // Crear bot en la BD
    const bot = await prisma.adminTelegramBot.create({
      data: {
        name: BOT_NAME,
        botToken: BOT_TOKEN,
        botUsername: botInfo.username,
        status: 'DISCONNECTED',
        isActive: true
      }
    });

    console.log('✅ Bot creado exitosamente:');
    console.log(`   ID: ${bot.id}`);
    console.log(`   Nombre: ${bot.name}`);
    console.log(`   Username: @${bot.botUsername}`);

    // Obtener juegos disponibles
    const games = await prisma.game.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });

    if (games.length > 0) {
      console.log('\n📋 Juegos disponibles para asignar:');
      games.forEach((g, i) => console.log(`   ${i + 1}. ${g.name} (${g.id})`));

      // Asignar todos los juegos al bot
      console.log('\n🎮 Asignando todos los juegos al bot...');
      await prisma.adminBotGame.createMany({
        data: games.map(g => ({
          botId: bot.id,
          gameId: g.id
        }))
      });
      console.log(`✅ ${games.length} juego(s) asignado(s)`);
    }

    console.log('\n🎉 Configuración completada!');
    console.log('\n📌 Próximos pasos:');
    console.log('   1. Reinicia el backend para que el bot se inicie');
    console.log('   2. Ve a /admin/bots-admin para gestionar el bot');
    console.log('   3. Los usuarios pueden vincular su Telegram en /admin/configuracion');
    console.log(`   4. Busca @${botInfo.username} en Telegram y usa /start`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('401')) {
      console.error('   El token del bot es inválido. Verifica con @BotFather');
    }
  } finally {
    await prisma.$disconnect();
  }
}

setupAdminBot();
