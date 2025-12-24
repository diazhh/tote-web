import axios from 'axios';

const META_CONFIG = {
  appId: '711190627206229',
  appSecret: '121113b6b3d697481e5d042158d7c645',
  graphApiVersion: 'v18.0'
};

// Token corto proporcionado
const SHORT_TOKEN = 'EAAKG0vizxFUBQS08xNfyS7TT2mdMg9JcoeSqZCYMtxWZCpD1PWyIHD0lFntf60ZBg1XFZA20WdabB5ro84X78hZAe7JAJmXiuVHLeNEwZBO4GYAV7bxufQ80mzwyqWIKG9ZBlCjdIOpdMzk7puODzz5NBpbk4h5FlEUMWGB0lYZBG1zZBbbdJ8ZCkOIfrnxOs6SeRjgqnk0LOkTQgMXyG8yJi60AhzZCjR1Nh5QFEynOZCcJTr0XnL9BwXfVwEMBngOQYjugZBKZAcU6s9XY2ZBVlWLLRIFulx7PzjqK7pZBIUIZD';

async function generatePermanentTokens() {
  console.log('\n' + '='.repeat(70));
  console.log('🔐 GENERADOR DE TOKENS PERMANENTES DE META');
  console.log('='.repeat(70) + '\n');

  // Verificar configuración
  if (!META_CONFIG.appId || !META_CONFIG.appSecret) {
    console.error('❌ ERROR: Debes configurar APP_ID y APP_SECRET en el script\n');
    console.log('Obtén estos valores de:');
    console.log('https://developers.facebook.com/apps/');
    console.log('Settings → Basic → App ID y App Secret\n');
    process.exit(1);
  }

  try {
    // Paso 1: Intercambiar por token de larga duración
    console.log('🔄 Paso 1: Intercambiando token corto por token de larga duración...');
    const longTokenResponse = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: META_CONFIG.appId,
          client_secret: META_CONFIG.appSecret,
          fb_exchange_token: SHORT_TOKEN
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

    // Paso 3: Mostrar información de cada página
    console.log('='.repeat(70));
    console.log('📊 TOKENS PERMANENTES GENERADOS');
    console.log('='.repeat(70) + '\n');

    const tokensData = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      console.log(`${i + 1}. ${page.name}`);
      console.log('   ' + '-'.repeat(66));
      console.log(`   Page ID: ${page.id}`);
      console.log(`   Categoría: ${page.category}`);
      console.log(`   Permisos: ${page.tasks?.join(', ') || 'N/A'}`);
      
      // Instagram
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        console.log(`   Instagram: @${ig.username} (${ig.id})`);
      } else {
        console.log(`   Instagram: No vinculado`);
      }
      
      console.log(`   Token (PERMANENTE):`);
      console.log(`   ${page.access_token}`);
      console.log('');

      tokensData.push({
        pageName: page.name,
        pageId: page.id,
        category: page.category,
        token: page.access_token,
        tasks: page.tasks || [],
        instagram: page.instagram_business_account || null
      });
    }

    // Paso 4: Generar script SQL para importar
    console.log('='.repeat(70));
    console.log('📝 SCRIPT SQL PARA IMPORTAR A LA BASE DE DATOS');
    console.log('='.repeat(70) + '\n');

    console.log('-- Ejecuta este SQL en tu base de datos PostgreSQL\n');
    console.log('BEGIN;\n');

    for (const data of tokensData) {
      console.log(`-- ${data.pageName}`);
      console.log(`INSERT INTO "FacebookInstance" (`);
      console.log(`  "instanceId",`);
      console.log(`  "pageId",`);
      console.log(`  "pageName",`);
      console.log(`  "pageAccessToken",`);
      console.log(`  "category",`);
      console.log(`  "status",`);
      console.log(`  "isActive",`);
      console.log(`  "connectedAt",`);
      console.log(`  "createdAt",`);
      console.log(`  "updatedAt",`);
      console.log(`  "config"`);
      console.log(`) VALUES (`);
      console.log(`  'fb-${data.pageId}',`);
      console.log(`  '${data.pageId}',`);
      console.log(`  '${data.pageName}',`);
      console.log(`  '${data.token}',`);
      console.log(`  '${data.category}',`);
      console.log(`  'CONNECTED',`);
      console.log(`  true,`);
      console.log(`  NOW(),`);
      console.log(`  NOW(),`);
      console.log(`  NOW(),`);
      console.log(`  '{"tasks": ${JSON.stringify(data.tasks)}, "tokenType": "permanent"}'::jsonb`);
      console.log(`) ON CONFLICT ("pageId") DO UPDATE SET`);
      console.log(`  "pageAccessToken" = EXCLUDED."pageAccessToken",`);
      console.log(`  "status" = 'CONNECTED',`);
      console.log(`  "connectedAt" = NOW(),`);
      console.log(`  "updatedAt" = NOW();`);
      console.log('');

      // Instagram si existe
      if (data.instagram) {
        const ig = data.instagram;
        console.log(`-- Instagram: @${ig.username}`);
        console.log(`INSERT INTO "InstagramInstance" (`);
        console.log(`  "instanceId",`);
        console.log(`  "userId",`);
        console.log(`  "username",`);
        console.log(`  "accessToken",`);
        console.log(`  "status",`);
        console.log(`  "isActive",`);
        console.log(`  "connectedAt",`);
        console.log(`  "createdAt",`);
        console.log(`  "updatedAt",`);
        console.log(`  "config"`);
        console.log(`) VALUES (`);
        console.log(`  'ig-${ig.id}',`);
        console.log(`  '${ig.id}',`);
        console.log(`  '${ig.username}',`);
        console.log(`  '${data.token}',`);
        console.log(`  'CONNECTED',`);
        console.log(`  true,`);
        console.log(`  NOW(),`);
        console.log(`  NOW(),`);
        console.log(`  NOW(),`);
        console.log(`  '{"linkedPageId": "${data.pageId}", "linkedPageName": "${data.pageName}"}'::jsonb`);
        console.log(`) ON CONFLICT ("userId") DO UPDATE SET`);
        console.log(`  "accessToken" = EXCLUDED."accessToken",`);
        console.log(`  "status" = 'CONNECTED',`);
        console.log(`  "connectedAt" = NOW(),`);
        console.log(`  "updatedAt" = NOW();`);
        console.log('');
      }
    }

    console.log('COMMIT;\n');

    // Paso 5: Generar archivo de configuración JSON
    console.log('='.repeat(70));
    console.log('📄 ARCHIVO DE CONFIGURACIÓN JSON');
    console.log('='.repeat(70) + '\n');

    const configJson = {
      generated: new Date().toISOString(),
      appId: META_CONFIG.appId,
      pages: tokensData.map(data => ({
        name: data.pageName,
        pageId: data.pageId,
        category: data.category,
        token: data.token,
        instagram: data.instagram ? {
          id: data.instagram.id,
          username: data.instagram.username
        } : null
      }))
    };

    console.log(JSON.stringify(configJson, null, 2));
    console.log('');

    // Resumen
    console.log('='.repeat(70));
    console.log('✅ PROCESO COMPLETADO');
    console.log('='.repeat(70) + '\n');

    console.log('📊 Resumen:');
    console.log(`   Páginas procesadas: ${tokensData.length}`);
    console.log(`   Tokens permanentes generados: ${tokensData.length}`);
    console.log(`   Cuentas de Instagram: ${tokensData.filter(d => d.instagram).length}`);
    console.log('');

    console.log('🎯 Próximos pasos:');
    console.log('   1. Copia el script SQL de arriba');
    console.log('   2. Ejecútalo en tu base de datos PostgreSQL');
    console.log('   3. O usa el script de Node.js: node src/scripts/setup-meta-instances.js');
    console.log('   4. Verifica con: node src/scripts/verify-meta-tokens.js');
    console.log('');

    console.log('💡 Nota importante:');
    console.log('   Los Page Access Tokens generados son PERMANENTES');
    console.log('   No expiran mientras la app de Facebook exista');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('\nDetalles del error:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Ejecutar
generatePermanentTokens()
  .then(() => {
    console.log('✅ Script finalizado exitosamente\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  });
