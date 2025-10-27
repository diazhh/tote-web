/**
 * Script para generar sorteos del día actual manualmente
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Generando sorteos para hoy...\n');

  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Lunes, 7=Domingo
  
  console.log(`📅 Día de la semana: ${dayOfWeek} (${getDayName(dayOfWeek)})`);

  // Obtener plantillas activas para este día
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

  console.log(`\n📋 Encontradas ${templates.length} plantillas activas\n`);

  let totalCreated = 0;

  for (const template of templates) {
    console.log(`\n🎮 Procesando: ${template.game.name}`);
    console.log(`   Plantilla: ${template.name}`);
    console.log(`   Horarios: ${template.drawTimes.length}`);

    for (const time of template.drawTimes) {
      // Crear fecha/hora del sorteo
      const [hours, minutes] = time.split(':');
      const scheduledAt = new Date(today);
      scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Verificar si ya existe un sorteo para esta hora
      const existing = await prisma.draw.findFirst({
        where: {
          gameId: template.gameId,
          scheduledAt: scheduledAt
        }
      });

      if (existing) {
        console.log(`   ⏭️  ${time} - Ya existe`);
        continue;
      }

      // Crear el sorteo
      await prisma.draw.create({
        data: {
          gameId: template.gameId,
          templateId: template.id,
          scheduledAt: scheduledAt,
          status: 'SCHEDULED'
        }
      });

      totalCreated++;
      console.log(`   ✅ ${time} - Creado`);
    }
  }

  console.log(`\n✅ Generación completada!`);
  console.log(`   Total de sorteos creados: ${totalCreated}`);
}

function getDayName(day) {
  const days = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  return days[day];
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
