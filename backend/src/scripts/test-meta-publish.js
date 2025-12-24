import axios from 'axios';

// Tokens obtenidos
const TOKENS = {
  lotoanimalito: {
    pageId: '137321016700627',
    pageName: 'Lotoanimalito',
    token: 'EAAKG0vizxFUBQcZBstj3ligBZBuGhECF7aKAYw4ZAW6hKGV9ydsPagXZADXYoNanLUDlrNSk1fqdquFKHK0vbNfda0iROieZBRynkiOxARXLfOTSxay4dzWiUpVIcoGhYAzWZALA5EpGeIIQpc2XHenhTJRucapN14NQ1b0fWdkbZASKpZAL1CZCFyILRWlH5qekXnhYaYAxOKsL4ThZAgbEIF',
    instagramId: '17841403596605091'
  },
  lottoPantera: {
    pageId: '116187448076947',
    pageName: 'Lotto pantera',
    token: 'EAAKG0vizxFUBQd6N4qwad2FADM50Or7C5fZCzlKZC9LJ2ZAyBGzZADmnuKaWCF14PoLPwNU57ZA4ozszsGskv36IQPZAtEFO70z8RZCBxqf0BjKf1nfOxrjcS5TahZBGJC5OM9yFQXWJVXLS472iRUZCL2cNcvk2uE7KSWNDtHRFe31E9nh7ZCOJ0OffV4UUittKZCAkTOc8Vi4q4cC2hi6nw3ZC',
    instagramId: '17841458238569617'
  }
};

const GRAPH_API_VERSION = 'v18.0';

async function testFacebookPost(pageId, token, pageName) {
  try {
    console.log(`\n📘 Probando Facebook: ${pageName}`);
    console.log('-'.repeat(60));

    const message = `🎰 Prueba de publicación desde Tote Web\n\nFecha: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}\n\n✅ Sistema funcionando correctamente`;

    // Publicar solo texto
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`,
      {
        message: message,
        access_token: token
      }
    );

    console.log(`✅ Publicación exitosa en Facebook`);
    console.log(`   Post ID: ${response.data.id}`);
    return { success: true, postId: response.data.id };

  } catch (error) {
    console.log(`❌ Error en Facebook:`);
    console.log(`   ${error.response?.data?.error?.message || error.message}`);
    if (error.response?.data) {
      console.log(`   Detalles:`, JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: error.message };
  }
}

async function testInstagramPost(instagramId, token, pageName) {
  try {
    console.log(`\n📸 Probando Instagram: ${pageName}`);
    console.log('-'.repeat(60));

    // Verificar que la cuenta existe
    console.log('1. Verificando cuenta de Instagram...');
    const accountCheck = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramId}`,
      {
        params: {
          fields: 'id,username',
          access_token: token
        }
      }
    );

    console.log(`   ✅ Cuenta encontrada: @${accountCheck.data.username}`);

    // Nota: Para publicar en Instagram necesitas una URL de imagen pública
    // Instagram no acepta posts solo de texto
    console.log('\n⚠️  Instagram requiere una imagen para publicar');
    console.log('   Para probar, necesitas:');
    console.log('   1. Una URL de imagen pública');
    console.log('   2. Usar el método publishPhoto del servicio');

    return { success: true, note: 'Cuenta verificada, requiere imagen para publicar' };

  } catch (error) {
    console.log(`❌ Error en Instagram:`);
    console.log(`   ${error.response?.data?.error?.message || error.message}`);
    if (error.response?.data) {
      console.log(`   Detalles:`, JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: error.message };
  }
}

async function testAll() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 PRUEBA DE PUBLICACIÓN EN META (FACEBOOK E INSTAGRAM)');
  console.log('='.repeat(70));

  // Probar Lotoanimalito
  console.log('\n📋 LOTOANIMALITO');
  console.log('='.repeat(70));
  
  const fbLoto = await testFacebookPost(
    TOKENS.lotoanimalito.pageId,
    TOKENS.lotoanimalito.token,
    TOKENS.lotoanimalito.pageName
  );

  const igLoto = await testInstagramPost(
    TOKENS.lotoanimalito.instagramId,
    TOKENS.lotoanimalito.token,
    TOKENS.lotoanimalito.pageName
  );

  // Probar Lotto Pantera
  console.log('\n\n📋 LOTTO PANTERA');
  console.log('='.repeat(70));

  const fbPantera = await testFacebookPost(
    TOKENS.lottoPantera.pageId,
    TOKENS.lottoPantera.token,
    TOKENS.lottoPantera.pageName
  );

  const igPantera = await testInstagramPost(
    TOKENS.lottoPantera.instagramId,
    TOKENS.lottoPantera.token,
    TOKENS.lottoPantera.pageName
  );

  // Resumen
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('='.repeat(70));

  console.log('\n📘 Facebook:');
  console.log(`   Lotoanimalito: ${fbLoto.success ? '✅ Exitoso' : '❌ Falló'}`);
  console.log(`   Lotto Pantera: ${fbPantera.success ? '✅ Exitoso' : '❌ Falló'}`);

  console.log('\n📸 Instagram:');
  console.log(`   Lotoanimalito: ${igLoto.success ? '✅ Verificado' : '❌ Falló'}`);
  console.log(`   Lotto Pantera: ${igPantera.success ? '✅ Verificado' : '❌ Falló'}`);

  console.log('\n💡 Notas importantes:');
  console.log('   - Facebook: Puede publicar texto e imágenes');
  console.log('   - Instagram: REQUIERE imagen (no acepta solo texto)');
  console.log('   - Ambos usan el mismo Page Access Token');
  console.log('   - Los tokens son permanentes (no expiran)');
  console.log('');

  if (fbLoto.success || fbPantera.success) {
    console.log('✅ Al menos una publicación en Facebook fue exitosa');
    console.log('   Revisa las páginas de Facebook para ver los posts de prueba');
  }

  console.log('');
}

// Ejecutar
testAll()
  .then(() => {
    console.log('✅ Pruebas completadas\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  });
