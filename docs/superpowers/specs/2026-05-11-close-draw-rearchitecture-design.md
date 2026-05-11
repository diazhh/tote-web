# Re-arquitectura de close-draw — Diseño

**Fecha:** 2026-05-11
**Estado:** APROBADO — Listo para implementación
**Autor:** Claude + diazhh
**Implementación:** pg-boss native (no Croner)

## Motivación

El incidente del 11-mayo-2026 (TRIPLE PANTERA 08:00 → ganador 100, pérdida ~153K Bs) reveló debilidades estructurales en el flujo de cierre:

1. El cierre, la ingesta de datos, la preselección y las notificaciones corrían **dentro del mismo cron tick**, atándose con un `Promise.race` de 15s que abortaba la rama "buena" cuando el PDF/Telegram demoraban.
2. **No había coordinación** entre el sync periódico de Maxplay y el momento exacto del cierre — Maxplay seguía corriendo cuando el optimizer ya había decidido.
3. Los **webhooks no validaban estado del sorteo**: tickets que llegaban después del cierre se aceptaban silenciosamente.
4. Los **imports de SRQ y Maxplay borraban-y-recreaban** tickets en cada sync, perdiendo trazabilidad de `createdAt` y siendo peligrosos ante respuestas parciales del proveedor.

Este spec consolida la arquitectura nueva que resuelve estos cuatro problemas en conjunto, después de discusión iterativa con el usuario.

Los fixes urgentes ya desplegados (`3157db4`, `892f03d`) son defensivos pero mitigan, no eliminan, la causa raíz. Esta refactorización ataca el origen.

## Alcance

### Cambios incluidos

1. **Migración del flujo close-draw a pg-boss nativo**. Dos workers nuevos (close-and-ingest + preselect) reemplazan al cron Croner. Disparadores via `boss.schedule(...)`.
2. **Fix del `createQueue` faltante** en 6 workers críticos del `register.js` (CLOSE_DRAW + EXECUTE_DRAW + 5 step-workers) para evitar el bug latente documentado en líneas 76-86 de ese archivo.
3. **Activación de flags** `PGBOSS_CLOSE_DRAW=true` y nuevo `PGBOSS_PRESELECT=true`. El flag `PGBOSS_EXECUTE_DRAW` se queda en `false` por ahora (createQueue se arregla pero el flag no se prende).
4. **Validación de webhooks por estado del sorteo** — rechazar pushes si `Draw.status != 'SCHEDULED'`.
5. **Imports diff-based** (sin `deleteMany`) en SRQ y Maxplay, con manejo correcto de anulaciones.
6. **Relax del guard de status** en Maxplay y SRQ para permitir inserts en draws CLOSED-recientes (`closedAt < 2min`).
7. **Parámetro `allowClosed`** en los importers para que solo los flujos legítimos puedan insertar tras el cierre.
8. **Red de seguridad** en `execute-draw` (que sigue en Croner): si encuentra CLOSED sin preselect, corre `selectPrewinner` inline.
9. **Eliminación del cron Croner viejo** `close-draw.job.js` y su entrada en `jobs/index.js`.

### Fuera de alcance

- Migración de `execute-draw` a pg-boss (queda en Croner; solo recibe el fallback inline).
- Migración de los syncs periódicos (`sync-api-tickets`, `sync-scrape-tickets`) a pg-boss.
- Cambios al algoritmo del optimizer (`prewinner-optimizer.service.js`).
- Cambios al flujo de admin manual preselect via UI o Telegram (`drawService.preselectWinner`, `handleChangeResult`) — sigue intacto.
- Limpieza de PDFs históricos en disco.

## Decisiones de diseño tomadas

| Decisión | Valor |
|--|--|
| Implementación scheduler | **pg-boss nativo** (`boss.schedule()` + workers), NO Croner |
| Schedule sweep close-and-ingest | `* * * * *` via `boss.schedule(QUEUES.CLOSE_AND_INGEST_SWEEP, '* * * * *')` |
| Schedule sweep preselect | `* * * * *` via `boss.schedule(QUEUES.PRESELECT_SWEEP, '* * * * *')` |
| Ventana sweep close-and-ingest | SCHEDULED draws con `drawTime` ∈ [now+5min, now+6min] |
| Ventana sweep preselect | CLOSED draws sin preselect con `drawTime` ∈ [now+3min, now+5min] |
| SRQ en worker close-and-ingest | 2 pasadas (paralelo con Maxplay; segunda llamada después del await de Maxplay) |
| Maxplay en worker close-and-ingest | NO se invoca directamente — sigue viniendo del `sync-scrape-tickets.job.js` existente (Croner) |
| Timeout Maxplay (en su servicio) | sin cambio (90s actual via `MAXPLAY_TIMEOUT_MS`) |
| Guard de status — Maxplay | aceptar `SCHEDULED` o `CLOSED` si `closedAt > now - 120s` |
| Guard de status — SRQ sync periódico | aceptar `SCHEDULED` o `CLOSED` si `closedAt > now - 120s` |
| Webhook validation | bloquear si `status != 'SCHEDULED'` |
| Diff-based SRQ | anulados → marcar CANCELLED si existían, sino ignorar |
| Diff-based Maxplay | upsert por `externalTicketId` (no borrar) |
| Tickets WON anulados después | loguear warning, NO auto-cancelar |
| Recovery en execute-draw | si `status=CLOSED && preselectedItemId=NULL && drawTime ≤ NOW()`, llamar `selectPrewinner` inline antes de procesar |
| Env flags nuevos en `.env` | `PGBOSS_CLOSE_DRAW=true`, `PGBOSS_PRESELECT=true` |
| Env flag NO se prende | `PGBOSS_EXECUTE_DRAW` (queda en `false` aunque arreglemos createQueue) |
| Singleton key per-draw close | `close-${drawId}` previene doble close del mismo sorteo |
| Singleton key per-draw preselect | `preselect-${drawId}` previene doble preselect |

## Arquitectura

### Diagrama de flujo temporal (sorteo a las xx:00)

```
xx:50:00  sync-scrape-tickets (existente)
          → scrape Maxplay, inserta tickets [draw SCHEDULED]

xx:55:00  Cron A: close-and-ingest fires
          → atomic UPDATE Draw SET status='CLOSED' WHERE status='SCHEDULED'

          Caso A1 (preselectedItemId YA seteado por admin):
            → emit WS draw:closed con admin pick
            → notifyPrewinnerSelected (texto only)
            → continue (skip ingest, skip optimizer)

          Caso A2 (preselectedItemId IS NULL, flujo normal):
            → emit WS draw:closing
            → importSRQTickets(drawId, { allowClosed:true })  pasada #1
            → importSRQTickets(drawId, { allowClosed:true })  pasada #2 (segs después)
            → continue (NO optimizer, NO Telegram pre-winner)

xx:55:00  sync-scrape-tickets (existente) también fires
          → scrape Maxplay
          → al insertar, ve status=CLOSED con closedAt reciente → permite (guard relajado)
          → tickets de Maxplay quedan en DB para este draw

xx:55:08  sync-scrape termina (warm). Tickets insertados.

xx:56:00  Cron B: preselect fires
          Query: CLOSED && preselectedItemId IS NULL && drawTime ∈ [now+3min, now+5min]
          → selectPrewinner(drawId) [optimizer corre]
          → persiste preselectedItemId
          → emit WS draw:closed con winner
          → notifyPrewinnerSelected (texto only)

xx:00:00  execute-draw fires
          Si encuentra CLOSED && preselectedItemId IS NULL:
            → fallback inline: selectPrewinner(drawId) ahí mismo (red de seguridad)
          Luego procede normal: lee preselect, publica, totaliza premios.
```

### Estructura pg-boss

**4 queues nuevas en `queue/constants.js`:**
```js
CLOSE_AND_INGEST_SWEEP: 'close-and-ingest-sweep'   // un sweep job por minuto
CLOSE_AND_INGEST: 'close-and-ingest'               // un job por draw
PRESELECT_SWEEP: 'preselect-sweep'                 // un sweep job por minuto
PRESELECT: 'preselect'                             // un job por draw
```

**Registro en `register.js`** (siempre activos cuando los flags están on):
```js
if (process.env.PGBOSS_CLOSE_DRAW === 'true') {
  // close-and-ingest pipeline
  await boss.createQueue(QUEUES.CLOSE_AND_INGEST_SWEEP);
  await boss.createQueue(QUEUES.CLOSE_AND_INGEST);
  await boss.work(QUEUES.CLOSE_AND_INGEST_SWEEP, closeAndIngestSweepWorker);
  await boss.work(QUEUES.CLOSE_AND_INGEST, { teamSize: 4, teamConcurrency: 4 }, closeAndIngestWorker);
  await boss.schedule(QUEUES.CLOSE_AND_INGEST_SWEEP, '* * * * *', {}, { tz: 'America/Caracas' });
}

if (process.env.PGBOSS_PRESELECT === 'true') {
  await boss.createQueue(QUEUES.PRESELECT_SWEEP);
  await boss.createQueue(QUEUES.PRESELECT);
  await boss.work(QUEUES.PRESELECT_SWEEP, preselectSweepWorker);
  await boss.work(QUEUES.PRESELECT, { teamSize: 4, teamConcurrency: 4 }, preselectWorker);
  await boss.schedule(QUEUES.PRESELECT_SWEEP, '* * * * *', {}, { tz: 'America/Caracas' });
}
```

**Fix de createQueue retroactivo** para los 6 workers críticos existentes (afecta líneas 11-15 y 18-36 de `register.js`):
```js
// CLOSE_DRAW
await boss.createQueue(QUEUES.CLOSE_DRAW);  // ← agregar antes del work
await boss.work(QUEUES.CLOSE_DRAW, ...);

// EXECUTE_DRAW + 5 steps
await boss.createQueue(QUEUES.EXECUTE_DRAW);
await boss.createQueue(QUEUES.STEP_GENERATE_IMAGE);
await boss.createQueue(QUEUES.STEP_NOTIFY_ADMINS);
await boss.createQueue(QUEUES.STEP_PUBLISH_DRAW);
await boss.createQueue(QUEUES.STEP_PROCESS_PRIZES);
await boss.createQueue(QUEUES.STEP_CALCULATE_STATS);
// luego los boss.work como ya están
```

Nota: el flag `PGBOSS_CLOSE_DRAW` ahora se usa para el **nuevo** flujo (close-and-ingest + preselect), no para el `close-draw.worker.js` viejo. Ese worker viejo se ELIMINA. La queue `CLOSE_DRAW` queda con createQueue defensivo pero sin worker registrado tras el cambio.

### Componente: Worker `close-and-ingest-sweep`

**Archivo:** `backend/src/queue/workers/close-and-ingest-sweep.worker.js` (nuevo)

**Responsabilidad:** cada minuto, encuentra draws a cerrar y encola jobs `close-and-ingest` (uno por draw). NO hace el trabajo en sí — solo enqueue.

**Pseudo-código:**

```js
// Sweep — solo busca y encola. NO hace trabajo pesado.
export async function closeAndIngestSweepWorker(job) {
  if (await isEmergencyStop()) return { skipped: 'emergency_stop' };

  const targetStart = addMinutes(now, 5);
  const targetEnd   = addMinutes(now, 6);

  const draws = await prisma.draw.findMany({
    where: {
      status: 'SCHEDULED',
      drawTime: { gte: targetStart, lt: targetEnd },
      drawDate: todayInVenezuela()
    },
    select: { id: true, gameId: true, drawDate: true, drawTime: true, game: { select: { type: true, name: true, slug: true } } }
  });

  if (draws.length === 0) return { enqueued: 0 };

  const boss = getBoss();
  let enqueued = 0;
  for (const draw of draws) {
    if (await isGamePaused(draw.gameId, draw.drawDate)) continue;
    await boss.send(QUEUES.CLOSE_AND_INGEST, { drawId: draw.id }, {
      singletonKey: `close-${draw.id}`,
      ...QUEUE_CONFIGS[QUEUES.CLOSE_AND_INGEST]
    });
    enqueued++;
  }
  return { enqueued, total: draws.length };
}
```

### Componente: Worker `close-and-ingest` (per-draw)

**Archivo:** `backend/src/queue/workers/close-and-ingest.worker.js` (nuevo)

**Responsabilidad:** procesa UN draw. Cierra atómicamente, decide entre rama admin-preselect o ingest normal, hace 2 pasadas SRQ, emite WS. **No corre optimizer ni notifica ganador final.**

**Recibe:** `job.data = { drawId }`

**Pseudo-código:**

```js
export async function closeAndIngestWorker(job) {
  const { drawId } = job.data;
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: { include: { items: true } } }
  });
  if (!draw) return { skipped: 'draw_not_found' };

  // TERMINAL: cierre simple, cascada del Triple maneja el ganador
  if (draw.game.type === 'TERMINAL') {
    return await closeTerminalDraw(draw);
  }

  // Cierre atómico — solo procede si sigue SCHEDULED
  const closed = await prisma.draw.updateMany({
    where: { id: drawId, status: 'SCHEDULED' },
    data: { status: 'CLOSED', closedAt: new Date() }
  });
  if (closed.count === 0) {
    return { skipped: 'already_closed_by_other' };
  }

  const updated = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true, preselectedItem: true }
  });

  // CASO A1: admin ya preseleccionó (preselectedItemId fue seteado antes del cierre)
  if (updated.preselectedItemId) {
    const { totalSales, maxPayout, potentialPayout, salesByItem } = await computeSalesContext(updated);
    emitToAll('draw:closed', { drawId, game: updated.game, drawDate: updated.drawDate, drawTime: updated.drawTime, preselectedItem: updated.preselectedItem });
    emitToGame(updated.game.slug, 'draw:closed', { drawId, drawDate: updated.drawDate, drawTime: updated.drawTime, preselectedItem: updated.preselectedItem });
    await notifyPrewinnerSelected({
      drawId, game: updated.game, drawDate: updated.drawDate, drawTime: updated.drawTime,
      prewinnerItem: updated.preselectedItem, totalSales, maxPayout, potentialPayout,
      salesByItem, tripletaRiskTop5: []
    });
    logger.info(`🔒 ${updated.game.name} - ${updated.drawTime} cerrado | admin preselect: ${updated.preselectedItem.number}`);
    return { closed: true, method: 'admin_preselect' };
  }

  // CASO A2: flujo normal — ingest + emit draw:closing
  emitToAll('draw:closing', { drawId, game: updated.game, drawDate: updated.drawDate, drawTime: updated.drawTime });
  emitToGame(updated.game.slug, 'draw:closing', { drawId, drawDate: updated.drawDate, drawTime: updated.drawTime });

  // Ingest SRQ con 2 pasadas (diff-based, idempotente)
  let srq1 = 0, srq2 = 0;
  try {
    const r = await apiIntegrationService.importSRQTickets(drawId, { allowClosed: true });
    srq1 = r.imported || 0;
  } catch (e) { logger.warn(`[close-and-ingest] SRQ pasada 1: ${e.message}`); }

  try {
    const r = await apiIntegrationService.importSRQTickets(drawId, { allowClosed: true });
    srq2 = r.imported || 0;
  } catch (e) { logger.warn(`[close-and-ingest] SRQ pasada 2: ${e.message}`); }

  // Maxplay sigue su propio sync-scrape (Croner) — no lo invocamos aquí
  logger.info(`🔒 ${updated.game.name} - ${updated.drawTime} cerrado | esperando preselect | SRQ ingested: ${srq1}+${srq2}`);
  return { closed: true, method: 'awaiting_preselect', srqIngested: srq1 + srq2 };
}
```

### Componente: Worker `preselect-sweep`

**Archivo:** `backend/src/queue/workers/preselect-sweep.worker.js` (nuevo)

**Responsabilidad:** cada minuto, encuentra draws CLOSED sin preselect en ventana y encola jobs `preselect`.

```js
export async function preselectSweepWorker(job) {
  if (await isEmergencyStop()) return { skipped: 'emergency_stop' };

  // Ventana: 3-5 min antes de drawTime — captura draws cerrados en el tick anterior (xx:55)
  const targetEarliest = addMinutes(now, 3);
  const targetLatest   = addMinutes(now, 5);

  const draws = await prisma.draw.findMany({
    where: {
      status: 'CLOSED',
      preselectedItemId: null,
      drawTime: { gte: targetEarliest, lt: targetLatest },
      drawDate: todayInVenezuela(),
      game: { type: { not: 'TERMINAL' } } // TERMINAL no necesita preselect, viene del Triple
    },
    select: { id: true }
  });

  if (draws.length === 0) return { enqueued: 0 };

  const boss = getBoss();
  let enqueued = 0;
  for (const draw of draws) {
    await boss.send(QUEUES.PRESELECT, { drawId: draw.id }, {
      singletonKey: `preselect-${draw.id}`,
      ...QUEUE_CONFIGS[QUEUES.PRESELECT]
    });
    enqueued++;
  }
  return { enqueued, total: draws.length };
}
```

### Componente: Worker `preselect` (per-draw)

**Archivo:** `backend/src/queue/workers/preselect.worker.js` (nuevo)

**Responsabilidad:** corre el optimizer para UN draw y notifica. `selectPrewinner` internamente ya persiste, emite WS y notifica Telegram, así que el worker es delgado.

**Recibe:** `job.data = { drawId }`

```js
export async function preselectWorker(job) {
  const { drawId } = job.data;

  // Re-verificar que sigue CLOSED sin preselect (otro flujo pudo haberlo procesado)
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { status: true, preselectedItemId: true, game: { select: { name: true } }, drawTime: true }
  });
  if (!draw) return { skipped: 'draw_not_found' };
  if (draw.status !== 'CLOSED') return { skipped: `status_is_${draw.status}` };
  if (draw.preselectedItemId) return { skipped: 'already_preselected' };

  // selectPrewinner internamente: optimizer + persist + emit WS + notify Telegram
  const selected = await prewinnerSelectionService.selectPrewinner(drawId);
  if (!selected) {
    logger.warn(`[preselect] No se pudo preseleccionar ${drawId}`);
    return { skipped: 'optimizer_returned_null' };
  }

  logger.info(`✅ ${draw.game.name} - ${draw.drawTime} preselect: ${selected.number}`);
  return { preselected: selected.number };
}
```

### Componente: Cron B (`preselect.job.js`) — OBSOLETO

**No se crea.** El sweep worker pg-boss reemplaza al Croner. Si por algún motivo querés un Croner mínimo, sería para situaciones donde pg-boss esté caído (no contemplado).

---

### (sección legacy del spec mantenida como referencia conceptual)

Pseudo-código original (Croner-based) para referencia conceptual:

```js
async execute() {
  if (await isEmergencyStop()) return;
  
  // Ventana: 3-5 min antes de drawTime — da 2 oportunidades de retry
  const targetEarliest = addMinutes(now, 3);
  const targetLatest   = addMinutes(now, 5);
  
  const drawsToPreselect = await prisma.draw.findMany({
    where: {
      status: 'CLOSED',
      preselectedItemId: null,
      drawTime: { gte: targetEarliest, lt: targetLatest },
      drawDate: todayInVenezuela()
    },
    include: { game: true }
  });
  
  for (const draw of drawsToPreselect) {
    try {
      // Optimizer corre, persiste preselectedItemId con su lógica interna
      const selectedItem = await prewinnerSelectionService.selectPrewinner(draw.id);
      
      if (!selectedItem) {
        logger.warn(`No se pudo preseleccionar ${draw.id}`);
        continue;
      }
      
      // selectPrewinner ya hace emitToAll, notifyPrewinnerSelected, etc.
      logger.info(`✅ ${draw.game.name} - ${draw.drawTime} preselect: ${selectedItem.number}`);
    } catch (err) {
      logger.error(`Error preseleccionando ${draw.id}:`, err);
    }
  }
}
```

### Componente: Validación de webhooks

**Archivo:** `backend/src/services/webhook.service.js`

Agregar función nueva `checkDrawIsOpen`:

```js
async function checkDrawIsOpen(drawId, tx) {
  const draw = await tx.draw.findUnique({
    where: { id: drawId },
    select: { status: true, drawTime: true }
  });
  if (!draw) return { ok: false, reason: `Draw ${drawId} not found` };
  if (draw.status !== 'SCHEDULED') {
    return { 
      ok: false, 
      reason: `Draw is ${draw.status} — closed for new bets` 
    };
  }
  return { ok: true };
}
```

Modificar la transacción existente:

```js
const txResult = await prisma.$transaction(async (tx) => {
  // NUEVO: chequear que el sorteo esté abierto ANTES de cualquier otra cosa
  const drawCheck = await checkDrawIsOpen(normalized.drawId, tx);
  if (!drawCheck.ok) {
    return { rejected: true, reason: drawCheck.reason };
  }
  
  const quotaCheck = await checkTicketQuotas(normalized.details, tx);
  if (!quotaCheck.ok) {
    return { rejected: true, reason: quotaCheck.reason };
  }
  
  const ticket = await createWebhookTicket(normalized, log.id, apiSystem.id, tx);
  return { rejected: false, ticket };
});
```

El WebhookLog se actualiza a `FAILED` con la razón clara. El proveedor recibe `200 OK` (no rompemos su retry loop) con `{ status: 'rejected', reason }`.

### Componente: Imports diff-based

#### SRQ — `api-integration.service.js`

**Antes (delete-then-recreate):**

```js
await prisma.ticket.deleteMany({ where: { drawId, source: 'EXTERNAL_API' } });
// ... luego crear todos de cero ...
```

**Después (upsert + anulación):**

1. Quitar el `deleteMany` (líneas 339-351).
2. En `groupTicketsByExternalId`, en vez de `continue` cuando `ticket.anulado`, agruparlos en una lista aparte `toCancel`:

```js
if (ticket.anulado) {
  toCancel.push(ticket.ticketID?.toString());
  continue;
}
// ... resto de la lógica de agrupado ...
```

3. Después del loop principal de `saveTicketWithDetails`, procesar `toCancel`:

```js
for (const externalId of toCancel) {
  const existing = await prisma.ticket.findFirst({
    where: { drawId, externalTicketId: externalId, source: 'EXTERNAL_API' },
    select: { id: true, status: true }
  });
  if (!existing) continue; // nunca lo conocimos
  if (existing.status === 'WON') {
    logger.warn(`SRQ marca ticket ${externalId} (status=WON) como anulado — NO se auto-cancela; revisar con admin`);
    continue;
  }
  if (existing.status === 'CANCELLED') continue; // ya cancelado
  await prisma.ticket.update({
    where: { id: existing.id },
    data: { status: 'CANCELLED' }
  });
  cancelled++;
}
```

4. `saveTicketWithDetails` ya tiene check de duplicado (`if (existing) return false`), así que tickets existentes se mantienen intactos. **Su `createdAt` original se preserva.**

5. Agregar parámetro `allowClosed`:

```js
async importSRQTickets(drawId, options = {}) {
  const { allowClosed = false } = options;
  // ...
  if (drawState && drawState.status !== 'SCHEDULED') {
    if (!allowClosed) {
      logger.debug(`[importSRQTickets] Draw ${drawId} en ${drawState.status}, ignorando`);
      return { imported: 0, skipped: 0, cancelled: 0, ignored: true };
    }
    // allowClosed: permitir si CLOSED reciente
    if (drawState.status === 'CLOSED' && drawState.closedAt && (Date.now() - drawState.closedAt.getTime() < 120_000)) {
      // OK, dentro de ventana de 2 min post-cierre
    } else {
      return { imported: 0, skipped: 0, cancelled: 0, ignored: true };
    }
  }
  // ...
}
```

#### Maxplay — `maxplay.service.js`

**Antes:**

```js
const del = await prisma.ticket.deleteMany({
  where: { drawId, source: 'EXTERNAL_SCRAPE', apiSystemId: apiSystem.id },
});
// ... crear todos ...
```

**Después (upsert por externalTicketId sintetizado):**

1. Quitar el `deleteMany` (líneas 213-215).
2. Cambiar el `prisma.ticket.create` por upsert:

```js
const externalTicketId = `maxplay-${drawId}-${row.jugada}`;

await prisma.ticket.upsert({
  where: {
    drawId_externalTicketId_source: {
      drawId,
      externalTicketId,
      source: 'EXTERNAL_SCRAPE'
    }
  },
  update: {
    totalAmount: row.venta,
    providerData: {
      source: 'maxplay',
      juego_id: juegoId,
      jugada: row.jugada,
      tickets_reportados: row.tickets,
      taquillas: row.taquillas,
      product: row.product,
      fetched_at: payload.fetched_at,
    },
    details: {
      deleteMany: {}, // borrar details viejos del ticket
      create: [{
        gameItemId: gameItem.id,
        amount: row.venta,
        multiplier: gameItem.multiplier,
        prize: 0,
        status: 'ACTIVE'
      }]
    }
    // status NO se actualiza — si ya está CANCELLED, queda así
    // createdAt NO se actualiza — preserva trazabilidad
  },
  create: {
    drawId,
    source: 'EXTERNAL_SCRAPE',
    apiSystemId: apiSystem.id,
    externalTicketId,
    totalAmount: row.venta,
    totalPrize: 0,
    status: 'ACTIVE',
    providerData: { /* ... */ },
    details: {
      create: [{ /* ... */ }]
    }
  }
});
```

3. Relax del guard de status:

```js
const fresh = await prisma.draw.findUnique({
  where: { id: drawId },
  select: { status: true, closedAt: true }
});
if (!fresh) {
  return { ok: true, imported: 0, reason: 'draw_not_found', ... };
}
const isOpen = fresh.status === 'SCHEDULED';
const isRecentlyClosed = fresh.status === 'CLOSED' && 
                         fresh.closedAt && 
                         (Date.now() - fresh.closedAt.getTime() < 120_000);
if (!isOpen && !isRecentlyClosed) {
  return { ok: true, imported: 0, reason: `draw_frozen_${fresh.status}`, ... };
}
```

#### TicketDetail concerns

Para SRQ, `saveTicketWithDetails` crea Ticket+TicketDetail juntos cuando el ticket NO existía. Si el ticket EXISTÍA (existing returns true → no-op), los details quedan como estaban. Eso es lo correcto: los details no cambian entre reimportes de SRQ.

Para Maxplay, el monto puede cambiar entre syncs (más bets entran). El `upsert` arriba borra-y-recrea details DENTRO del mismo ticket, manteniendo `Ticket.id` y `createdAt` estables. Es un compromiso aceptable — perdemos history de "monto progresivo por jugada", pero ganamos consistencia de tickets.

### Componente: Recovery en execute-draw

**Archivo:** `backend/src/jobs/execute-draw.job.js`

Antes de procesar premios, agregar fallback:

```js
async executeDraw(draw) {
  // Si el draw está CLOSED pero sin preselect (porque Cron B falló o se crasheó),
  // intentar selectPrewinner inline como último rescate.
  if (draw.status === 'CLOSED' && !draw.preselectedItemId) {
    logger.warn(`[execute-draw] ⚠️ Recovery: ${draw.id} sin preselect, ejecutando selectPrewinner inline`);
    try {
      await prewinnerSelectionService.selectPrewinner(draw.id);
      // Releer
      draw = await prisma.draw.findUnique({
        where: { id: draw.id },
        include: { preselectedItem: true, ... }
      });
    } catch (err) {
      logger.error(`[execute-draw] Recovery falló para ${draw.id}: ${err.message}`);
      // Continúa al fallback existente que ya hay (random si no hay preselect)
    }
  }
  // ... resto del flujo normal ...
}
```

## Migración

### Pre-deploy
1. Tests unitarios para cada nuevo componente.
2. Lint + type check (no aplica, JS sin TS).
3. Sintaxis check con `node --check`.

### Deploy steps (en orden, una sola ventana de noche)
1. Push commit con todos los cambios a main.
2. `ssh 94 "cd /var/proyectos/tote-web && git stash && git pull && git stash pop"`.
3. `ssh 94 "pm2 restart tote-backend"`.
4. Monitorear los próximos 2 cierres en logs:
   - Buscar `🔒 ... cerrado, esperando preselect` (Cron A funcionando).
   - Buscar `✅ ... preselect: N` un minuto después (Cron B funcionando).
   - NO debe aparecer `Preselección aleatoria` salvo casos legítimos.
   - NO debe aparecer `selectPrewinner timeout 15s` (Promise.race eliminado).
5. Si algo no funciona: `git revert <commit>` y restart.

### Rollback
- Reversión limpia con `git revert` de los commits — los archivos modificados/nuevos vuelven a estado previo.
- Los tickets ya importados (con la nueva lógica diff-based) NO se rompen ni se duplican en rollback.

## Tests

### Backend (Jest)

**`webhook.service` — checkDrawIsOpen:**
- Draw SCHEDULED → ok=true
- Draw CLOSED → ok=false, reason contiene "closed for new bets"
- Draw DRAWN → ok=false
- Draw inexistente → ok=false, reason contiene "not found"

**`webhook.service` — flujo completo:**
- Webhook a draw SCHEDULED → ticket creado
- Webhook a draw CLOSED → rejected con WebhookLog FAILED

**`api-integration.service.importSRQTickets`:**
- Ticket nuevo en payload → INSERT, ticketCount aumenta
- Ticket existente ACTIVE en payload ACTIVE → NO-OP (no recrea)
- Ticket existente ACTIVE en payload anulado → status pasa a CANCELLED
- Ticket existente WON en payload anulado → NO se cancela, log warning
- Ticket existente CANCELLED en payload anulado → NO-OP
- `allowClosed=false` + draw CLOSED → ignorado (returns imported: 0)
- `allowClosed=true` + draw CLOSED recientemente (closedAt < 2min) → procesa normal
- `allowClosed=true` + draw CLOSED hace mucho (closedAt > 2min) → ignorado

**`maxplay.service.importMaxplayTickets`:**
- Jugada nueva → INSERT
- Jugada existente con monto distinto → UPDATE in-place, `createdAt` no cambia
- Jugada existente con mismo monto → UPDATE (details recreados, ticket queda)
- Draw status=SCHEDULED → procesa
- Draw status=CLOSED closedAt < 2min → procesa
- Draw status=CLOSED closedAt > 2min → bypass
- Draw status=DRAWN → bypass

**`close-and-ingest.job`:**
- Draw SCHEDULED sin preselect → cierra, llama importSRQTickets 2 veces, no llama optimizer
- Draw SCHEDULED con preselect (admin) → cierra, emit + notify con admin's pick, NO llama optimizer
- Draw ya CLOSED por otro proceso → updateMany count=0, skip
- Game pausado → skip

**`preselect.job`:**
- Draw CLOSED sin preselect en ventana → llama selectPrewinner
- Draw CLOSED con preselect → query no lo encuentra, skip
- Draw SCHEDULED → query no lo encuentra, skip
- Draw fuera de ventana drawTime → skip

**`execute-draw` recovery:**
- Draw CLOSED sin preselect a drawTime → llama selectPrewinner inline antes de procesar
- Draw CLOSED con preselect → flujo normal sin recovery
- Draw DRAWN → flujo normal sin recovery

### Manual local
- Cargar seed prod (`seed-prod-results.sql` ajustado).
- Crear un draw SCHEDULED para dentro de 6 minutos.
- Insertar tickets vía API local (simulando webhooks + tickets pre-existentes).
- Verificar que Cron A cierra a T-5min, ingest corre, draw queda CLOSED sin preselect.
- Verificar que Cron B preselecciona a T-4min con el optimizer.
- Verificar que execute-draw procesa correctamente a T=0.

## Riesgos

| Riesgo | Mitigación |
|--|--|
| Race entre Cron A y Cron B en mismo tick xx:55 | Cron B query exige `status=CLOSED` + ventana drawTime ∈ [3-5min] → no matchea draws recién cerrados en el mismo segundo (estarían fuera del lower bound de Cron B en xx:55) |
| Cron A demora >60s, choca con xx:56 tick | Atomic updateMany WHERE status=SCHEDULED previene doble-cierre. Si Cron A sigue corriendo en xx:56, su trabajo de ingest sigue. Cron B puede arrancar el optimizer con datos incompletos — degradación graceful, no falla |
| Webhook llega exactamente en el microsegundo del UPDATE atomic | La transacción del webhook hace `checkDrawIsOpen` dentro de la misma tx que el insert. PostgreSQL serializa: una de las dos gana. Si webhook gana → ticket entra (draw aún SCHEDULED). Si cron gana → webhook se rechaza |
| sync-scrape-tickets period sync no termina antes de xx:56 (cold Maxplay 45s) | Cron B corre con datos incompletos. Tickets que llegan después se quedan en DB para prize processing pero no entran al optimizer. Acceptable per design |
| SRQ anula un ticket que ya pagó premio | NO se auto-cancela. Log warning para que admin lo revise manualmente |
| Cron B no encuentra draw en su ventana (script crasheado, gap) | execute-draw a T=0 hace recovery inline |
| Múltiples instancias del backend corriendo | Cron por singleton key + atomic updateMany previenen doble-procesamiento |

## Open questions

Ninguna. Todas las decisiones se cerraron en la discusión.

## Aprobaciones

- [ ] diazhh: aprobar diseño antes de generar plan de implementación con `writing-plans`.
