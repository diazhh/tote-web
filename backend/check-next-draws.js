#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';

async function main() {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    console.log(`\n⏰ Hora actual: ${now.toLocaleString('es-VE', { timeZone: 'America/Caracas' })}\n`);
    
    const draws = await prisma.draw.findMany({
      where: {
        scheduledAt: {
          gte: now,
          lte: oneHourFromNow
        },
        status: 'SCHEDULED'
      },
      include: {
        game: true,
        apiMappings: true,
        tickets: true
      },
      orderBy: { scheduledAt: 'asc' }
    });
    
    console.log(`📊 Sorteos próximos (siguiente hora): ${draws.length}\n`);
    console.log('='.repeat(70));
    
    for (const draw of draws) {
      const minutesUntilDraw = Math.floor((draw.scheduledAt - now) / (1000 * 60));
      const minutesUntilClose = minutesUntilDraw - 5;
      
      const hora = draw.scheduledAt.toLocaleTimeString('es-VE', { 
        timeZone: 'America/Caracas', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      console.log(`\n🎮 ${draw.game.name} - ${hora}`);
      console.log(`   ID: ${draw.id}`);
      console.log(`   Status: ${draw.status}`);
      console.log(`   Cierra en: ${minutesUntilClose} minutos`);
      console.log(`   Se ejecuta en: ${minutesUntilDraw} minutos`);
      console.log(`   Mapping SRQ: ${draw.apiMappings.length > 0 ? '✅' : '❌'}`);
      console.log(`   Tickets actuales: ${draw.tickets.length}`);
      
      if (draw.apiMappings.length > 0) {
        console.log(`   External ID: ${draw.apiMappings[0].externalDrawId}`);
      }
    }
    
    console.log('\n' + '='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
