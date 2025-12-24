import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import readline from 'readline';

const prisma = new PrismaClient();

// ⚠️ COMPLETAR ESTOS VALORES ANTES DE EJECUTAR
const META_CONFIG = {
  appId: '',        // Tu App ID de Facebook
  appSecret: '',    // Tu App Secret de Facebook
  graphApiVersion: 'v18.0'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function exchangeForLongLivedToken(shortToken) {
  try {
    console.log('  🔄 Intercambiando token...');
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: META_CONFIG.appId,
          client_secret: META_CONFIG.appSecret,
          fb_exchange_token: shortToken
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('  ❌ Error intercambiando token:', error.response?.data || error.message);
    throw error;
  }
}

async function getPageAccessTokens(userToken) {
  try {
    console.log('  📄 Obteniendo páginas...');
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/me/accounts`,
      {
        params: {
          access_token: userToken,
          fields: 'id,name,access_token,category,tasks,category_list'
        }
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('  ❌ Error obteniendo páginas:', error.response?.data || error.message);
    throw error;
  }
}

async function getInstagramAccount(pageId, pageToken) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/${pageId}`,
      {
        params: {
          fields: 'instagram_business_account{id,username,account_type}',
          access_token: pageToken
        }
      }
    );
    return response.data.instagram_business_account || null;
  } catch (error) {
    return null;
  }
}

async function verifyToken(pageId, token) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/${pageId}`,
      {
        params: {
          fields: 'id,name',
          access_token: token
        }
      }
    );
    return response.data;
  } catch (error) {
    throw new Error('Token inválido');
  }
}

async function setupMetaInstances() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 CONFIGURACIÓN DE INSTANCIAS DE FACEBOOK E INSTAGRAM');
  console.log('='.repeat(70) + '\n');
  
  // Verificar configuración
  if (!META_CONFIG.appId || !META_CONFIG.appSecret) {
    console.error('❌ ERROR: Debes configurar APP_ID y APP_SECRET en el script\n');
    console.log('📝 Pasos para obtenerlos:');
    console.log('1. Ve a https://developers.facebook.com/apps/');
    console.log('2. Crea o selecciona tu app');
    console.log('3. En Settings → Basic, copia:');
    console.log('   - App ID');
    console.log('   - App Secret (click en "Show")');
    console.log('4. Actualiza META_CONFIG en este script\n');
    process.exit(1);
  }

  console.log('✅ Configuración de app detectada');
  console.log(`   App ID: ${META_CONFIG.appId}`);
  console.log(`   Graph API: ${META_CONFIG.graphApiVersion}\n`);

  console.log('📝 PASO 1: Obtener User Access Token');
  console.log('-'.repeat(70));
  console.log('1. Ve a: https://developers.facebook.com/tools/explorer/');
  console.log('2. Selecciona tu app en el dropdown');
  console.log('3. Click en "Generate Access Token"');
  console.log('4. Selecciona los permisos:');
  console.log('   ✅ pages_show_list');
  console.log('   ✅ pages_read_engagement');
  console.log('   ✅ pages_manage_posts');
  console.log('   ✅ pages_manage_engagement');
  console.log('5. Autoriza y copia el token\n');

  const shortToken = await question('🔑 Pega tu User Access Token aquí: ');
  
  if (!shortToken.trim()) {
    console.error('\n❌ Token vacío. Abortando.\n');
    process.exit(1);
  }

  console.log('\n🔄 PASO 2: Intercambiando por token de larga duración...');
  const longLivedToken = await exchangeForLongLivedToken(shortToken.trim());
  console.log('✅ Token de larga duración obtenido (válido por 60 días)\n');

  console.log('📄 PASO 3: Obteniendo páginas de Facebook...');
  const pages = await getPageAccessTokens(longLivedToken);
  console.log(`✅ Encontradas ${pages.length} página(s)\n`);

  if (pages.length === 0) {
    console.error('❌ No se encontraron páginas. Verifica que:');
    console.error('   - Seas administrador de al menos una página');
    console.error('   - Los permisos fueron otorgados correctamente\n');
    process.exit(1);
  }

  // Mostrar páginas disponibles
  console.log('📋 Páginas disponibles:');
  console.log('-'.repeat(70));
  pages.forEach((page, index) => {
    console.log(`${index + 1}. ${page.name}`);
    console.log(`   ID: ${page.id}`);
    console.log(`   Categoría: ${page.category}`);
    console.log(`   Permisos: ${page.tasks?.join(', ') || 'N/A'}`);
    console.log('');
  });

  // Obtener juegos disponibles
  const games = await prisma.game.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });

  console.log('🎮 Juegos disponibles en el sistema:');
  console.log('-'.repeat(70));
  games.forEach((game, index) => {
    console.log(`${index + 1}. ${game.name}`);
  });
  console.log('');

  // Configurar cada página
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    console.log('\n' + '='.repeat(70));
    console.log(`📘 CONFIGURANDO PÁGINA ${i + 1}/${pages.length}: ${page.name}`);
    console.log('='.repeat(70) + '\n');

    // Verificar token
    console.log('🔍 Verificando token de página...');
    try {
      await verifyToken(page.id, page.access_token);
      console.log('✅ Token válido y permanente (no expira)\n');
    } catch (error) {
      console.error('❌ Token inválido. Saltando esta página.\n');
      continue;
    }

    // Verificar Instagram
    console.log('🔍 Buscando cuenta de Instagram vinculada...');
    const instagramAccount = await getInstagramAccount(page.id, page.access_token);
    
    if (instagramAccount) {
      console.log(`✅ Instagram encontrado: @${instagramAccount.username}`);
      console.log(`   ID: ${instagramAccount.id}`);
      console.log(`   Tipo: ${instagramAccount.account_type}\n`);
    } else {
      console.log('⚠️  No hay cuenta de Instagram vinculada a esta página\n');
    }

    // Crear instancia de Facebook
    console.log('💾 Guardando instancia de Facebook en BD...');
    
    const fbInstance = await prisma.facebookInstance.upsert({
      where: { pageId: page.id },
      create: {
        instanceId: `fb-${page.id}`,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        category: page.category || 'Unknown',
        status: 'CONNECTED',
        connectedAt: new Date(),
        isActive: true,
        config: {
          tasks: page.tasks || [],
          category_list: page.category_list || [],
          tokenType: 'permanent'
        }
      },
      update: {
        pageAccessToken: page.access_token,
        pageName: page.name,
        status: 'CONNECTED',
        connectedAt: new Date(),
        isActive: true,
        config: {
          tasks: page.tasks || [],
          category_list: page.category_list || [],
          tokenType: 'permanent'
        }
      }
    });

    console.log(`✅ Instancia de Facebook: ${fbInstance.instanceId}\n`);

    // Crear instancia de Instagram si existe
    let igInstance = null;
    if (instagramAccount) {
      console.log('💾 Guardando instancia de Instagram en BD...');
      
      igInstance = await prisma.instagramInstance.upsert({
        where: { userId: instagramAccount.id },
        create: {
          instanceId: `ig-${instagramAccount.id}`,
          userId: instagramAccount.id,
          username: instagramAccount.username,
          accessToken: page.access_token, // Mismo token que Facebook
          status: 'CONNECTED',
          connectedAt: new Date(),
          isActive: true,
          config: {
            linkedPageId: page.id,
            linkedPageName: page.name,
            accountType: instagramAccount.account_type
          }
        },
        update: {
          accessToken: page.access_token,
          username: instagramAccount.username,
          status: 'CONNECTED',
          connectedAt: new Date(),
          isActive: true,
          config: {
            linkedPageId: page.id,
            linkedPageName: page.name,
            accountType: instagramAccount.account_type
          }
        }
      });

      console.log(`✅ Instancia de Instagram: ${igInstance.instanceId}\n`);
    }

    // Preguntar a qué juegos vincular
    console.log('🎮 ¿A qué juego(s) vincular esta página?');
    const gameSelection = await question(
      `Ingresa números separados por coma (ej: 1,2) o "todos": `
    );

    let selectedGames = [];
    if (gameSelection.trim().toLowerCase() === 'todos') {
      selectedGames = games;
    } else {
      const selectedIndexes = gameSelection.split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => i >= 0 && i < games.length);
      selectedGames = selectedIndexes.map(i => games[i]);
    }

    if (selectedGames.length === 0) {
      console.log('⚠️  No se seleccionaron juegos. Saltando vinculación.\n');
      continue;
    }

    console.log(`\n📌 Vinculando a ${selectedGames.length} juego(s)...\n`);

    for (const game of selectedGames) {
      // Canal de Facebook
      const fbChannel = await prisma.gameChannel.upsert({
        where: {
          gameId_channelType: {
            gameId: game.id,
            channelType: 'FACEBOOK'
          }
        },
        create: {
          gameId: game.id,
          channelType: 'FACEBOOK',
          name: `Facebook - ${page.name}`,
          facebookInstanceId: fbInstance.id,
          isActive: true,
          messageTemplate: `🎰 *${game.name}* - Sorteo {{drawTime}}\n\n🎯 Ganador: *{{winnerNumberPadded}}* - {{winnerName}}\n\n📅 {{drawDate}}\n\n¡Felicidades a todos los ganadores! 🎉`,
          recipients: []
        },
        update: {
          facebookInstanceId: fbInstance.id,
          name: `Facebook - ${page.name}`,
          isActive: true
        }
      });

      console.log(`  ✅ Canal de Facebook creado para "${game.name}"`);

      // Canal de Instagram (si existe)
      if (igInstance) {
        const igChannel = await prisma.gameChannel.upsert({
          where: {
            gameId_channelType: {
              gameId: game.id,
              channelType: 'INSTAGRAM'
            }
          },
          create: {
            gameId: game.id,
            channelType: 'INSTAGRAM',
            name: `Instagram - ${page.name}`,
            instagramInstanceId: igInstance.id,
            isActive: true,
            messageTemplate: `🎰 ${game.name} - Sorteo {{drawTime}}\n\n🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}\n\n📅 {{drawDate}}\n\n#loteria #sorteo #ganador #${game.name.toLowerCase().replace(/\s+/g, '')}`,
            recipients: []
          },
          update: {
            instagramInstanceId: igInstance.id,
            name: `Instagram - ${page.name}`,
            isActive: true
          }
        });

        console.log(`  ✅ Canal de Instagram creado para "${game.name}"`);
      }
    }

    console.log('');
  }

  // Resumen final
  console.log('\n' + '='.repeat(70));
  console.log('✅ ¡CONFIGURACIÓN COMPLETADA EXITOSAMENTE!');
  console.log('='.repeat(70) + '\n');
  
  const fbCount = await prisma.facebookInstance.count({ 
    where: { status: 'CONNECTED', isActive: true } 
  });
  const igCount = await prisma.instagramInstance.count({ 
    where: { status: 'CONNECTED', isActive: true } 
  });
  const fbChannelCount = await prisma.gameChannel.count({ 
    where: { channelType: 'FACEBOOK', isActive: true } 
  });
  const igChannelCount = await prisma.gameChannel.count({ 
    where: { channelType: 'INSTAGRAM', isActive: true } 
  });

  console.log('📊 Resumen de configuración:');
  console.log(`   📘 Instancias de Facebook: ${fbCount}`);
  console.log(`   📸 Instancias de Instagram: ${igCount}`);
  console.log(`   📡 Canales de Facebook: ${fbChannelCount}`);
  console.log(`   📡 Canales de Instagram: ${igChannelCount}`);
  console.log('');

  console.log('🎯 Próximos pasos:');
  console.log('   1. Verifica los tokens: node src/scripts/verify-meta-tokens.js');
  console.log('   2. Prueba publicación desde el admin');
  console.log('   3. Los tokens NO expiran (permanentes)');
  console.log('');
}

// Ejecutar
setupMetaInstances()
  .then(() => {
    rl.close();
    prisma.$disconnect();
    console.log('✅ Script finalizado\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error.message);
    console.error(error);
    rl.close();
    prisma.$disconnect();
    process.exit(1);
  });
