import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixTodaysDraws() {
  try {
    console.log('🔧 Iniciando corrección de sorteos de hoy...\n');

    // Obtener fecha de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Obtener el juego LOTOANIMALITO
    const lotoAnimalito = await prisma.game.findUnique({
      where: { slug: 'lotoanimalito' }
    });

    if (!lotoAnimalito) {
      console.log('❌ No se encontró el juego LOTOANIMALITO');
      return;
    }

    // 2. Obtener el nuevo item DELFÍN (número 0)
    const delfinItem = await prisma.gameItem.findFirst({
      where: {
        gameId: lotoAnimalito.id,
        number: '0'
      }
    });

    if (!delfinItem) {
      console.log('❌ No se encontró el item DELFÍN con número 0');
      return;
    }

    console.log(`✅ Item DELFÍN encontrado: ${delfinItem.number} - ${delfinItem.name} (ID: ${delfinItem.id})\n`);

    // 3. Buscar sorteos de hoy con DELFÍN preseleccionado (número 37 antiguo)
    const oldDelfinItem = await prisma.gameItem.findFirst({
      where: {
        gameId: lotoAnimalito.id,
        number: '37'
      }
    });

    if (oldDelfinItem) {
      console.log(`⚠️  Item antiguo encontrado: ${oldDelfinItem.number} - ${oldDelfinItem.name}`);
      
      // Buscar sorteos con el item antiguo
      const drawsWithOldDelfin = await prisma.draw.findMany({
        where: {
          gameId: lotoAnimalito.id,
          drawDate: today,
          preselectedItemId: oldDelfinItem.id
        }
      });

      if (drawsWithOldDelfin.length > 0) {
        console.log(`\n📝 Actualizando ${drawsWithOldDelfin.length} sorteo(s) con DELFÍN antiguo...`);
        
        for (const draw of drawsWithOldDelfin) {
          await prisma.draw.update({
            where: { id: draw.id },
            data: { preselectedItemId: delfinItem.id }
          });
          console.log(`   ✓ Sorteo ${draw.drawTime} actualizado`);
        }
      } else {
        console.log('\n✅ No hay sorteos de hoy con DELFÍN antiguo (37)');
      }
    }

    // 4. Verificar sorteos de hoy con DELFÍN actual
    const drawsWithDelfin = await prisma.draw.findMany({
      where: {
        gameId: lotoAnimalito.id,
        drawDate: today,
        preselectedItemId: delfinItem.id
      },
      include: {
        preselectedItem: true
      }
    });

    console.log(`\n📊 Sorteos de hoy con DELFÍN (número 0):`);
    if (drawsWithDelfin.length > 0) {
      drawsWithDelfin.forEach(draw => {
        console.log(`   - ${draw.drawTime}: ${draw.preselectedItem.number} - ${draw.preselectedItem.name}`);
      });
    } else {
      console.log('   Ninguno');
    }

    // 5. Verificar LOTTOPANTERA - mostrar algunos sorteos para confirmar
    const lottoPantera = await prisma.game.findUnique({
      where: { slug: 'lottopantera' }
    });

    if (lottoPantera) {
      const panteraDraws = await prisma.draw.findMany({
        where: {
          gameId: lottoPantera.id,
          drawDate: today,
          preselectedItemId: { not: null }
        },
        include: {
          preselectedItem: true
        },
        take: 5
      });

      console.log(`\n📊 Primeros sorteos de LOTTOPANTERA de hoy:`);
      panteraDraws.forEach(draw => {
        console.log(`   - ${draw.drawTime}: ${draw.preselectedItem.number} - ${draw.preselectedItem.name}`);
      });
    }

    console.log('\n✅ Corrección completada exitosamente');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixTodaysDraws();
