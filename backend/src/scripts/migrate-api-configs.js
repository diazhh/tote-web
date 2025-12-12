/**
 * Script para migrar configuraciones de API desde MySQL a PostgreSQL
 */

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const mysqlConfig = {
  host: process.env.LEGACY_DB_HOST || '144.126.150.120',
  port: parseInt(process.env.LEGACY_DB_PORT || '3706'),
  user: process.env.LEGACY_DB_USER || 'diazhh',
  password: process.env.LEGACY_DB_PASSWORD || 'Telecom2025*',
  database: process.env.LEGACY_DB_NAME || 'bot',
};

async function main() {
  console.log('🔄 Migrando configuraciones de API desde MySQL...\n');

  const connection = await mysql.createConnection(mysqlConfig);
  console.log('✅ Conectado a MySQL\n');

  try {
    // Obtener mapeo de juegos
    const games = await prisma.game.findMany();
    const gameIdMap = new Map();
    
    for (const game of games) {
      const legacyId = game.config?.legacyId;
      if (legacyId) {
        gameIdMap.set(legacyId, game.id);
      }
    }

    // Migrar api_systems
    console.log('📦 Migrando sistemas API...');
    const [systems] = await connection.query('SELECT * FROM api_systems');
    
    for (const sys of systems) {
      await prisma.apiSystem.upsert({
        where: { id: sys.id.toString() },
        update: {
          name: sys.name,
          description: sys.description,
        },
        create: {
          id: sys.id.toString(),
          name: sys.name,
          description: sys.description,
        },
      });
      console.log(`  ✓ ${sys.name}`);
    }

    // Migrar api_configurations
    console.log('\n📦 Migrando configuraciones API...');
    const [configs] = await connection.query('SELECT * FROM api_configurations');
    
    for (const cfg of configs) {
      const newGameId = gameIdMap.get(cfg.game_id);
      if (!newGameId) {
        console.warn(`  ⚠️  Game ID ${cfg.game_id} no encontrado, saltando ${cfg.name}`);
        continue;
      }

      // Mapear tipo
      const typeMap = {
        'planificacion': 'PLANNING',
        'ventas': 'SALES',
      };

      await prisma.apiConfiguration.upsert({
        where: { id: cfg.id.toString() },
        update: {
          name: cfg.name,
          baseUrl: cfg.base_url,
          token: cfg.token,
          type: typeMap[cfg.type] || 'PLANNING',
          isActive: true,
        },
        create: {
          id: cfg.id.toString(),
          name: cfg.name,
          apiSystemId: cfg.api_system_id.toString(),
          gameId: newGameId,
          baseUrl: cfg.base_url,
          token: cfg.token,
          type: typeMap[cfg.type] || 'PLANNING',
          isActive: true,
        },
      });
      console.log(`  ✓ ${cfg.name} (${cfg.type})`);
    }

    console.log('\n✅ Migración de configuraciones API completada');

  } finally {
    await connection.end();
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
