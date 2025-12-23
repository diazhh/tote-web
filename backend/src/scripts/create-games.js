#!/usr/bin/env node
/**
 * Script para crear juegos y sus items
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n🎮 Creando juegos y sus items...\n');
  
  try {
    // 1. LOTOANIMALITO
    console.log('1. Creando LOTOANIMALITO...');
    const lotoanimalito = await prisma.game.upsert({
      where: { slug: 'lotoanimalito' },
      update: {},
      create: {
        name: 'LOTOANIMALITO',
        slug: 'lotoanimalito',
        type: 'ANIMALITOS',
        totalNumbers: 38,
        isActive: true,
        description: 'Lotería de animalitos'
      }
    });
    
    // Items de animalitos (00-37)
    const animalitos = [
      { number: '00', name: 'BALLENA' }, { number: '01', name: 'CARNERO' },
      { number: '02', name: 'TORO' }, { number: '03', name: 'CIEMPIES' },
      { number: '04', name: 'ALACRÁN' }, { number: '05', name: 'LEÓN' },
      { number: '06', name: 'RANA' }, { number: '07', name: 'PERICO' },
      { number: '08', name: 'RATÓN' }, { number: '09', name: 'ÁGUILA' },
      { number: '10', name: 'TIGRE' }, { number: '11', name: 'GATO' },
      { number: '12', name: 'CABALLO' }, { number: '13', name: 'MONO' },
      { number: '14', name: 'PALOMA' }, { number: '15', name: 'ZORRO' },
      { number: '16', name: 'OSO' }, { number: '17', name: 'PAVO' },
      { number: '18', name: 'BURRO' }, { number: '19', name: 'CHIVO' },
      { number: '20', name: 'COCHINO' }, { number: '21', name: 'GALLO' },
      { number: '22', name: 'CAMELLO' }, { number: '23', name: 'CEBRA' },
      { number: '24', name: 'IGUANA' }, { number: '25', name: 'GALLINA' },
      { number: '26', name: 'VACA' }, { number: '27', name: 'PERRO' },
      { number: '28', name: 'ZAMURO' }, { number: '29', name: 'ELEFANTE' },
      { number: '30', name: 'CAIMÁN' }, { number: '31', name: 'LAPA' },
      { number: '32', name: 'ARDILLA' }, { number: '33', name: 'PESCADO' },
      { number: '34', name: 'VENADO' }, { number: '35', name: 'JIRAFA' },
      { number: '36', name: 'CULEBRA' }, { number: '37', name: 'DELFÍN' }
    ];
    
    for (let i = 0; i < animalitos.length; i++) {
      await prisma.gameItem.upsert({
        where: {
          gameId_number: {
            gameId: lotoanimalito.id,
            number: animalitos[i].number
          }
        },
        update: {},
        create: {
          gameId: lotoanimalito.id,
          number: animalitos[i].number,
          name: animalitos[i].name,
          displayOrder: i,
          multiplier: 30.00
        }
      });
    }
    console.log(`   ✓ ${animalitos.length} items creados`);
    
    // 2. LOTTOPANTERA
    console.log('2. Creando LOTTOPANTERA...');
    const lottopantera = await prisma.game.upsert({
      where: { slug: 'lottopantera' },
      update: {},
      create: {
        name: 'LOTTOPANTERA',
        slug: 'lottopantera',
        type: 'ROULETTE',
        totalNumbers: 38,
        isActive: true,
        description: 'Ruleta de números'
      }
    });
    
    // Items de ruleta (00-36)
    for (let i = 0; i <= 36; i++) {
      const number = String(i).padStart(2, '0');
      await prisma.gameItem.upsert({
        where: {
          gameId_number: {
            gameId: lottopantera.id,
            number: number
          }
        },
        update: {},
        create: {
          gameId: lottopantera.id,
          number: number,
          name: number,
          displayOrder: i,
          multiplier: 30.00
        }
      });
    }
    console.log(`   ✓ 37 items creados`);
    
    // 3. TRIPLE PANTERA
    console.log('3. Creando TRIPLE PANTERA...');
    const triplePantera = await prisma.game.upsert({
      where: { slug: 'triple-pantera' },
      update: {},
      create: {
        name: 'TRIPLE PANTERA',
        slug: 'triple-pantera',
        type: 'TRIPLE',
        totalNumbers: 1000,
        isActive: true,
        description: 'Triple de 3 dígitos'
      }
    });
    
    // Items de triple (000-999)
    for (let i = 0; i < 1000; i++) {
      const number = String(i).padStart(3, '0');
      await prisma.gameItem.upsert({
        where: {
          gameId_number: {
            gameId: triplePantera.id,
            number: number
          }
        },
        update: {},
        create: {
          gameId: triplePantera.id,
          number: number,
          name: number,
          displayOrder: i,
          multiplier: 500.00
        }
      });
    }
    console.log(`   ✓ 1000 items creados`);
    
    console.log('\n✅ Juegos e items creados exitosamente\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
