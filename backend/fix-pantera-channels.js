import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPanteraChannels() {
  try {
    console.log('🔧 CORRIGIENDO CANALES DE TRIPLE PANTERA\n');

    // Actualizar canal de Facebook para Triple Pantera
    const facebookChannel = await prisma.gameChannel.findFirst({
      where: {
        channelType: 'FACEBOOK',
        game: { name: 'TRIPLE PANTERA' }
      },
      include: { game: true }
    });

    if (facebookChannel) {
      console.log(`📘 Actualizando Facebook: ${facebookChannel.name}`);
      await prisma.gameChannel.update({
        where: { id: facebookChannel.id },
        data: { facebookInstanceId: 'fb-116187448076947' }
      });
      console.log('   ✅ Actualizado a: fb-116187448076947');
    }

    // Actualizar canal de Instagram para Triple Pantera
    const instagramChannel = await prisma.gameChannel.findFirst({
      where: {
        channelType: 'INSTAGRAM',
        game: { name: 'TRIPLE PANTERA' }
      },
      include: { game: true }
    });

    if (instagramChannel) {
      console.log(`\n📱 Actualizando Instagram: ${instagramChannel.name}`);
      await prisma.gameChannel.update({
        where: { id: instagramChannel.id },
        data: { instagramInstanceId: 'ig-17841458238569617' }
      });
      console.log('   ✅ Actualizado a: ig-17841458238569617');
    }

    console.log('\n✅ Corrección completada\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPanteraChannels();
