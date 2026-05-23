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
  {
    title: 'Maxplay: scrape solo en último ciclo + alerta Telegram',
    category: 'IMPROVEMENT',
    publishedAt: '2026-05-23T14:15:00.000Z',
    description:
`El scraper de Maxplay corría cada 5 minutos durante 1 hora antes del cierre de cada sorteo — 12 llamadas por sorteo. Ahora corre una sola vez, en los 5 minutos previos al cierre (el "último ciclo"). 83% menos requests al dashboard de Maxplay.

Motivación: desde 2026-05-22 cada login fresh requiere resolver Cloudflare Turnstile vía 2captcha (~$0.003 cada uno). Menos llamadas = menos costo + menos probabilidad de que CF endurezca más la detección.

Como ahora hay una sola oportunidad por sorteo, cualquier fallo es operacionalmente crítico. Por eso si el scrape falla, se envía una alerta inmediata por Telegram a todos los admins del juego con: juego, hora del sorteo, razón del fallo, y dónde revisar (saldo 2captcha, pm2 logs, debug dumps).`,
  },
  {
    title: 'Reportes: filtro por SRQ ahora muestra solo SRQ',
    category: 'FIX',
    publishedAt: '2026-05-22T21:30:00.000Z',
    description:
`En /admin/reportes, al filtrar por SRQ, antes se devolvían los sorteos correctamente pero los totales (ventas, premios, comisiones) eran los del sorteo COMPLETO — sumando todas las fuentes — en vez de solo la porción de SRQ.

Causa: el path materializado del reporte tenía un branch que sobrescribía los totales con DrawFinancialProvider solo para proveedores PUSH (premier, virtuales) y SCRAPE (Maxplay), saltándose los PULL (SRQ). Por eso para los otros proveedores el filtro sí funcionaba bien.

Ahora cualquier filtro por apiSystem aplica el slice del proveedor, independientemente del mode.`,
  },
  {
    title: 'Comisiones: fórmula cascada SALES_AND_UTILITY_PCT',
    category: 'BREAKING',
    publishedAt: '2026-05-22T20:30:00.000Z',
    description:
`Se cambió cómo se calcula la comisión de los proveedores cuyo contrato usa "porcentaje sobre venta + porcentaje sobre ganancia" (SRQ, premier, Maxplay).

Modelo anterior (independiente):
  comisión = ventas × %venta + (ventas − premios) × %ganancia

Modelo nuevo (cascada):
  paso 1: comisiónVenta    = ventas × %venta
  paso 2: baseUtilidad     = ventas − comisiónVenta − premios
  paso 3: comisiónUtilidad = baseUtilidad × %ganancia
  total  = comisiónVenta + comisiónUtilidad

Por qué: la "ganancia" sobre la que aplica el % se interpreta correctamente como lo que queda después de pagar la comisión sobre la venta — no la utilidad bruta.

Ejemplo (venta 100, premios 50, 15% venta, 35% ganancia):
  • Antes:  15 + (50)×35% = 15 + 17.50 = 32.50  → casa neto 17.50
  • Ahora:  15 + (35)×35% = 15 + 12.25 = 27.25  → casa neto 22.75

Qué cambia visible:
  • Comisiones mostradas en /admin/reportes y /admin/reportes/pnl-semanal.
  • Cifras del módulo Comisiones por proveedor.
  • Ventas y premios de los tickets NO se tocaron — los reportes con proveedores siguen cuadrando exactamente igual.

Histórico: se recalcularon todas las comisiones de abril y mayo (script recalculate-commissions.mjs). Los settlements DRAFT también se reescribieron. Los CONFIRMED/ADJUSTED se respetaron.

Proveedores con UTILITY_PCT puro (virtuales) y SALES_PCT puro no se ven afectados — la cascada solo aplica cuando hay dos porcentajes encadenados.`,
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
