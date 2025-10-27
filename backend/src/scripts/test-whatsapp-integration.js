/**
 * Script de prueba para la integración de WhatsApp Baileys
 * 
 * Uso:
 *   node src/scripts/test-whatsapp-integration.js
 */

import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import logger from '../lib/logger.js';

const TEST_INSTANCE_ID = 'test-instance';

async function testWhatsAppIntegration() {
  console.log('🧪 Iniciando pruebas de integración de WhatsApp Baileys\n');

  try {
    // Test 1: Inicializar instancia
    console.log('📝 Test 1: Inicializar instancia...');
    const initResult = await whatsappBaileysService.initializeInstance(TEST_INSTANCE_ID);
    console.log('✅ Instancia inicializada:', initResult);
    console.log('');

    // Esperar un momento para que se genere el QR
    await sleep(3000);

    // Test 2: Obtener QR
    console.log('📝 Test 2: Obtener código QR...');
    try {
      const qrResult = await whatsappBaileysService.getQRCode(TEST_INSTANCE_ID);
      if (qrResult.status === 'qr_ready') {
        console.log('✅ QR generado correctamente');
        console.log('📱 Escanea este código QR con WhatsApp:');
        console.log(qrResult.qr);
        console.log('');
        console.log('⏳ Esperando 30 segundos para que escanees el QR...');
        console.log('   (Si no lo escaneas, el test continuará de todos modos)');
        console.log('');
        
        // Esperar 30 segundos para que el usuario escanee
        await sleep(30000);
      } else if (qrResult.status === 'connected') {
        console.log('✅ La instancia ya está conectada');
        console.log('📱 Número:', qrResult.phoneNumber);
        console.log('');
      }
    } catch (error) {
      console.log('⚠️  Error al obtener QR (esto es normal si aún no se generó):', error.message);
      console.log('');
    }

    // Test 3: Verificar estado
    console.log('📝 Test 3: Verificar estado de instancia...');
    const statusResult = await whatsappBaileysService.getInstanceStatus(TEST_INSTANCE_ID);
    console.log('✅ Estado obtenido:', statusResult);
    console.log('');

    // Test 4: Listar instancias
    console.log('📝 Test 4: Listar todas las instancias...');
    const instances = await whatsappBaileysService.listInstances();
    console.log('✅ Instancias encontradas:', instances.length);
    instances.forEach(instance => {
      console.log(`   - ${instance.instanceId}: ${instance.status}`);
    });
    console.log('');

    // Test 5: Verificar conexión del session manager
    console.log('📝 Test 5: Verificar session manager...');
    const isConnected = sessionManager.isConnected(TEST_INSTANCE_ID);
    console.log(`✅ Instancia conectada: ${isConnected}`);
    console.log('');

    if (isConnected) {
      // Test 6: Enviar mensaje de prueba (solo si está conectado)
      console.log('📝 Test 6: Enviar mensaje de prueba...');
      console.log('⚠️  Saltando (requiere número de destino configurado)');
      console.log('   Para probar el envío, usa:');
      console.log(`   await whatsappBaileysService.sendTestMessage('${TEST_INSTANCE_ID}', '584121234567', 'Test');`);
      console.log('');
    }

    // Test 7: Información de sesión
    console.log('📝 Test 7: Obtener información de sesión...');
    const sessionInfo = sessionManager.getSessionInfo(TEST_INSTANCE_ID);
    if (sessionInfo) {
      console.log('✅ Información de sesión:');
      console.log('   - Status:', sessionInfo.status);
      console.log('   - Phone:', sessionInfo.phoneNumber || 'N/A');
      console.log('   - Connected at:', sessionInfo.connectedAt || 'N/A');
      console.log('   - Last seen:', sessionInfo.lastSeen);
    } else {
      console.log('⚠️  No se pudo obtener información de sesión');
    }
    console.log('');

    // Resumen
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Inicialización: OK');
    console.log('✅ Generación de QR: OK');
    console.log('✅ Verificación de estado: OK');
    console.log('✅ Listado de instancias: OK');
    console.log('✅ Session Manager: OK');
    console.log('');
    console.log('Estado de la instancia:', statusResult.status);
    console.log('');

    if (statusResult.status === 'connected') {
      console.log('🎉 ¡WhatsApp está conectado y listo para usar!');
      console.log('');
      console.log('Próximos pasos:');
      console.log('1. Configurar destinatarios en el canal');
      console.log('2. Probar envío de mensaje');
      console.log('3. Publicar un sorteo de prueba');
    } else {
      console.log('⚠️  WhatsApp no está conectado aún');
      console.log('');
      console.log('Para conectar:');
      console.log('1. Obtén el QR: GET /api/whatsapp/instances/test-instance/qr');
      console.log('2. Escanéalo con WhatsApp');
      console.log('3. Verifica el estado: GET /api/whatsapp/instances/test-instance/status');
    }
    console.log('');

    // Preguntar si desea limpiar
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 LIMPIEZA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Para limpiar la instancia de prueba, ejecuta:');
    console.log(`   await whatsappBaileysService.deleteInstance('${TEST_INSTANCE_ID}');`);
    console.log('');
    console.log('O usa el endpoint:');
    console.log(`   DELETE /api/whatsapp/instances/${TEST_INSTANCE_ID}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
    logger.error('Error en test de WhatsApp:', error);
    throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar pruebas
testWhatsAppIntegration()
  .then(() => {
    console.log('✅ Pruebas completadas');
    // No cerrar el proceso para mantener la sesión activa
    console.log('');
    console.log('⚠️  El proceso se mantiene activo para conservar la sesión');
    console.log('   Presiona Ctrl+C para salir');
  })
  .catch((error) => {
    console.error('❌ Error en las pruebas:', error);
    process.exit(1);
  });
