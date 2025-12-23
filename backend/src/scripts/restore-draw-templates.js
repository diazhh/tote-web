#!/usr/bin/env node
/**
 * Script para restaurar DrawTemplates desde MySQL
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n📋 Creando DrawTemplates por defecto...\n');
  
  try {
    await createDefaultTemplates();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function createDefaultTemplates() {
  const games = await prisma.game.findMany();
  
  for (const game of games) {
    let drawTimes = [];
    let name = '';
    
    if (game.type === 'ANIMALITOS' || game.type === 'ROULETTE') {
      // Animalitos y Ruleta: 13 sorteos diarios
      drawTimes = [
        '08:00:00', '09:00:00', '10:00:00', '11:00:00',
        '12:00:00', '13:00:00', '14:00:00', '15:00:00',
        '16:00:00', '17:00:00', '18:00:00', '19:00:00', '20:00:00'
      ];
      name = `${game.name} - Diario`;
    } else if (game.type === 'TRIPLE') {
      // Triple: 12 sorteos diarios
      drawTimes = [
        '08:00:00', '09:00:00', '10:00:00', '11:00:00',
        '12:00:00', '13:00:00', '14:00:00', '15:00:00',
        '16:00:00', '17:00:00', '18:00:00', '19:00:00'
      ];
      name = `${game.name} - Diario`;
    }
    
    if (drawTimes.length > 0) {
      const existing = await prisma.drawTemplate.findFirst({
        where: {
          gameId: game.id,
          name: name
        }
      });
      
      if (!existing) {
        await prisma.drawTemplate.create({
          data: {
            gameId: game.id,
            name: name,
            description: `Plantilla diaria para ${game.name}`,
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7], // Todos los días
            drawTimes: drawTimes,
            isActive: true
          }
        });
        
        console.log(`  ✓ Creada plantilla por defecto: ${name}`);
      }
    }
  }
  
  console.log('\n✅ Plantillas por defecto creadas\n');
}

main();
