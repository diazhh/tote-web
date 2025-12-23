import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';

async function main() {
  try {
    const templates = await prisma.drawTemplate.findMany({
      where: { isActive: true },
      include: { game: true }
    });
    
    console.log(`\nPlantillas activas: ${templates.length}\n`);
    
    templates.forEach(t => {
      console.log(`${t.game.name}:`);
      console.log(`  Estructura:`, JSON.stringify(t, null, 2));
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
