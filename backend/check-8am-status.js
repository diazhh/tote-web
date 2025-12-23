#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';

async function main() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: today,
        drawTime: '08:00:00'
      },
      include: {
        game: true,
        preselectedItem: true,
        tickets: {
          include: {
            details: true
          }
        }
      }
    });
    
    console.log(`\n📊 Sorteos de 8am - Estado Actual\n`);
    console.log('='.repeat(60));
    
    for (const draw of draws) {
      const totalTickets = draw.tickets.length;
      const totalJugadas = draw.tickets.reduce((sum, t) => sum + t.details.length, 0);
      const totalMonto = draw.tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
      
      console.log(`\n🎮 ${draw.game.name}`);
      console.log(`   Status: ${draw.status}`);
      console.log(`   Cerrado: ${draw.closedAt ? draw.closedAt.toLocaleString('es-VE', { timeZone: 'America/Caracas' }) : 'No'}`);
      console.log(`   Pre-ganador: ${draw.preselectedItem ? `${draw.preselectedItem.number} - ${draw.preselectedItem.name}` : 'No seleccionado'}`);
      console.log(`   Tickets: ${totalTickets}`);
      console.log(`   Jugadas: ${totalJugadas}`);
      console.log(`   Monto total: $${totalMonto.toFixed(2)}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
