import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupInstances() {
  try {
    console.log('🧹 LIMPIANDO INSTANCIAS EXTRAS\n');
    console.log('Solo se mantendrán 2 instancias de Facebook y 2 de Instagram:\n');
    console.log('Facebook:');
    console.log('  - Lotoanimalito (fb-137321016700627)');
    console.log('  - Lotto pantera (fb-116187448076947)\n');
    console.log('Instagram:');
    console.log('  - @lotoanimalito (ig-17841403596605091)');
    console.log('  - @lottopantera (ig-17841458238569617)\n');

    // IDs a mantener
    const keepFacebookIds = ['fb-137321016700627', 'fb-116187448076947'];
    const keepInstagramIds = ['ig-17841403596605091', 'ig-17841458238569617'];

    // Desactivar instancias extras de Facebook
    console.log('📘 Limpiando Facebook...');
    const fbResult = await prisma.facebookInstance.updateMany({
      where: {
        instanceId: {
          notIn: keepFacebookIds
        }
      },
      data: {
        isActive: false
      }
    });
    console.log(`   ✅ ${fbResult.count} instancias de Facebook desactivadas\n`);

    // Desactivar instancias extras de Instagram
    console.log('📱 Limpiando Instagram...');
    const igResult = await prisma.instagramInstance.updateMany({
      where: {
        instanceId: {
          notIn: keepInstagramIds
        }
      },
      data: {
        isActive: false
      }
    });
    console.log(`   ✅ ${igResult.count} instancias de Instagram desactivadas\n`);

    // Verificar instancias activas
    console.log('='.repeat(70));
    console.log('📊 INSTANCIAS ACTIVAS FINALES\n');

    const activeFb = await prisma.facebookInstance.findMany({
      where: { isActive: true },
      select: { instanceId: true, name: true, pageId: true, status: true }
    });

    console.log(`📘 Facebook (${activeFb.length}):`);
    activeFb.forEach(inst => {
      console.log(`   ✅ ${inst.name} (${inst.instanceId}) - ${inst.status}`);
    });

    const activeIg = await prisma.instagramInstance.findMany({
      where: { isActive: true },
      select: { instanceId: true, username: true, userId: true, status: true }
    });

    console.log(`\n📱 Instagram (${activeIg.length}):`);
    activeIg.forEach(inst => {
      console.log(`   ✅ @${inst.username} (${inst.instanceId}) - ${inst.status}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Limpieza completada!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupInstances();
