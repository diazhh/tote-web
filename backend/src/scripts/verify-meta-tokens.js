import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const GRAPH_API_VERSION = 'v18.0';

async function verifyFacebookToken(instance) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.pageId}`,
      {
        params: {
          fields: 'id,name,category,fan_count,access_token',
          access_token: instance.pageAccessToken
        }
      }
    );

    console.log(`  ✅ Token válido`);
    console.log(`     Página: ${response.data.name}`);
    console.log(`     Categoría: ${response.data.category}`);
    if (response.data.fan_count) {
      console.log(`     Seguidores: ${response.data.fan_count}`);
    }
    return { valid: true, data: response.data };
  } catch (error) {
    console.log(`  ❌ Token inválido`);
    console.log(`     Error: ${error.response?.data?.error?.message || error.message}`);
    return { valid: false, error: error.message };
  }
}

async function verifyInstagramToken(instance) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.userId}`,
      {
        params: {
          fields: 'id,username,account_type,media_count,followers_count',
          access_token: instance.accessToken
        }
      }
    );

    console.log(`  ✅ Token válido`);
    console.log(`     Usuario: @${response.data.username}`);
    console.log(`     Tipo: ${response.data.account_type}`);
    if (response.data.followers_count) {
      console.log(`     Seguidores: ${response.data.followers_count}`);
    }
    if (response.data.media_count) {
      console.log(`     Posts: ${response.data.media_count}`);
    }
    return { valid: true, data: response.data };
  } catch (error) {
    console.log(`  ❌ Token inválido`);
    console.log(`     Error: ${error.response?.data?.error?.message || error.message}`);
    return { valid: false, error: error.message };
  }
}

async function testFacebookPublish(instance) {
  try {
    // Intentar obtener permisos de la página
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.pageId}`,
      {
        params: {
          fields: 'tasks',
          access_token: instance.pageAccessToken
        }
      }
    );

    const tasks = response.data.tasks || [];
    const canPublish = tasks.includes('CREATE_CONTENT');

    if (canPublish) {
      console.log(`  ✅ Puede publicar contenido`);
      console.log(`     Permisos: ${tasks.join(', ')}`);
    } else {
      console.log(`  ⚠️  No tiene permiso para publicar`);
      console.log(`     Permisos actuales: ${tasks.join(', ')}`);
    }

    return canPublish;
  } catch (error) {
    console.log(`  ❌ Error verificando permisos: ${error.message}`);
    return false;
  }
}

async function testInstagramPublish(instance) {
  try {
    // Verificar que la cuenta sea Business o Creator
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.userId}`,
      {
        params: {
          fields: 'account_type',
          access_token: instance.accessToken
        }
      }
    );

    const accountType = response.data.account_type;
    const canPublish = accountType === 'BUSINESS' || accountType === 'MEDIA_CREATOR';

    if (canPublish) {
      console.log(`  ✅ Puede publicar contenido`);
      console.log(`     Tipo de cuenta: ${accountType}`);
    } else {
      console.log(`  ⚠️  No puede publicar (cuenta personal)`);
      console.log(`     Tipo de cuenta: ${accountType}`);
      console.log(`     Convierte la cuenta a Business o Creator`);
    }

    return canPublish;
  } catch (error) {
    console.log(`  ❌ Error verificando permisos: ${error.message}`);
    return false;
  }
}

async function verifyAllTokens() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 VERIFICACIÓN DE TOKENS DE META (FACEBOOK E INSTAGRAM)');
  console.log('='.repeat(70) + '\n');

  let totalValid = 0;
  let totalInvalid = 0;

  // Facebook
  console.log('📘 FACEBOOK');
  console.log('-'.repeat(70));
  
  const fbInstances = await prisma.facebookInstance.findMany({
    where: { isActive: true },
    orderBy: { pageName: 'asc' }
  });

  if (fbInstances.length === 0) {
    console.log('⚠️  No hay instancias de Facebook configuradas\n');
  } else {
    for (const instance of fbInstances) {
      console.log(`\n📄 ${instance.pageName} (${instance.pageId})`);
      console.log(`   Instance ID: ${instance.instanceId}`);
      console.log(`   Estado: ${instance.status}`);
      
      const result = await verifyFacebookToken(instance);
      if (result.valid) {
        totalValid++;
        await testFacebookPublish(instance);
        
        // Actualizar estado en BD
        await prisma.facebookInstance.update({
          where: { id: instance.id },
          data: { 
            status: 'CONNECTED',
            lastSeen: new Date()
          }
        });
      } else {
        totalInvalid++;
        
        // Actualizar estado en BD
        await prisma.facebookInstance.update({
          where: { id: instance.id },
          data: { 
            status: 'ERROR',
            lastSeen: new Date()
          }
        });
      }
    }
  }

  // Instagram
  console.log('\n\n📸 INSTAGRAM');
  console.log('-'.repeat(70));
  
  const igInstances = await prisma.instagramInstance.findMany({
    where: { isActive: true },
    orderBy: { username: 'asc' }
  });

  if (igInstances.length === 0) {
    console.log('⚠️  No hay instancias de Instagram configuradas\n');
  } else {
    for (const instance of igInstances) {
      console.log(`\n📷 ${instance.username || 'Sin nombre'} (${instance.userId})`);
      console.log(`   Instance ID: ${instance.instanceId}`);
      console.log(`   Estado: ${instance.status}`);
      
      const result = await verifyInstagramToken(instance);
      if (result.valid) {
        totalValid++;
        await testInstagramPublish(instance);
        
        // Actualizar estado en BD
        await prisma.instagramInstance.update({
          where: { id: instance.id },
          data: { 
            status: 'CONNECTED',
            lastSeen: new Date()
          }
        });
      } else {
        totalInvalid++;
        
        // Actualizar estado en BD
        await prisma.instagramInstance.update({
          where: { id: instance.id },
          data: { 
            status: 'ERROR',
            lastSeen: new Date()
          }
        });
      }
    }
  }

  // Verificar canales
  console.log('\n\n📡 CANALES DE PUBLICACIÓN');
  console.log('-'.repeat(70));

  const channels = await prisma.gameChannel.findMany({
    where: {
      isActive: true,
      channelType: { in: ['FACEBOOK', 'INSTAGRAM'] }
    },
    include: {
      game: { select: { name: true } },
      facebookInstance: { select: { pageName: true, status: true } },
      instagramInstance: { select: { username: true, status: true } }
    },
    orderBy: [
      { game: { name: 'asc' } },
      { channelType: 'asc' }
    ]
  });

  if (channels.length === 0) {
    console.log('⚠️  No hay canales configurados\n');
  } else {
    const channelsByGame = {};
    
    for (const channel of channels) {
      const gameName = channel.game.name;
      if (!channelsByGame[gameName]) {
        channelsByGame[gameName] = [];
      }
      channelsByGame[gameName].push(channel);
    }

    for (const [gameName, gameChannels] of Object.entries(channelsByGame)) {
      console.log(`\n🎮 ${gameName}`);
      
      for (const channel of gameChannels) {
        const icon = channel.channelType === 'FACEBOOK' ? '📘' : '📸';
        const instanceName = channel.channelType === 'FACEBOOK' 
          ? channel.facebookInstance?.pageName 
          : channel.instagramInstance?.username;
        const instanceStatus = channel.channelType === 'FACEBOOK'
          ? channel.facebookInstance?.status
          : channel.instagramInstance?.status;
        
        const statusIcon = instanceStatus === 'CONNECTED' ? '✅' : '❌';
        
        console.log(`   ${icon} ${channel.channelType}: ${instanceName || 'N/A'} ${statusIcon}`);
      }
    }
  }

  // Resumen
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 RESUMEN');
  console.log('='.repeat(70));
  console.log(`✅ Tokens válidos: ${totalValid}`);
  console.log(`❌ Tokens inválidos: ${totalInvalid}`);
  console.log(`📡 Canales activos: ${channels.length}`);
  
  if (totalInvalid > 0) {
    console.log('\n⚠️  ACCIÓN REQUERIDA:');
    console.log('   Hay tokens inválidos. Ejecuta el script de configuración nuevamente:');
    console.log('   node src/scripts/setup-meta-instances.js');
  } else if (totalValid > 0) {
    console.log('\n✅ Todos los tokens están funcionando correctamente');
    console.log('   El sistema está listo para publicar en Facebook e Instagram');
  }
  
  console.log('');
}

// Ejecutar
verifyAllTokens()
  .then(() => {
    prisma.$disconnect();
    console.log('✅ Verificación completada\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en verificación:', error.message);
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });
