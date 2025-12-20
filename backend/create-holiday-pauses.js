import { prisma } from './src/lib/prisma.js';
import logger from './src/lib/logger.js';

/**
 * Script para crear pausas en días festivos
 * Ejemplo: 31 de diciembre y 1 de enero
 */
async function createHolidayPauses() {
  try {
    console.log('🎄 Creando pausas para días festivos...\n');

    // Obtener todos los juegos
    const games = await prisma.game.findMany({
      select: { id: true, name: true }
    });

    console.log(`Juegos encontrados: ${games.length}\n`);

    // Definir días festivos (puedes modificar estas fechas)
    const holidays = [
      {
        name: 'Año Nuevo 2025',
        startDate: new Date('2025-12-31T00:00:00-04:00'), // 31 dic 2025
        endDate: new Date('2026-01-01T23:59:59-04:00'),   // 1 ene 2026
        reason: 'Fiestas de Año Nuevo'
      },
      {
        name: 'Año Nuevo 2026',
        startDate: new Date('2026-12-31T00:00:00-04:00'), // 31 dic 2026
        endDate: new Date('2027-01-01T23:59:59-04:00'),   // 1 ene 2027
        reason: 'Fiestas de Año Nuevo'
      }
      // Puedes agregar más días festivos aquí:
      // {
      //   name: 'Navidad 2025',
      //   startDate: new Date('2025-12-24T00:00:00-04:00'),
      //   endDate: new Date('2025-12-25T23:59:59-04:00'),
      //   reason: 'Navidad'
      // }
    ];

    let createdCount = 0;
    let skippedCount = 0;

    for (const game of games) {
      console.log(`\n📋 Procesando: ${game.name}`);
      
      for (const holiday of holidays) {
        // Verificar si ya existe una pausa para este juego en estas fechas
        const existing = await prisma.drawPause.findFirst({
          where: {
            gameId: game.id,
            startDate: holiday.startDate,
            endDate: holiday.endDate
          }
        });

        if (existing) {
          console.log(`  ⏭️  ${holiday.name}: Ya existe`);
          skippedCount++;
          continue;
        }

        // Crear la pausa
        await prisma.drawPause.create({
          data: {
            gameId: game.id,
            startDate: holiday.startDate,
            endDate: holiday.endDate,
            reason: holiday.reason,
            isActive: true
          }
        });

        console.log(`  ✅ ${holiday.name}: Pausa creada`);
        createdCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Proceso completado:`);
    console.log(`   - ${createdCount} pausas creadas`);
    console.log(`   - ${skippedCount} pausas ya existían`);
    console.log('='.repeat(50) + '\n');

    // Mostrar resumen de pausas activas
    const allPauses = await prisma.drawPause.findMany({
      where: { isActive: true },
      include: {
        game: {
          select: { name: true }
        }
      },
      orderBy: [
        { startDate: 'asc' },
        { game: { name: 'asc' } }
      ]
    });

    console.log('\n📅 Pausas activas en el sistema:\n');
    for (const pause of allPauses) {
      const start = pause.startDate.toLocaleDateString('es-VE', { 
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const end = pause.endDate.toLocaleDateString('es-VE', { 
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      console.log(`  ${pause.game.name}: ${start} - ${end} (${pause.reason || 'Sin razón'})`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
createHolidayPauses()
  .then(() => {
    console.log('\n✅ Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });
