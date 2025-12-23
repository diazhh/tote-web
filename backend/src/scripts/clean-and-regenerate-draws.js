/**
 * Script para limpiar sorteos duplicados/migrados incorrectamente
 * y regenerar sorteos limpios para hoy
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { 
  now, 
  getDayOfWeek, 
  timeStringToDate,
  formatDateTime,
  formatDateOnly
} from '../lib/dateUtils.js';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando base de datos...\n');

  // 1. Eliminar TODOS los sorteos
  console.log('Eliminando todos los sorteos...');
  const deleted = await prisma.draw.deleteMany({});
  console.log(`✅ ${deleted.count} sorteos eliminados\n`);

  // 2. Generar sorteos para hoy (en zona horaria de Caracas)
  console.log('📅 Generando sorteos para hoy...\n');

  const today = now();
  const dayOfWeek = getDayOfWeek(today);
  
  console.log(`Día de la semana: ${dayOfWeek} (${getDayName(dayOfWeek)})`);
  console.log(`Fecha: ${formatCaracasDate(today)}\n`);

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

  console.log(`Encontradas ${templates.length} plantillas activas\n`);

  let totalCreated = 0;
  const createdDraws = [];

  for (const template of templates) {
    console.log(`🎮 ${template.game.name}`);
    console.log(`   Plantilla: ${template.name}`);
    console.log(`   Horarios: ${template.drawTimes.length}`);

    for (const time of template.drawTimes) {
      // Crear fecha/hora del sorteo
      const scheduledAt = timeStringToDate(today, time);

      // Crear el sorteo
      const draw = await prisma.draw.create({
        data: {
          gameId: template.gameId,
          templateId: template.id,
          scheduledAt: scheduledAt,
          status: 'SCHEDULED'
        }
      });

      createdDraws.push({
        game: template.game.name,
        time: time,
        scheduledAt: scheduledAt
      });

      totalCreated++;
    }
    console.log(`   ✅ ${template.drawTimes.length} sorteos creados\n`);
  }

  console.log(`\n✅ Generación completada!`);
  console.log(`   Total de sorteos creados: ${totalCreated}\n`);

  // Mostrar resumen por juego
  console.log('📊 Resumen por juego:');
  const summary = createdDraws.reduce((acc, draw) => {
    if (!acc[draw.game]) acc[draw.game] = [];
    acc[draw.game].push(draw.time);
    return acc;
  }, {});

  for (const [game, times] of Object.entries(summary)) {
    console.log(`\n${game}:`);
    console.log(`  Horarios: ${times.sort().join(', ')}`);
    console.log(`  Total: ${times.length} sorteos`);
  }

  // Verificar que no hay duplicados
  console.log('\n🔍 Verificando duplicados...');
  const duplicateCheck = await prisma.$queryRaw`
    SELECT 
      "gameId",
      "scheduledAt",
      COUNT(*) as count
    FROM "Draw"
    GROUP BY "gameId", "scheduledAt"
    HAVING COUNT(*) > 1
  `;

  if (duplicateCheck.length > 0) {
    console.log(`❌ Se encontraron ${duplicateCheck.length} duplicados!`);
    console.log(duplicateCheck);
  } else {
    console.log('✅ No hay duplicados');
  }
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
