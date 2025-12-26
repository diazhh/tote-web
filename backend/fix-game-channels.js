import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixGameChannels() {
  try {
    console.log('🔧 CORRIGIENDO IDs DE INSTANCIAS EN GAMECHANNELS\n');

    // Obtener instancias reales
    const instagramInstances = await prisma.instagramInstance.findMany();
    const facebookInstances = await prisma.facebookInstance.findMany();

    console.log('📱 Instancias de Instagram disponibles:');
    instagramInstances.forEach(inst => {
      console.log(`   - ${inst.instanceId} (${inst.name})`);
    });

    console.log('\n📘 Instancias de Facebook disponibles:');
    facebookInstances.forEach(inst => {
      console.log(`   - ${inst.instanceId} (${inst.name})`);
    });

    // Obtener GameChannels
    const gameChannels = await prisma.gameChannel.findMany({
      where: {
        OR: [
          { channelType: 'INSTAGRAM' },
          { channelType: 'FACEBOOK' }
        ]
      },
      include: { game: true }
    });

    console.log('\n\n🎮 GameChannels a actualizar:');
    
    for (const channel of gameChannels) {
      console.log(`\n   Canal: ${channel.name} (${channel.channelType})`);
      console.log(`   Juego: ${channel.game.name}`);
      
      if (channel.channelType === 'INSTAGRAM') {
        const currentId = channel.instagramInstanceId;
        console.log(`   ID actual: ${currentId}`);
        
        // Buscar instancia correcta por nombre del juego
        const correctInstance = instagramInstances.find(inst => 
          inst.name.toLowerCase().includes(channel.game.name.toLowerCase().split(' ')[0])
        );
        
        if (correctInstance && correctInstance.instanceId !== currentId) {
          console.log(`   ✅ Actualizando a: ${correctInstance.instanceId}`);
          await prisma.gameChannel.update({
            where: { id: channel.id },
            data: { instagramInstanceId: correctInstance.instanceId }
          });
        } else if (correctInstance) {
          console.log(`   ℹ️  Ya tiene el ID correcto`);
        } else {
          console.log(`   ⚠️  No se encontró instancia correspondiente`);
        }
      }
      
      if (channel.channelType === 'FACEBOOK') {
        const currentId = channel.facebookInstanceId;
        console.log(`   ID actual: ${currentId}`);
        
        // Buscar instancia correcta por nombre del juego
        const correctInstance = facebookInstances.find(inst => 
          inst.name.toLowerCase().includes(channel.game.name.toLowerCase().split(' ')[0])
        );
        
        if (correctInstance && correctInstance.instanceId !== currentId) {
          console.log(`   ✅ Actualizando a: ${correctInstance.instanceId}`);
          await prisma.gameChannel.update({
            where: { id: channel.id },
            data: { facebookInstanceId: correctInstance.instanceId }
          });
        } else if (correctInstance) {
          console.log(`   ℹ️  Ya tiene el ID correcto`);
        } else {
          console.log(`   ⚠️  No se encontró instancia correspondiente`);
        }
      }
    }

    console.log('\n\n✅ Actualización completada\n');

    // Verificar resultados
    const updatedChannels = await prisma.gameChannel.findMany({
      where: {
        OR: [
          { channelType: 'INSTAGRAM' },
          { channelType: 'FACEBOOK' }
        ]
      },
      include: { game: true }
    });

    console.log('📊 Estado final de GameChannels:\n');
    for (const channel of updatedChannels) {
      console.log(`   ${channel.name} (${channel.game.name})`);
      if (channel.channelType === 'INSTAGRAM') {
        console.log(`   Instagram Instance: ${channel.instagramInstanceId}`);
      }
      if (channel.channelType === 'FACEBOOK') {
        console.log(`   Facebook Instance: ${channel.facebookInstanceId}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

fixGameChannels();
