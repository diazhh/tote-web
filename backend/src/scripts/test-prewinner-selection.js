/**
 * Script para probar la selección de pre-ganadores
 * Uso: node src/scripts/test-prewinner-selection.js [drawId]
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import { startOfDay, endOfDay } from 'date-fns';

async function main() {
  const drawId = process.argv[2];

  if (drawId) {
    // Probar para un sorteo específico
    console.log(`🎯 Probando selección de pre-ganador para sorteo ${drawId}...\n`);
    
    const result = await prewinnerSelectionService.selectPrewinner(drawId);
    
    if (result) {
      console.log('\n✅ Pre-ganador seleccionado:');
      console.log(`   Número: ${result.number}`);
      console.log(`   Nombre: ${result.name}`);
      console.log(`   Multiplicador: ${result.multiplier}`);
    } else {
      console.log('\n❌ No se pudo seleccionar pre-ganador');
    }
  } else {
    // Mostrar sorteos de hoy con tickets
    console.log('🎯 Sorteos de hoy con tickets importados:\n');
    
    const today = new Date();
    const draws = await prisma.draw.findMany({
      where: {
        scheduledAt: {
          gte: startOfDay(today),
          lte: endOfDay(today)
        },
        apiMappings: {
          some: {}
        }
      },
      include: {
        game: true,
        preselectedItem: true,
        apiMappings: {
          include: {
            tickets: true
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    if (draws.length === 0) {
      console.log('No hay sorteos con tickets hoy.');
      console.log('\nUso: node src/scripts/test-prewinner-selection.js <drawId>');
      process.exit(0);
    }

    console.log('ID                                   | Hora  | Juego           | Tickets | Pre-ganador');
    console.log('-'.repeat(90));

    for (const draw of draws) {
      const ticketCount = draw.apiMappings.reduce((sum, m) => sum + m.tickets.length, 0);
      const prewinner = draw.preselectedItem 
        ? `${draw.preselectedItem.number} (${draw.preselectedItem.name})`
        : '-';
      
      const time = draw.scheduledAt.toLocaleTimeString('es-VE', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });

      console.log(
        `${draw.id} | ${time.padEnd(5)} | ${draw.game.name.padEnd(15)} | ${String(ticketCount).padStart(7)} | ${prewinner}`
      );
    }

    console.log('\n📌 Para probar un sorteo específico:');
    console.log('   node src/scripts/test-prewinner-selection.js <drawId>');
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
