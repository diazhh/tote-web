import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import readline from 'readline';

const prisma = new PrismaClient();

const META_CONFIG = {
  appId: '711190627206229',
  appSecret: '121113b6b3d697481e5d042158d7c645',
  graphApiVersion: 'v18.0'
};

// Función para pedir input del usuario
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function regenerateAndSaveTokens() {
  console.log('\n' + '='.repeat(70));
  console.log('🔐 REGENERADOR DE TOKENS PERMANENTES DE META');
  console.log('='.repeat(70) + '\n');

  console.log('📋 Instrucciones:');
  console.log('1. Ve a: https://developers.facebook.com/tools/explorer/');
  console.log('2. Selecciona tu app: "Tote" (711190627206229)');
  console.log('3. Haz clic en "Generate Access Token"');
  console.log('4. Acepta los permisos solicitados');
  console.log('5. Copia el token generado\n');

  const shortToken = await askQuestion('🔑 Pega el token corto aquí: ');

  if (!shortToken || shortToken.trim().length < 50) {
    console.error('❌ Token inválido. Debe ser un token largo de Facebook.\n');
    process.exit(1);
  }

  try {
    // Paso 1: Intercambiar por token de larga duración
    console.log('\n🔄 Paso 1: Intercambiando token corto por token de larga duración...');
    const longTokenResponse = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: META_CONFIG.appId,
          client_secret: META_CONFIG.appSecret,
          fb_exchange_token: shortToken.trim()
        }
      }
    );

    const longLivedToken = longTokenResponse.data.access_token;
    console.log('✅ Token de larga duración obtenido\n');

    // Paso 2: Obtener páginas y sus tokens permanentes
    console.log('📄 Paso 2: Obteniendo páginas y tokens permanentes...');
    const pagesResponse = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/me/accounts`,
      {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,access_token,category,tasks,category_list,instagram_business_account{id,username}'
        }
      }
    );

    const pages = pagesResponse.data.data;
    console.log(`✅ Encontradas ${pages.length} página(s)\n`);

    if (pages.length === 0) {
      console.error('❌ No se encontraron páginas. Verifica que tu usuario tenga acceso a páginas de Facebook.\n');
      process.exit(1);
    }

    // Paso 3: Guardar en base de datos
    console.log('='.repeat(70));
    console.log('💾 GUARDANDO TOKENS EN BASE DE DATOS (TEXTO PLANO)');
    console.log('='.repeat(70) + '\n');

    const results = {
      facebook: { updated: 0, created: 0, errors: 0 },
      instagram: { updated: 0, created: 0, errors: 0 }
    };

    for (const page of pages) {
      console.log(`\n📘 Procesando: ${page.name}`);
      console.log('   ' + '-'.repeat(66));

      // Guardar instancia de Facebook
      try {
        const fbInstanceId = `fb-${page.id}`;
        
        const existingFb = await prisma.facebookInstance.findUnique({
          where: { instanceId: fbInstanceId }
        });

        if (existingFb) {
          await prisma.facebookInstance.update({
            where: { instanceId: fbInstanceId },
            data: {
              pageAccessToken: page.access_token, // TEXTO PLANO
              appSecret: META_CONFIG.appSecret,    // TEXTO PLANO
              webhookToken: 'tote_webhook_2024',
              status: 'CONNECTED',
              connectedAt: new Date(),
              config: {
                tasks: page.tasks || [],
                tokenType: 'permanent',
                category: page.category
              }
            }
          });
          console.log(`   ✅ Facebook actualizado: ${fbInstanceId}`);
          results.facebook.updated++;
        } else {
          await prisma.facebookInstance.create({
            data: {
              instanceId: fbInstanceId,
              name: page.name,
              pageAccessToken: page.access_token, // TEXTO PLANO
              appSecret: META_CONFIG.appSecret,    // TEXTO PLANO
              webhookToken: 'tote_webhook_2024',
              pageId: page.id,
              pageName: page.name,
              status: 'CONNECTED',
              connectedAt: new Date(),
              config: {
                tasks: page.tasks || [],
                tokenType: 'permanent',
                category: page.category
              }
            }
          });
          console.log(`   ✅ Facebook creado: ${fbInstanceId}`);
          results.facebook.created++;
        }
      } catch (error) {
        console.error(`   ❌ Error en Facebook: ${error.message}`);
        results.facebook.errors++;
      }

      // Guardar instancia de Instagram si existe
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        console.log(`   📱 Instagram: @${ig.username}`);

        try {
          const igInstanceId = `ig-${ig.id}`;
          
          const existingIg = await prisma.instagramInstance.findUnique({
            where: { instanceId: igInstanceId }
          });

          if (existingIg) {
            await prisma.instagramInstance.update({
              where: { instanceId: igInstanceId },
              data: {
                accessToken: page.access_token, // TEXTO PLANO - usa el token de la página
                status: 'CONNECTED',
                connectedAt: new Date(),
                config: {
                  linkedPageId: page.id,
                  linkedPageName: page.name,
                  tokenType: 'permanent'
                }
              }
            });
            console.log(`   ✅ Instagram actualizado: ${igInstanceId}`);
            results.instagram.updated++;
          } else {
            await prisma.instagramInstance.create({
              data: {
                instanceId: igInstanceId,
                name: `Instagram - ${ig.username}`,
                appId: META_CONFIG.appId,
                appSecret: META_CONFIG.appSecret, // TEXTO PLANO
                accessToken: page.access_token,   // TEXTO PLANO
                userId: ig.id,
                username: ig.username,
                status: 'CONNECTED',
                connectedAt: new Date(),
                config: {
                  linkedPageId: page.id,
                  linkedPageName: page.name,
                  tokenType: 'permanent'
                }
              }
            });
            console.log(`   ✅ Instagram creado: ${igInstanceId}`);
            results.instagram.created++;
          }
        } catch (error) {
          console.error(`   ❌ Error en Instagram: ${error.message}`);
          results.instagram.errors++;
        }
      }
    }

    // Resumen
    console.log('\n' + '='.repeat(70));
    console.log('✅ PROCESO COMPLETADO');
    console.log('='.repeat(70) + '\n');

    console.log('📊 Resumen:');
    console.log(`   Facebook:`);
    console.log(`     - Actualizadas: ${results.facebook.updated}`);
    console.log(`     - Creadas: ${results.facebook.created}`);
    console.log(`     - Errores: ${results.facebook.errors}`);
    console.log(`   Instagram:`);
    console.log(`     - Actualizadas: ${results.instagram.updated}`);
    console.log(`     - Creadas: ${results.instagram.created}`);
    console.log(`     - Errores: ${results.instagram.errors}`);
    console.log('');

    console.log('💡 Nota importante:');
    console.log('   ✅ Los tokens se guardaron en TEXTO PLANO (sin encriptación)');
    console.log('   ✅ Los Page Access Tokens son PERMANENTES');
    console.log('   ✅ No expiran mientras la app de Facebook exista');
    console.log('');

    console.log('🧪 Próximo paso:');
    console.log('   Ejecuta: node test-game-channel-publish.js');
    console.log('   Para probar la publicación con los nuevos tokens\n');

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('\nDetalles del error:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.response?.status === 400) {
      console.error('\n💡 Posibles causas:');
      console.error('   - El token corto ya expiró (expiran en 1-2 horas)');
      console.error('   - El token no tiene los permisos necesarios');
      console.error('   - Genera un nuevo token en Facebook Developers\n');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
regenerateAndSaveTokens()
  .then(() => {
    console.log('✅ Script finalizado exitosamente\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  });
