#!/usr/bin/env node
/**
 * Script para probar envío de imágenes a grupos de WhatsApp
 */

import sessionManager from '../src/lib/whatsapp/session-manager.js';
import logger from '../src/lib/logger.js';

const INSTANCE_ID = 'ws';
const TEST_GROUP_JID = '120363422708944481@g.us';
const TEST_IMAGE_URL = 'https://toteback.atilax.io/api/images/animalitos_20251226_0900.png';
const TEST_CAPTION = '🎰 *PRUEBA DE ENVÍO A GRUPO*\n\n⏰ Hora: 9:00 a. m.\n🎯 Resultado: *00*\n🏆 BALLENA\n\n✨ Esto es una prueba';

async function testGroupSend() {
  try {
    console.log('\n🧪 INICIANDO PRUEBA DE ENVÍO A GRUPO WHATSAPP\n');
    console.log(`📱 Instancia: ${INSTANCE_ID}`);
    console.log(`👥 Grupo: ${TEST_GROUP_JID}`);
    console.log(`🖼️  Imagen: ${TEST_IMAGE_URL}`);
    console.log(`📝 Caption: ${TEST_CAPTION.substring(0, 50)}...`);
    console.log('\n' + '='.repeat(60) + '\n');

    // Verificar que la instancia esté conectada
    const session = sessionManager.getSession(INSTANCE_ID);
    console.log(`📊 Sesión existe: ${!!session}`);
    console.log(`🔗 Estado de sesión: ${session?.status || 'N/A'}`);
    
    const isConnected = sessionManager.isConnected(INSTANCE_ID);
    console.log(`✅ Instancia conectada: ${isConnected}`);
    
    if (!session || !isConnected) {
      console.error('❌ La instancia no está conectada o no existe. Abortando.');
      console.log('\n💡 Tip: Asegúrate de que el backend esté corriendo y WhatsApp esté conectado.');
      return;
    }

    // Obtener información de la sesión
    const sessionInfo = sessionManager.getSessionInfo(INSTANCE_ID);
    console.log(`📞 Número: ${sessionInfo?.phoneNumber || 'N/A'}`);
    console.log('\n' + '='.repeat(60) + '\n');

    // PRUEBA 1: Enviar usando el método actual (sendImageFromUrl)
    console.log('🧪 PRUEBA 1: Método actual (sendImageFromUrl)');
    try {
      const result1 = await sessionManager.sendImageFromUrl(
        INSTANCE_ID,
        TEST_GROUP_JID,
        TEST_IMAGE_URL,
        TEST_CAPTION
      );
      console.log('✅ ÉXITO - Prueba 1');
      console.log('📊 Resultado:', JSON.stringify(result1, null, 2));
    } catch (error1) {
      console.error('❌ FALLÓ - Prueba 1');
      console.error('Error:', error1.message);
      console.error('Stack:', error1.stack);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // PRUEBA 2: Enviar texto simple al grupo
    console.log('🧪 PRUEBA 2: Texto simple al grupo');
    try {
      const result2 = await sessionManager.sendTextMessage(
        INSTANCE_ID,
        TEST_GROUP_JID,
        '🧪 Prueba de texto simple al grupo'
      );
      console.log('✅ ÉXITO - Prueba 2 (texto)');
      console.log('📊 Resultado:', JSON.stringify(result2, null, 2));
    } catch (error2) {
      console.error('❌ FALLÓ - Prueba 2 (texto)');
      console.error('Error:', error2.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // PRUEBA 3: Obtener lista de grupos
    console.log('🧪 PRUEBA 3: Listar grupos disponibles');
    try {
      const groups = await sessionManager.getGroups(INSTANCE_ID);
      console.log(`✅ Grupos encontrados: ${groups.length}`);
      
      // Buscar el grupo test
      const testGroup = groups.find(g => g.id === TEST_GROUP_JID);
      if (testGroup) {
        console.log('\n📋 Información del grupo TEST:');
        console.log(JSON.stringify(testGroup, null, 2));
      } else {
        console.log('⚠️  Grupo TEST no encontrado en la lista');
        console.log('\n📋 Grupos disponibles:');
        groups.forEach(g => {
          console.log(`  - ${g.subject} (${g.id})`);
        });
      }
    } catch (error3) {
      console.error('❌ FALLÓ - Prueba 3 (listar grupos)');
      console.error('Error:', error3.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');
    console.log('✅ PRUEBAS COMPLETADAS\n');

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error);
    console.error(error.stack);
  }
}

// Ejecutar
testGroupSend()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
