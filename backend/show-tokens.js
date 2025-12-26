import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showTokens() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔑 TOKENS GENERADOS - FACEBOOK E INSTAGRAM');
    console.log('='.repeat(80) + '\n');

    // Facebook
    const fbInstances = await prisma.facebookInstance.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    console.log(`📘 FACEBOOK (${fbInstances.length} instancias)\n`);
    
    for (const inst of fbInstances) {
      console.log(`${inst.name}`);
      console.log('-'.repeat(80));
      console.log(`Instance ID: ${inst.instanceId}`);
      console.log(`Page ID: ${inst.pageId}`);
      console.log(`Page Name: ${inst.pageName}`);
      console.log(`Status: ${inst.status}`);
      console.log(`\nPage Access Token:`);
      console.log(inst.pageAccessToken);
      console.log(`\nApp Secret:`);
      console.log(inst.appSecret || 'N/A');
      console.log('\n');
    }

    console.log('='.repeat(80) + '\n');

    // Instagram
    const igInstances = await prisma.instagramInstance.findMany({
      where: { isActive: true },
      orderBy: { username: 'asc' }
    });

    console.log(`📱 INSTAGRAM (${igInstances.length} instancias)\n`);
    
    for (const inst of igInstances) {
      console.log(`@${inst.username}`);
      console.log('-'.repeat(80));
      console.log(`Instance ID: ${inst.instanceId}`);
      console.log(`User ID: ${inst.userId}`);
      console.log(`Username: ${inst.username}`);
      console.log(`Status: ${inst.status}`);
      console.log(`\nAccess Token:`);
      console.log(inst.accessToken);
      console.log(`\nApp ID: ${inst.appId || 'N/A'}`);
      console.log(`App Secret: ${inst.appSecret || 'N/A'}`);
      
      // Buscar página de Facebook vinculada
      if (inst.config?.linkedPageId) {
        const linkedPage = await prisma.facebookInstance.findFirst({
          where: { pageId: inst.config.linkedPageId }
        });
        if (linkedPage) {
          console.log(`\nVinculado a Facebook: ${linkedPage.pageName} (${linkedPage.pageId})`);
        }
      }
      console.log('\n');
    }

    console.log('='.repeat(80));
    console.log('\n💡 NOTAS:\n');
    console.log('- Los tokens de Facebook son Page Access Tokens PERMANENTES');
    console.log('- Los tokens de Instagram usan el mismo token de la página vinculada');
    console.log('- Para Instagram, usa el User ID (no el Instance ID)');
    console.log('- App ID: 711190627206229');
    console.log('- App Secret: 121113b6b3d697481e5d042158d7c645\n');

    console.log('📋 EJEMPLO DE USO:\n');
    console.log('Facebook:');
    console.log('  POST https://graph.facebook.com/v18.0/{PAGE_ID}/photos');
    console.log('  Body: { url: "IMAGE_URL", caption: "TEXT", access_token: "PAGE_TOKEN" }\n');
    
    console.log('Instagram:');
    console.log('  POST https://graph.facebook.com/v18.0/{IG_USER_ID}/media');
    console.log('  Body: { image_url: "IMAGE_URL", caption: "TEXT", access_token: "PAGE_TOKEN" }\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showTokens();
