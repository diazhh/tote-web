#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import syncApiPlanningJob from './src/jobs/sync-api-planning.job.js';
import { prisma } from './src/lib/prisma.js';

async function main() {
  try {
    console.log('🚀 Ejecutando job de sincronización con SRQ...\n');
    
    const result = await syncApiPlanningJob.execute();
    
    console.log('\n📊 Verificando mappings creados...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: today
      },
      include: {
        game: true,
        apiMappings: true
      },
      orderBy: { drawTime: 'asc' }
    });
    
    const withMapping = draws.filter(d => d.apiMappings.length > 0).length;
    const withoutMapping = draws.filter(d => d.apiMappings.length === 0).length;
    
    console.log(`\n✅ Total sorteos: ${draws.length}`);
    console.log(`   Con mapping SRQ: ${withMapping}`);
    console.log(`   Sin mapping: ${withoutMapping}\n`);
    
    if (withoutMapping > 0) {
      console.log('⚠️  Sorteos sin mapping:');
      draws.filter(d => d.apiMappings.length === 0).forEach(d => {
        console.log(`   - ${d.game.name} ${d.drawTime}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
