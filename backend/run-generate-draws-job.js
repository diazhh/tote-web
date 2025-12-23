#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import generateDailyDrawsJob from './src/jobs/generate-daily-draws.job.js';
import { prisma } from './src/lib/prisma.js';

async function main() {
  try {
    console.log('🚀 Ejecutando job de generación de sorteos diarios...\n');
    
    await generateDailyDrawsJob.execute();
    
    console.log('\n📊 Verificando sorteos creados...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: today
      },
      include: {
        game: true
      },
      orderBy: { drawTime: 'asc' }
    });
    
    console.log(`\n✅ Total sorteos para hoy: ${draws.length}\n`);
    
    const byGame = {};
    draws.forEach(d => {
      if (!byGame[d.game.name]) byGame[d.game.name] = 0;
      byGame[d.game.name]++;
    });
    
    Object.entries(byGame).forEach(([game, count]) => {
      console.log(`   ${game}: ${count} sorteos`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
