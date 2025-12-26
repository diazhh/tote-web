#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetTodayDraws() {
  try {
    console.log('🔄 Iniciando reinicio de sorteos del 25/12/2025...');

    // Usar Date.UTC para evitar problemas de zona horaria
    const targetDate = new Date(Date.UTC(2025, 11, 25, 0, 0, 0, 0));
    
    console.log(`📅 Fecha objetivo: ${targetDate.toISOString().split('T')[0]}`);

    // 1. Eliminar sorteos existentes de hoy y ayer (por si quedaron mal)
    const deleted = await prisma.draw.deleteMany({
      where: {
        OR: [
          { drawDate: targetDate },
          { drawDate: new Date(Date.UTC(2025, 11, 24, 0, 0, 0, 0)) }
        ]
      }
    });

    console.log(`🗑️  Sorteos eliminados: ${deleted.count}`);

    // 2. Obtener plantillas activas para miércoles (día 3)
    const dayOfWeek = 3; // Miércoles
    const templates = await prisma.drawTemplate.findMany({
      where: {
        isActive: true,
        daysOfWeek: {
          has: dayOfWeek
        }
      },
      include: {
        game: true
      }
    });

    console.log(`📋 Plantillas activas encontradas: ${templates.length}`);

    let createdCount = 0;

    // 3. Crear sorteos para cada plantilla
    for (const template of templates) {
      console.log(`\n🎮 Procesando: ${template.game.name}`);
      console.log(`   Horarios: ${template.drawTimes.join(', ')}`);

      for (const time of template.drawTimes) {
        // Crear fecha/hora combinada para scheduledAt usando UTC
        const [hours, minutes] = time.split(':');
        const scheduledAt = new Date(Date.UTC(2025, 11, 25, parseInt(hours), parseInt(minutes), 0));

        const draw = await prisma.draw.create({
          data: {
            gameId: template.gameId,
            templateId: template.id,
            drawDate: targetDate,
            drawTime: time,
            scheduledAt: scheduledAt,
            status: 'SCHEDULED'
          }
        });

        createdCount++;
        console.log(`   ✅ Creado: ${time}`);
      }
    }

    console.log(`\n✅ Proceso completado:`);
    console.log(`   - Sorteos eliminados: ${deleted.count}`);
    console.log(`   - Sorteos creados: ${createdCount}`);

    // 4. Verificar sorteos creados
    const verification = await prisma.draw.findMany({
      where: {
        drawDate: targetDate
      },
      include: {
        game: true
      },
      orderBy: [
        { drawTime: 'asc' }
      ]
    });

    console.log(`\n📊 Verificación final:`);
    console.log(`   Total de sorteos: ${verification.length}`);
    console.log(`   Primera hora: ${verification[0]?.drawTime}`);
    console.log(`   Última hora: ${verification[verification.length - 1]?.drawTime}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetTodayDraws()
  .then(() => {
    console.log('\n✅ Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script finalizado con errores:', error);
    process.exit(1);
  });
