import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de proveedores...');

  // Crear o actualizar sistema SRQ
  let srqSystem = await prisma.apiSystem.findFirst({
    where: { name: 'SRQ' }
  });

  if (srqSystem) {
    srqSystem = await prisma.apiSystem.update({
      where: { id: srqSystem.id },
      data: {
        description: 'Sistema RQ - Proveedor de ventas externas'
      }
    });
    console.log(`✅ Sistema API actualizado: ${srqSystem.name} (${srqSystem.id})`);
  } else {
    srqSystem = await prisma.apiSystem.create({
      data: {
        name: 'SRQ',
        description: 'Sistema RQ - Proveedor de ventas externas'
      }
    });
    console.log(`✅ Sistema API creado: ${srqSystem.name} (${srqSystem.id})`);
  }

  // Obtener todos los juegos
  const games = await prisma.game.findMany({
    orderBy: { name: 'asc' }
  });

  console.log(`📊 Juegos encontrados: ${games.length}`);

  // Token de SRQ (según documentación)
  const srqToken = '883124a2d52127a67e2922755331b164028372724373643d9da5a9db3f8de30a';

  // Crear configuraciones para cada juego
  for (const game of games) {
    // Configuración de Planificación
    const existingPlanning = await prisma.apiConfiguration.findFirst({
      where: {
        apiSystemId: srqSystem.id,
        gameId: game.id,
        type: 'PLANNING'
      }
    });

    if (existingPlanning) {
      await prisma.apiConfiguration.update({
        where: { id: existingPlanning.id },
        data: {
          name: `SRQ Planificación ${game.name}`,
          baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/loteries?date=',
          token: srqToken,
          isActive: true
        }
      });
      console.log(`  ✅ Configuración PLANNING actualizada: ${game.name}`);
    } else {
      await prisma.apiConfiguration.create({
        data: {
          name: `SRQ Planificación ${game.name}`,
          apiSystemId: srqSystem.id,
          gameId: game.id,
          type: 'PLANNING',
          baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/loteries?date=',
          token: srqToken,
          isActive: true
        }
      });
      console.log(`  ✅ Configuración PLANNING creada: ${game.name}`);
    }

    // Configuración de Ventas
    const existingSales = await prisma.apiConfiguration.findFirst({
      where: {
        apiSystemId: srqSystem.id,
        gameId: game.id,
        type: 'SALES'
      }
    });

    if (existingSales) {
      await prisma.apiConfiguration.update({
        where: { id: existingSales.id },
        data: {
          name: `SRQ Ventas ${game.name}`,
          baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/tickets/',
          token: srqToken,
          isActive: true
        }
      });
      console.log(`  ✅ Configuración SALES actualizada: ${game.name}`);
    } else {
      await prisma.apiConfiguration.create({
        data: {
          name: `SRQ Ventas ${game.name}`,
          apiSystemId: srqSystem.id,
          gameId: game.id,
          type: 'SALES',
          baseUrl: 'https://api2.sistemasrq.com/externalapi/operator/tickets/',
          token: srqToken,
          isActive: true
        }
      });
      console.log(`  ✅ Configuración SALES creada: ${game.name}`);
    }
  }

  console.log('\n✅ Seed de proveedores completado exitosamente');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
