import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedLottopanteraChannels() {
  try {
    console.log('\n🌱 SEMILLA: Configurando canales para LOTTOPANTERA\n');
    console.log('='.repeat(70) + '\n');

    // Buscar el juego LOTTOPANTERA
    const lottopanteraGame = await prisma.game.findFirst({
      where: { slug: 'lottopantera' }
    });

    if (!lottopanteraGame) {
      console.log('❌ Juego LOTTOPANTERA no encontrado');
      return;
    }

    console.log(`✅ Juego encontrado: ${lottopanteraGame.name} (${lottopanteraGame.id})\n`);

    // Verificar si ya tiene canales
    const existingChannels = await prisma.gameChannel.findMany({
      where: { gameId: lottopanteraGame.id }
    });

    if (existingChannels.length > 0) {
      console.log('⚠️  El juego ya tiene canales configurados:');
      existingChannels.forEach(ch => {
        console.log(`   - ${ch.channelType}: ${ch.name} (${ch.isActive ? 'ACTIVO' : 'INACTIVO'})`);
      });
      console.log('\n¿Deseas continuar? Los canales existentes se mantendrán.\n');
    }

    // Plantilla por defecto para mensajes
    const defaultTemplate = `🎰 {{gameName}}

⏰ Hora: {{time}}
🎯 Resultado: {{winnerNumberPadded}}
🏆 {{winnerName}}

✨ ¡Buena suerte en el próximo sorteo!`;

    // Crear canal de Facebook para LOTTOPANTERA
    console.log('📘 Creando canal de Facebook...');
    const facebookChannel = await prisma.gameChannel.upsert({
      where: {
        gameId_channelType_name: {
          gameId: lottopanteraGame.id,
          channelType: 'FACEBOOK',
          name: 'Facebook - Lotto pantera'
        }
      },
      create: {
        gameId: lottopanteraGame.id,
        name: 'Facebook - Lotto pantera',
        channelType: 'FACEBOOK',
        isActive: true,
        facebookInstanceId: 'fb-116187448076947',
        messageTemplate: defaultTemplate
      },
      update: {
        isActive: true,
        facebookInstanceId: 'fb-116187448076947',
        messageTemplate: defaultTemplate
      }
    });
    console.log(`   ✅ Canal Facebook creado/actualizado: ${facebookChannel.name}\n`);

    // Crear canal de Instagram para LOTTOPANTERA
    console.log('📱 Creando canal de Instagram...');
    const instagramChannel = await prisma.gameChannel.upsert({
      where: {
        gameId_channelType_name: {
          gameId: lottopanteraGame.id,
          channelType: 'INSTAGRAM',
          name: 'Instagram - @lottopantera'
        }
      },
      create: {
        gameId: lottopanteraGame.id,
        name: 'Instagram - @lottopantera',
        channelType: 'INSTAGRAM',
        isActive: true,
        instagramInstanceId: 'ig-17841458238569617',
        messageTemplate: defaultTemplate
      },
      update: {
        isActive: true,
        instagramInstanceId: 'ig-17841458238569617',
        messageTemplate: defaultTemplate
      }
    });
    console.log(`   ✅ Canal Instagram creado/actualizado: ${instagramChannel.name}\n`);

    // Verificar configuración final
    console.log('='.repeat(70));
    console.log('📊 VERIFICACIÓN FINAL\n');
    console.log('='.repeat(70) + '\n');

    const allChannels = await prisma.gameChannel.findMany({
      where: { gameId: lottopanteraGame.id },
      select: {
        name: true,
        channelType: true,
        isActive: true,
        facebookInstanceId: true,
        instagramInstanceId: true
      }
    });

    console.log(`📢 Canales configurados para ${lottopanteraGame.name}:\n`);
    allChannels.forEach(ch => {
      const status = ch.isActive ? '✅ ACTIVO' : '❌ INACTIVO';
      console.log(`   ${status} - ${ch.channelType}: ${ch.name}`);
      if (ch.facebookInstanceId) console.log(`      Instance: ${ch.facebookInstanceId}`);
      if (ch.instagramInstanceId) console.log(`      Instance: ${ch.instagramInstanceId}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('✅ SEMILLA COMPLETADA\n');
    console.log('💡 Ahora LOTTOPANTERA publicará automáticamente en:');
    console.log('   - Facebook: Lotto pantera (fb-116187448076947)');
    console.log('   - Instagram: @lottopantera (ig-17841458238569617)\n');
    console.log('🔄 Estos son los mismos canales que usa TRIPLE PANTERA\n');

  } catch (error) {
    console.error('❌ Error en la semilla:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedLottopanteraChannels();
