import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const FACEBOOK_PAGES = [
  {
    pageId: '137321016700627',
    pageName: 'Lotoanimalito',
    accessToken: 'EAAKG0vizxFUBOZCH3XQYBWyEw5DgxPncUZBdVJRKEKcYrxPqcVoJJAObUVloStmgNDLXedV8n46kNYZCzzZAKb6tdhfmhctB3FxCSiViHCeCa0jhior4r0Uo4cRl8BXxfzgNHAfRi9ByMdQs4ZBSmDopxUVwL6LmalYhoaWnXyRfrWRZCNV1kF7O4ydl0xhlRZAMZCNeXZCDRJ1DyzVd9sqh5OgZDZD',
    category: 'Board Game',
    gameName: 'LOTOANIMALITO'
  },
  {
    pageId: '116187448076947',
    pageName: 'Lotto pantera',
    accessToken: 'EAAKG0vizxFUBO2KvgjI3TAaXrOYky7IVIOSMkgB9aZAnlrFrAPRbK9s1NOuOgqCVAYxs52BVR6CQmVSaGnYOgf2v5PC9xgTZBCnp92uzFdFr3gOi95XchopqUeGEkb0ZB9BWLceHGIgpGQ5KZAaJayZCZCdvn1qqOeaJG4baTjgJ4HigyNJjcaFSy3YztNU7gv068PXwnPXYxr93ZCeGZCSNugZDZD',
    category: 'Gamer',
    gameNames: ['TRIPLE PANTERA', 'LOTO PANTERA'] // Ambos juegos comparten la misma página
  }
];

async function importFacebookTokens() {
  console.log('🚀 Iniciando importación de tokens de Facebook...\n');

  for (const page of FACEBOOK_PAGES) {
    console.log(`📄 Procesando página: ${page.pageName} (${page.pageId})`);

    try {
      // Verificar si ya existe
      const existing = await prisma.facebookInstance.findFirst({
        where: { pageId: page.pageId }
      });

      let fbInstance;

      if (existing) {
        console.log(`  ⚠️  Ya existe, actualizando token...`);
        fbInstance = await prisma.facebookInstance.update({
          where: { id: existing.id },
          data: {
            pageAccessToken: page.accessToken,
            pageName: page.pageName,
            category: page.category,
            status: 'CONNECTED',
            updatedAt: new Date()
          }
        });
      } else {
        console.log(`  ✅ Creando nueva instancia...`);
        fbInstance = await prisma.facebookInstance.create({
          data: {
            pageId: page.pageId,
            pageName: page.pageName,
            pageAccessToken: page.accessToken,
            category: page.category,
            status: 'CONNECTED'
          }
        });
      }

      console.log(`  📌 Instance ID: ${fbInstance.id}`);

      // Obtener juegos para vincular
      const gameNames = page.gameNames || [page.gameName];

      for (const gameName of gameNames) {
        const games = await prisma.game.findMany({
          where: {
            name: {
              contains: gameName,
              mode: 'insensitive'
            }
          }
        });

        console.log(`  🎮 Encontrados ${games.length} juego(s) para "${gameName}"`);

        // Para cada juego, crear o actualizar GameChannel
        for (const game of games) {
          // Verificar si ya existe un canal de Facebook para este juego
          const existingChannel = await prisma.gameChannel.findFirst({
            where: {
              gameId: game.id,
              channelType: 'FACEBOOK',
              facebookInstanceId: fbInstance.id
            }
          });

          if (existingChannel) {
            console.log(`     ⚠️  Canal ya existe para juego ${game.name}, actualizando...`);
            await prisma.gameChannel.update({
              where: { id: existingChannel.id },
              data: {
                isActive: true,
                messageTemplate: `🎰 Resultado del sorteo {{gameName}} - {{drawTime}}\n\n🎯 Ganador: {{winnerNumber}} - {{winnerName}}\n\n¡Felicidades a los ganadores!`,
                updatedAt: new Date()
              }
            });
          } else {
            console.log(`     ✅ Creando canal para juego ${game.name}`);
            await prisma.gameChannel.create({
              data: {
                gameId: game.id,
                channelType: 'FACEBOOK',
                name: `Facebook - ${page.pageName}`,
                facebookInstanceId: fbInstance.id,
                isActive: true,
                messageTemplate: `🎰 Resultado del sorteo {{gameName}} - {{drawTime}}\n\n🎯 Ganador: {{winnerNumber}} - {{winnerName}}\n\n¡Felicidades a los ganadores!`
              }
            });
          }
        }
      }

      console.log('');
    } catch (error) {
      console.error(`  ❌ Error procesando ${page.pageName}:`, error.message);
      console.error(error);
    }
  }

  console.log('✅ Importación completada!\n');

  // Mostrar resumen
  const totalInstances = await prisma.facebookInstance.count();
  const totalChannels = await prisma.gameChannel.count({
    where: { channelType: 'FACEBOOK' }
  });

  console.log('📊 Resumen:');
  console.log(`   - Instancias de Facebook: ${totalInstances}`);
  console.log(`   - Canales de Facebook configurados: ${totalChannels}`);
}

// Ejecutar
importFacebookTokens()
  .then(() => {
    console.log('\n🎉 Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en el script:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
