import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tokens permanentes obtenidos del script anterior
const META_INSTANCES = {
  lotoanimalito: {
    facebook: {
      pageId: '137321016700627',
      pageName: 'Lotoanimalito',
      token: 'EAAKG0vizxFUBQcZBstj3ligBZBuGhECF7aKAYw4ZAW6hKGV9ydsPagXZADXYoNanLUDlrNSk1fqdquFKHK0vbNfda0iROieZBRynkiOxARXLfOTSxay4dzWiUpVIcoGhYAzWZALA5EpGeIIQpc2XHenhTJRucapN14NQ1b0fWdkbZASKpZAL1CZCFyILRWlH5qekXnhYaYAxOKsL4ThZAgbEIF',
      category: 'Board Game'
    },
    instagram: {
      userId: '17841403596605091',
      username: 'lotoanimalito',
      token: 'EAAKG0vizxFUBQcZBstj3ligBZBuGhECF7aKAYw4ZAW6hKGV9ydsPagXZADXYoNanLUDlrNSk1fqdquFKHK0vbNfda0iROieZBRynkiOxARXLfOTSxay4dzWiUpVIcoGhYAzWZALA5EpGeIIQpc2XHenhTJRucapN14NQ1b0fWdkbZASKpZAL1CZCFyILRWlH5qekXnhYaYAxOKsL4ThZAgbEIF'
    }
  },
  lottoPantera: {
    facebook: {
      pageId: '116187448076947',
      pageName: 'Lotto pantera',
      token: 'EAAKG0vizxFUBQd6N4qwad2FADM50Or7C5fZCzlKZC9LJ2ZAyBGzZADmnuKaWCF14PoLPwNU57ZA4ozszsGskv36IQPZAtEFO70z8RZCBxqf0BjKf1nfOxrjcS5TahZBGJC5OM9yFQXWJVXLS472iRUZCL2cNcvk2uE7KSWNDtHRFe31E9nh7ZCOJ0OffV4UUittKZCAkTOc8Vi4q4cC2hi6nw3ZC',
      category: 'Gamer'
    },
    instagram: {
      userId: '17841458238569617',
      username: 'lottopantera',
      token: 'EAAKG0vizxFUBQd6N4qwad2FADM50Or7C5fZCzlKZC9LJ2ZAyBGzZADmnuKaWCF14PoLPwNU57ZA4ozszsGskv36IQPZAtEFO70z8RZCBxqf0BjKf1nfOxrjcS5TahZBGJC5OM9yFQXWJVXLS472iRUZCL2cNcvk2uE7KSWNDtHRFe31E9nh7ZCOJ0OffV4UUittKZCAkTOc8Vi4q4cC2hi6nw3ZC'
    }
  }
};

async function seedMetaChannels() {
  console.log('\n' + '='.repeat(70));
  console.log('🌱 SEMILLA: CONFIGURACIÓN DE CANALES DE META');
  console.log('='.repeat(70) + '\n');

  try {
    // Paso 1: Crear instancias de Facebook
    console.log('📘 Paso 1: Creando instancias de Facebook...\n');

    const fbLotoanimalito = await prisma.facebookInstance.upsert({
      where: { instanceId: `fb-${META_INSTANCES.lotoanimalito.facebook.pageId}` },
      create: {
        instanceId: `fb-${META_INSTANCES.lotoanimalito.facebook.pageId}`,
        name: META_INSTANCES.lotoanimalito.facebook.pageName,
        pageId: META_INSTANCES.lotoanimalito.facebook.pageId,
        pageName: META_INSTANCES.lotoanimalito.facebook.pageName,
        pageAccessToken: META_INSTANCES.lotoanimalito.facebook.token,
        appSecret: '121113b6b3d697481e5d042158d7c645',
        webhookToken: 'tote_webhook_verify_token',
        status: 'CONNECTED',
        isActive: true,
        connectedAt: new Date(),
        config: {
          tokenType: 'permanent',
          category: META_INSTANCES.lotoanimalito.facebook.category,
          tasks: ['ADVERTISE', 'ANALYZE', 'CREATE_CONTENT', 'MESSAGING', 'MODERATE', 'MANAGE']
        }
      },
      update: {
        pageAccessToken: META_INSTANCES.lotoanimalito.facebook.token,
        status: 'CONNECTED',
        connectedAt: new Date()
      }
    });
    console.log(`✅ Facebook: ${fbLotoanimalito.pageName} (${fbLotoanimalito.instanceId})`);

    const fbLottoPantera = await prisma.facebookInstance.upsert({
      where: { instanceId: `fb-${META_INSTANCES.lottoPantera.facebook.pageId}` },
      create: {
        instanceId: `fb-${META_INSTANCES.lottoPantera.facebook.pageId}`,
        name: META_INSTANCES.lottoPantera.facebook.pageName,
        pageId: META_INSTANCES.lottoPantera.facebook.pageId,
        pageName: META_INSTANCES.lottoPantera.facebook.pageName,
        pageAccessToken: META_INSTANCES.lottoPantera.facebook.token,
        appSecret: '121113b6b3d697481e5d042158d7c645',
        webhookToken: 'tote_webhook_verify_token',
        status: 'CONNECTED',
        isActive: true,
        connectedAt: new Date(),
        config: {
          tokenType: 'permanent',
          category: META_INSTANCES.lottoPantera.facebook.category,
          tasks: ['ADVERTISE', 'ANALYZE', 'CREATE_CONTENT', 'MESSAGING', 'MODERATE', 'MANAGE']
        }
      },
      update: {
        pageAccessToken: META_INSTANCES.lottoPantera.facebook.token,
        status: 'CONNECTED',
        connectedAt: new Date()
      }
    });
    console.log(`✅ Facebook: ${fbLottoPantera.pageName} (${fbLottoPantera.instanceId})`);

    // Paso 2: Crear instancias de Instagram
    console.log('\n📸 Paso 2: Creando instancias de Instagram...\n');

    const igLotoanimalito = await prisma.instagramInstance.upsert({
      where: { instanceId: `ig-${META_INSTANCES.lotoanimalito.instagram.userId}` },
      create: {
        instanceId: `ig-${META_INSTANCES.lotoanimalito.instagram.userId}`,
        name: `Instagram - ${META_INSTANCES.lotoanimalito.instagram.username}`,
        appId: '711190627206229',
        appSecret: '121113b6b3d697481e5d042158d7c645',
        userId: META_INSTANCES.lotoanimalito.instagram.userId,
        username: META_INSTANCES.lotoanimalito.instagram.username,
        accessToken: META_INSTANCES.lotoanimalito.instagram.token,
        status: 'CONNECTED',
        isActive: true,
        connectedAt: new Date(),
        config: {
          linkedPageId: META_INSTANCES.lotoanimalito.facebook.pageId,
          linkedPageName: META_INSTANCES.lotoanimalito.facebook.pageName
        }
      },
      update: {
        accessToken: META_INSTANCES.lotoanimalito.instagram.token,
        status: 'CONNECTED',
        connectedAt: new Date()
      }
    });
    console.log(`✅ Instagram: @${igLotoanimalito.username} (${igLotoanimalito.instanceId})`);

    const igLottoPantera = await prisma.instagramInstance.upsert({
      where: { instanceId: `ig-${META_INSTANCES.lottoPantera.instagram.userId}` },
      create: {
        instanceId: `ig-${META_INSTANCES.lottoPantera.instagram.userId}`,
        name: `Instagram - ${META_INSTANCES.lottoPantera.instagram.username}`,
        appId: '711190627206229',
        appSecret: '121113b6b3d697481e5d042158d7c645',
        userId: META_INSTANCES.lottoPantera.instagram.userId,
        username: META_INSTANCES.lottoPantera.instagram.username,
        accessToken: META_INSTANCES.lottoPantera.instagram.token,
        status: 'CONNECTED',
        isActive: true,
        connectedAt: new Date(),
        config: {
          linkedPageId: META_INSTANCES.lottoPantera.facebook.pageId,
          linkedPageName: META_INSTANCES.lottoPantera.facebook.pageName
        }
      },
      update: {
        accessToken: META_INSTANCES.lottoPantera.instagram.token,
        status: 'CONNECTED',
        connectedAt: new Date()
      }
    });
    console.log(`✅ Instagram: @${igLottoPantera.username} (${igLottoPantera.instanceId})`);

    // Paso 3: Obtener juegos
    console.log('\n🎮 Paso 3: Buscando juegos...\n');

    const lotoanimalito = await prisma.game.findFirst({
      where: { name: { contains: 'Lotoanimalito', mode: 'insensitive' } }
    });

    const lotoPantera = await prisma.game.findFirst({
      where: { name: { contains: 'Loto Pantera', mode: 'insensitive' } }
    });

    const triplePantera = await prisma.game.findFirst({
      where: { name: { contains: 'Triple Pantera', mode: 'insensitive' } }
    });

    if (!lotoanimalito) {
      console.log('⚠️  Juego "Lotoanimalito" no encontrado');
    } else {
      console.log(`✅ Encontrado: ${lotoanimalito.name} (${lotoanimalito.id})`);
    }

    if (!lotoPantera) {
      console.log('⚠️  Juego "Loto Pantera" no encontrado');
    } else {
      console.log(`✅ Encontrado: ${lotoPantera.name} (${lotoPantera.id})`);
    }

    if (!triplePantera) {
      console.log('⚠️  Juego "Triple Pantera" no encontrado');
    } else {
      console.log(`✅ Encontrado: ${triplePantera.name} (${triplePantera.id})`);
    }

    // Paso 4: Configurar canales para Lotoanimalito
    if (lotoanimalito) {
      console.log(`\n📡 Paso 4a: Configurando canales para ${lotoanimalito.name}...\n`);

      // Canal de Facebook
      const fbChannelLoto = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: lotoanimalito.id,
            channelType: 'FACEBOOK',
            name: `Facebook - ${META_INSTANCES.lotoanimalito.facebook.pageName}`
          }
        },
        create: {
          gameId: lotoanimalito.id,
          channelType: 'FACEBOOK',
          name: `Facebook - ${META_INSTANCES.lotoanimalito.facebook.pageName}`,
          facebookInstanceId: fbLotoanimalito.id,
          isActive: true,
          messageTemplate: `🎰 *LOTOANIMALITO* - Sorteo {{drawTime}}

🎯 Número Ganador: *{{winnerNumberPadded}}* - {{winnerName}}

📅 {{drawDate}}

¡Felicidades a todos los ganadores! 🎉`,
          recipients: []
        },
        update: {
          facebookInstanceId: fbLotoanimalito.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Facebook creado: ${fbChannelLoto.name}`);

      // Canal de Instagram
      const igChannelLoto = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: lotoanimalito.id,
            channelType: 'INSTAGRAM',
            name: `Instagram - @${META_INSTANCES.lotoanimalito.instagram.username}`
          }
        },
        create: {
          gameId: lotoanimalito.id,
          channelType: 'INSTAGRAM',
          name: `Instagram - @${META_INSTANCES.lotoanimalito.instagram.username}`,
          instagramInstanceId: igLotoanimalito.id,
          isActive: true,
          messageTemplate: `🎰 LOTOANIMALITO - Sorteo {{drawTime}}

🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}

📅 {{drawDate}}

#lotoanimalito #loteria #sorteo #ganador #venezuela`,
          recipients: []
        },
        update: {
          instagramInstanceId: igLotoanimalito.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Instagram creado: ${igChannelLoto.name}`);
    }

    // Paso 5: Configurar canales para Loto Pantera
    if (lotoPantera) {
      console.log(`\n📡 Paso 4b: Configurando canales para ${lotoPantera.name}...\n`);

      // Canal de Facebook
      const fbChannelPantera = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: lotoPantera.id,
            channelType: 'FACEBOOK',
            name: `Facebook - ${META_INSTANCES.lottoPantera.facebook.pageName}`
          }
        },
        create: {
          gameId: lotoPantera.id,
          channelType: 'FACEBOOK',
          name: `Facebook - ${META_INSTANCES.lottoPantera.facebook.pageName}`,
          facebookInstanceId: fbLottoPantera.id,
          isActive: true,
          messageTemplate: `🐆 *LOTO PANTERA* - Sorteo {{drawTime}}

🎯 Número Ganador: *{{winnerNumberPadded}}* - {{winnerName}}

📅 {{drawDate}}

¡Suerte en los próximos sorteos! 🍀`,
          recipients: []
        },
        update: {
          facebookInstanceId: fbLottoPantera.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Facebook creado: ${fbChannelPantera.name}`);

      // Canal de Instagram
      const igChannelPantera = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: lotoPantera.id,
            channelType: 'INSTAGRAM',
            name: `Instagram - @${META_INSTANCES.lottoPantera.instagram.username}`
          }
        },
        create: {
          gameId: lotoPantera.id,
          channelType: 'INSTAGRAM',
          name: `Instagram - @${META_INSTANCES.lottoPantera.instagram.username}`,
          instagramInstanceId: igLottoPantera.id,
          isActive: true,
          messageTemplate: `🐆 LOTO PANTERA - Sorteo {{drawTime}}

🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}

📅 {{drawDate}}

#lotopantera #loteria #sorteo #ganador #venezuela`,
          recipients: []
        },
        update: {
          instagramInstanceId: igLottoPantera.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Instagram creado: ${igChannelPantera.name}`);
    }

    // Paso 6: Configurar canales para Triple Pantera
    if (triplePantera) {
      console.log(`\n📡 Paso 4c: Configurando canales para ${triplePantera.name}...\n`);

      // Canal de Facebook (usa la misma página que Loto Pantera)
      const fbChannelTriple = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: triplePantera.id,
            channelType: 'FACEBOOK',
            name: `Facebook - ${META_INSTANCES.lottoPantera.facebook.pageName}`
          }
        },
        create: {
          gameId: triplePantera.id,
          channelType: 'FACEBOOK',
          name: `Facebook - ${META_INSTANCES.lottoPantera.facebook.pageName}`,
          facebookInstanceId: fbLottoPantera.id,
          isActive: true,
          messageTemplate: `🐆🐆🐆 *TRIPLE PANTERA* - Sorteo {{drawTime}}

🎯 Número Ganador: *{{winnerNumberPadded}}* - {{winnerName}}

📅 {{drawDate}}

¡Felicidades a los ganadores! 🎊`,
          recipients: []
        },
        update: {
          facebookInstanceId: fbLottoPantera.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Facebook creado: ${fbChannelTriple.name}`);

      // Canal de Instagram (usa la misma cuenta que Loto Pantera)
      const igChannelTriple = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType_name: {
            gameId: triplePantera.id,
            channelType: 'INSTAGRAM',
            name: `Instagram - @${META_INSTANCES.lottoPantera.instagram.username}`
          }
        },
        create: {
          gameId: triplePantera.id,
          channelType: 'INSTAGRAM',
          name: `Instagram - @${META_INSTANCES.lottoPantera.instagram.username}`,
          instagramInstanceId: igLottoPantera.id,
          isActive: true,
          messageTemplate: `🐆🐆🐆 TRIPLE PANTERA - Sorteo {{drawTime}}

🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}

📅 {{drawDate}}

#triplepantera #loteria #sorteo #ganador #venezuela`,
          recipients: []
        },
        update: {
          instagramInstanceId: igLottoPantera.id,
          isActive: true
        }
      });
      console.log(`  ✅ Canal Instagram creado: ${igChannelTriple.name}`);
    }

    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('✅ SEMILLA COMPLETADA EXITOSAMENTE');
    console.log('='.repeat(70) + '\n');

    const fbCount = await prisma.facebookInstance.count({ where: { isActive: true } });
    const igCount = await prisma.instagramInstance.count({ where: { isActive: true } });
    const channelCount = await prisma.gameChannel.count({ 
      where: { 
        isActive: true,
        channelType: { in: ['FACEBOOK', 'INSTAGRAM'] }
      } 
    });

    console.log('📊 Resumen:');
    console.log(`   📘 Instancias de Facebook: ${fbCount}`);
    console.log(`   📸 Instancias de Instagram: ${igCount}`);
    console.log(`   📡 Canales activos: ${channelCount}`);
    console.log('');

    console.log('🎯 Configuración de canales:');
    console.log('   ✅ Lotoanimalito → Facebook + Instagram');
    console.log('   ✅ Loto Pantera → Facebook + Instagram');
    console.log('   ✅ Triple Pantera → Facebook + Instagram (comparte con Loto Pantera)');
    console.log('');

    console.log('🔐 Tokens:');
    console.log('   ✅ Todos los tokens son PERMANENTES (no expiran)');
    console.log('');

    console.log('🚀 Próximos pasos:');
    console.log('   1. Verifica: node src/scripts/verify-meta-tokens.js');
    console.log('   2. Prueba publicación desde el admin');
    console.log('   3. Los sorteos se publicarán automáticamente');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
seedMetaChannels()
  .then(() => {
    console.log('✅ Script de semilla finalizado\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  });
