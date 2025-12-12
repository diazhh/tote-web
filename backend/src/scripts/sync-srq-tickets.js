/**
 * Script para sincronizar jugadas de SRQ manualmente
 * Uso: node src/scripts/sync-srq-tickets.js [drawId]
 * Si no se pasa drawId, sincroniza todos los sorteos de hoy que tengan mapping
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma.js';
import { srqService } from '../services/srq.service.js';
import { startOfDay, endOfDay } from 'date-fns';

async function main() {
  const drawIdArg = process.argv[2];

  console.log('🎫 Sincronizando jugadas de SRQ...\n');

  try {
    if (drawIdArg) {
      // Sincronizar un sorteo específico
      const result = await srqService.syncTickets(drawIdArg);
      console.log('\n=== Resultado ===');
      console.log(`Sorteo: ${result.drawId}`);
      console.log(`ID externo: ${result.externalDrawId}`);
      console.log(`Total jugadas: ${result.totalTickets}`);
      console.log(`Números únicos: ${result.uniqueNumbers}`);
      console.log(`Guardados: ${result.saved}`);
    } else {
      // Sincronizar todos los sorteos de hoy con mapping
      const today = new Date();
      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: startOfDay(today),
            lte: endOfDay(today),
          },
          apiMappings: {
            some: {},
          },
        },
        include: {
          game: true,
          apiMappings: true,
        },
        orderBy: { scheduledAt: 'asc' },
      });

      console.log(`Encontrados ${draws.length} sorteos de hoy con mapping\n`);

      let success = 0;
      let errors = 0;

      for (const draw of draws) {
        try {
          console.log(`\n📊 ${draw.game.name} - ${draw.scheduledAt.toLocaleTimeString()}`);
          const result = await srqService.syncTickets(draw.id);
          console.log(`   ✓ ${result.totalTickets} jugadas, ${result.saved} números guardados`);
          success++;
        } catch (error) {
          console.log(`   ✗ Error: ${error.message}`);
          errors++;
        }
      }

      console.log('\n=== Resumen ===');
      console.log(`Exitosos: ${success}`);
      console.log(`Errores: ${errors}`);
    }

    console.log('\n✅ Sincronización completada');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
