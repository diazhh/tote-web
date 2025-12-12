/**
 * Script para configurar notificaciones de administradores
 * Uso: node src/scripts/setup-admin-notifications.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma.js';

async function main() {
  console.log('🔧 Configuración de Notificaciones de Administradores\n');

  // Listar usuarios actuales
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      games: {
        include: { game: true }
      }
    }
  });

  console.log('👥 Usuarios activos:');
  console.log('-'.repeat(80));
  
  for (const user of users) {
    const telegramStatus = user.telegramChatId ? `✅ ${user.telegramChatId}` : '❌ No configurado';
    const gamesAssigned = user.games.length > 0 
      ? user.games.map(ug => ug.game.name).join(', ')
      : 'Ninguno';
    
    console.log(`  ${user.username} (${user.role})`);
    console.log(`    - Telegram Chat ID: ${telegramStatus}`);
    console.log(`    - Juegos asignados: ${gamesAssigned}`);
    console.log('');
  }

  // Listar juegos
  const games = await prisma.game.findMany({
    where: { isActive: true }
  });

  console.log('\n🎮 Juegos disponibles:');
  console.log('-'.repeat(80));
  for (const game of games) {
    console.log(`  - ${game.name} (${game.id})`);
  }

  console.log('\n📝 Para configurar un administrador:');
  console.log('');
  console.log('1. Actualizar telegramChatId del usuario:');
  console.log('   UPDATE "User" SET "telegramChatId" = \'<CHAT_ID>\' WHERE username = \'admin\';');
  console.log('');
  console.log('2. Asociar usuario a un juego:');
  console.log('   INSERT INTO "UserGame" (id, "userId", "gameId", notify) VALUES');
  console.log('   (gen_random_uuid(), \'<USER_ID>\', \'<GAME_ID>\', true);');
  console.log('');
  console.log('3. Configurar ADMIN_TELEGRAM_BOT_TOKEN en .env');
  console.log('');

  // Preguntar si desea configurar automáticamente
  const args = process.argv.slice(2);
  
  if (args.includes('--auto')) {
    console.log('\n🔄 Configuración automática...\n');
    
    // Asignar todos los juegos al usuario admin
    const adminUser = users.find(u => u.role === 'ADMIN');
    
    if (adminUser) {
      for (const game of games) {
        const existing = await prisma.userGame.findUnique({
          where: {
            userId_gameId: {
              userId: adminUser.id,
              gameId: game.id
            }
          }
        });

        if (!existing) {
          await prisma.userGame.create({
            data: {
              userId: adminUser.id,
              gameId: game.id,
              notify: true
            }
          });
          console.log(`  ✅ ${adminUser.username} asignado a ${game.name}`);
        } else {
          console.log(`  ⏭️  ${adminUser.username} ya está asignado a ${game.name}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
