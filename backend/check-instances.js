import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInstances() {
  try {
    console.log('🔍 VERIFICANDO INSTANCIAS DE REDES SOCIALES\n');
    console.log('='.repeat(60));

    // Instagram
    const instagramInstances = await prisma.instagramInstance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\n📱 INSTAGRAM (${instagramInstances.length} instancias):`);
    if (instagramInstances.length === 0) {
      console.log('   ⚠️  No hay instancias de Instagram configuradas');
    } else {
      instagramInstances.forEach(inst => {
        console.log(`\n   ID: ${inst.instanceId}`);
        console.log(`   Nombre: ${inst.name}`);
        console.log(`   Estado: ${inst.status}`);
        console.log(`   Username: ${inst.username || 'N/A'}`);
        console.log(`   User ID: ${inst.userId || 'N/A'}`);
        console.log(`   Token expira: ${inst.tokenExpiresAt || 'N/A'}`);
        console.log(`   Activo: ${inst.isActive}`);
      });
    }

    // Facebook
    const facebookInstances = await prisma.facebookInstance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\n\n📘 FACEBOOK (${facebookInstances.length} instancias):`);
    if (facebookInstances.length === 0) {
      console.log('   ⚠️  No hay instancias de Facebook configuradas');
    } else {
      facebookInstances.forEach(inst => {
        console.log(`\n   ID: ${inst.instanceId}`);
        console.log(`   Nombre: ${inst.name}`);
        console.log(`   Estado: ${inst.status}`);
        console.log(`   Página: ${inst.pageName || 'N/A'}`);
        console.log(`   Page ID: ${inst.pageId || 'N/A'}`);
        console.log(`   Activo: ${inst.isActive}`);
      });
    }

    // Telegram
    const telegramInstances = await prisma.telegramInstance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\n\n💬 TELEGRAM (${telegramInstances.length} instancias):`);
    if (telegramInstances.length === 0) {
      console.log('   ⚠️  No hay instancias de Telegram configuradas');
    } else {
      telegramInstances.forEach(inst => {
        console.log(`\n   ID: ${inst.instanceId}`);
        console.log(`   Nombre: ${inst.name}`);
        console.log(`   Estado: ${inst.status}`);
        console.log(`   Bot Username: ${inst.botUsername || 'N/A'}`);
        console.log(`   Activo: ${inst.isActive}`);
      });
    }

    // WhatsApp
    const whatsappInstances = await prisma.whatsAppInstance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\n\n💚 WHATSAPP (${whatsappInstances.length} instancias):`);
    if (whatsappInstances.length === 0) {
      console.log('   ⚠️  No hay instancias de WhatsApp configuradas');
    } else {
      whatsappInstances.forEach(inst => {
        console.log(`\n   ID: ${inst.instanceId}`);
        console.log(`   Nombre: ${inst.name}`);
        console.log(`   Estado: ${inst.status}`);
        console.log(`   Número: ${inst.phoneNumber || 'N/A'}`);
        console.log(`   Activo: ${inst.isActive}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n💡 INSTRUCCIONES:\n');
    
    if (instagramInstances.length === 0) {
      console.log('📱 Para crear una instancia de Instagram:');
      console.log('   POST /api/instagram/instances');
      console.log('   Body: {');
      console.log('     "instanceId": "instagram-lotoanimalito",');
      console.log('     "name": "Instagram Lotoanimalito",');
      console.log('     "appId": "TU_APP_ID",');
      console.log('     "appSecret": "TU_APP_SECRET",');
      console.log('     "redirectUri": "https://tu-dominio.com/callback"');
      console.log('   }\n');
    }

    if (facebookInstances.length === 0) {
      console.log('📘 Para crear una instancia de Facebook:');
      console.log('   POST /api/facebook/instances');
      console.log('   Body: {');
      console.log('     "instanceId": "facebook-lotoanimalito",');
      console.log('     "name": "Facebook Lotoanimalito",');
      console.log('     "pageAccessToken": "TU_PAGE_ACCESS_TOKEN",');
      console.log('     "appSecret": "TU_APP_SECRET",');
      console.log('     "webhookToken": "TU_WEBHOOK_TOKEN",');
      console.log('     "pageId": "TU_PAGE_ID"');
      console.log('   }\n');
    }

    console.log('🔗 Documentación de APIs:');
    console.log('   Instagram: https://developers.facebook.com/docs/instagram-basic-display-api');
    console.log('   Facebook: https://developers.facebook.com/docs/pages/overview\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkInstances();
