/**
 * Seed inicial del módulo Changelog.
 *
 * Crea las entradas históricas correspondientes al batch trabajado en
 * 2026-05-22. Idempotente: cada entrada usa `upsert` por título.
 *
 * Uso:
 *   node src/scripts/seed-changelog.mjs
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

const ENTRIES = [
  {
    title: 'Auditoría P&L Semanal vs Reportes Contables',
    category: 'FIX',
    publishedAt: '2026-05-22T12:00:00.000Z',
    description:
`Se identificó y corrigió que P&L Semanal subcontaba ventas SRQ.

Causa: el agregador de DrawFinancial filtraba estrictamente por TicketDetail.drawId, descartando filas con drawId NULL cuyo Ticket.drawId sí apuntaba al sorteo (114 filas en la última semana auditada = 1.180 Bs perdidos).

Acción: el agregado ahora incluye filas con drawId NULL cuyo ticket padre coincide con el draw. Mismo patrón que prize-processor.

También se documentó que reportes y P&L usan ventanas semanales distintas (drawDate vs drawnAt). Cuando un sorteo se ejecuta tarde, queda atribuido a semanas distintas en cada vista.`,
  },
  {
    title: 'Corrección multiplicador 000 en TRIPLE PANTERA',
    category: 'FIX',
    publishedAt: '2026-05-22T12:30:00.000Z',
    description:
`Los números que terminan en "00" (100, 200, …, 900) usan multiplicador x1000. El "000" estaba marcado incorrectamente con el mismo multiplicador especial, cuando debe usar el multiplicador base (600).

Ahora la regla excluye explícitamente el 000.`,
  },
  {
    title: 'Buscador por nombre en Reporte de Tickets',
    category: 'FEATURE',
    publishedAt: '2026-05-22T13:00:00.000Z',
    description:
`En /admin/tickets-report se agregó un campo "Jugador" en los filtros que busca por:
- Usuario (username)
- Email
- ID externo del ticket (SRQ / Webhook / Scrape)

La búsqueda es insensible a mayúsculas y se aplica con un debounce de 300ms. El nombre del usuario también aparece debajo del número de ticket en la lista.`,
  },
  {
    title: 'Bloquear números aún sin jugadas en Monitor',
    category: 'FEATURE',
    publishedAt: '2026-05-22T13:30:00.000Z',
    description:
`En la pestaña "Números" del Monitor se agregó el botón "Bloquear número" que abre un modal con todos los items del juego (incluso los que no tienen jugadas).

Para cada número se puede:
- Bloquear (cupo = 0): rechaza cualquier venta nueva al item.
- Asignar un cupo personalizado (>0): permite vender hasta ese tope.
- Liberar: elimina el cupo configurado.

Antes solo se podía configurar cupo sobre items que ya tenían jugadas registradas.`,
  },
  {
    title: 'Nuevo módulo: Fiscalizador',
    category: 'FEATURE',
    publishedAt: '2026-05-22T15:00:00.000Z',
    description:
`Nuevo rol "FISCALIZADOR" con acceso restringido. Al crear el usuario se le define:
- A qué juegos tiene acceso (puede ser uno, varios o todos).
- A qué proveedores tiene acceso (uno, varios o todos).
- Si incluye o no Taquilla Online (tickets sin proveedor).

El fiscalizador entra y solo ve un reporte sencillo con Ventas, Premios y Utilidad por fecha y juego, restringido a lo que se le asignó. No tiene acceso al panel administrativo.

Página dedicada: /fiscalizar. Login redirige automáticamente.`,
  },
  {
    title: 'Modal de Tickets por número: venta del item + responsive',
    category: 'IMPROVEMENT',
    publishedAt: '2026-05-22T16:00:00.000Z',
    description:
`En el Monitor, al ver los tickets que involucran un número, ahora se muestra el monto jugado específicamente a ese número (no solo el total del ticket completo).

En desktop: nueva columna "Venta al #" en verde como dato primario; el total del ticket aparece secundario en gris.

En mobile: el modal pasó de tabla a cards verticales con el monto del item destacado.`,
  },
  {
    title: 'Reportes: widgets en una columna en mobile',
    category: 'IMPROVEMENT',
    publishedAt: '2026-05-22T16:15:00.000Z',
    description:
`Los 5 widgets de resumen (Ventas, Premios, Comisiones, Bruto, Neto) en /admin/reportes se veían apretados a 2 columnas en mobile y los montos se truncaban.

Ahora ocupan una fila cada uno en mobile. En tablet (≥sm) siguen en 3 columnas y en desktop (≥lg) en 5.`,
  },
  {
    title: 'Módulo de Novedades',
    category: 'FEATURE',
    publishedAt: '2026-05-22T17:00:00.000Z',
    description:
`Nuevo módulo /admin/changelog accesible desde el menú lateral con el ícono ✨.

Sirve como bitácora de cambios del sistema. Solo los administradores pueden crear, editar o eliminar entradas; el resto del staff (operador, taquilla admin) las puede leer.

El menú muestra un badge rojo con el número de entradas nuevas desde la última vez que visitaste la página.`,
  },
];

async function main() {
  console.log('🌱 Seeding changelog...\n');
  let created = 0;
  let skipped = 0;

  for (const entry of ENTRIES) {
    const existing = await prisma.changelogEntry.findFirst({
      where: { title: entry.title },
    });
    if (existing) {
      console.log(`  ↪ ya existe: "${entry.title}"`);
      skipped++;
      continue;
    }
    await prisma.changelogEntry.create({
      data: {
        title: entry.title,
        description: entry.description,
        category: entry.category,
        publishedAt: new Date(entry.publishedAt),
        isPublished: true,
      },
    });
    console.log(`  ✓ creada: "${entry.title}"`);
    created++;
  }

  console.log(`\n✅ Hecho: ${created} creada(s), ${skipped} omitida(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
