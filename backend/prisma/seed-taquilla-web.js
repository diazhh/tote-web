/**
 * Seed para crear el proveedor interno TAQUILLA_WEB
 * Este proveedor se usa para las ventas de la taquilla web
 * y mantener consistencia con el sistema de entidades de proveedores externos
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creando proveedor TAQUILLA_WEB...');

  // 1. Crear ApiSystem para TAQUILLA_WEB
  const apiSystem = await prisma.apiSystem.upsert({
    where: { name: 'TAQUILLA_WEB' },
    update: {},
    create: {
      name: 'TAQUILLA_WEB',
      description: 'Proveedor interno para ventas de taquilla web'
    }
  });
  console.log(`✅ ApiSystem creado: ${apiSystem.id} (${apiSystem.name})`);

  // 2. Crear Comercial interno
  const comercial = await prisma.providerComercial.upsert({
    where: {
      apiSystemId_externalId: {
        apiSystemId: apiSystem.id,
        externalId: 1
      }
    },
    update: {
      name: 'Taquilla Web - Comercial'
    },
    create: {
      apiSystemId: apiSystem.id,
      externalId: 1,
      name: 'Taquilla Web - Comercial'
    }
  });
  console.log(`✅ Comercial creado: ${comercial.id}`);

  // 3. Crear Banca interna
  const banca = await prisma.providerBanca.upsert({
    where: {
      comercialId_externalId: {
        comercialId: comercial.id,
        externalId: 1
      }
    },
    update: {
      name: 'Taquilla Web - Banca'
    },
    create: {
      comercialId: comercial.id,
      externalId: 1,
      name: 'Taquilla Web - Banca'
    }
  });
  console.log(`✅ Banca creada: ${banca.id}`);

  // 4. Crear Grupo interno
  const grupo = await prisma.providerGrupo.upsert({
    where: {
      bancaId_externalId: {
        bancaId: banca.id,
        externalId: 1
      }
    },
    update: {
      name: 'Taquilla Web - Grupo'
    },
    create: {
      bancaId: banca.id,
      externalId: 1,
      name: 'Taquilla Web - Grupo'
    }
  });
  console.log(`✅ Grupo creado: ${grupo.id}`);

  // 5. Crear Taquilla interna
  const taquilla = await prisma.providerTaquilla.upsert({
    where: {
      grupoId_externalId: {
        grupoId: grupo.id,
        externalId: 1
      }
    },
    update: {
      name: 'Taquilla Web - Taquilla'
    },
    create: {
      grupoId: grupo.id,
      externalId: 1,
      name: 'Taquilla Web - Taquilla'
    }
  });
  console.log(`✅ Taquilla creada: ${taquilla.id}`);

  console.log('\n📊 Resumen de entidades TAQUILLA_WEB:');
  console.log(`   ApiSystem ID: ${apiSystem.id}`);
  console.log(`   Comercial ID: ${comercial.id}`);
  console.log(`   Banca ID: ${banca.id}`);
  console.log(`   Grupo ID: ${grupo.id}`);
  console.log(`   Taquilla ID: ${taquilla.id}`);

  return {
    apiSystemId: apiSystem.id,
    comercialId: comercial.id,
    bancaId: banca.id,
    grupoId: grupo.id,
    taquillaId: taquilla.id
  };
}

main()
  .then(async (result) => {
    console.log('\n✅ Seed completado exitosamente');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error en seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

export { main as seedTaquillaWeb };
