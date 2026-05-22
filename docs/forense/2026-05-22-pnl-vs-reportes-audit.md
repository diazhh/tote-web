# Auditoría P&L Semanal vs Reportes Contables

**Fecha:** 2026-05-22
**Alcance:** comparar los números mostrados en `/admin/reportes/pnl-semanal` contra los de `/admin/reportes` para detectar discrepancias y proponer ajustes.
**Semanas analizadas:** ISO 2026-W19 (4–10 may) y 2026-W20 (11–17 may), ambas cerradas.

## TL;DR

PNL-semanal **no está sacando las mismas cuentas** que `/admin/reportes`. Hay dos causas distintas y reales (no es solo un detalle de semántica):

1. **A — Undercount de SRQ en PNL por filtro de `TicketDetail.drawId IS NULL`.**
   En W20, 114 filas de `TicketDetail` de SRQ tienen `drawId = NULL`. El agregador de `DrawFinancial` filtra estrictamente por `td.drawId = drawId`, así que esas filas se descartan y se pierden **1,180.02 Bs** de ventas. Reportes legacy sí los suma porque agrega por `Ticket.totalAmount`.

2. **B — Diferencia de semántica `drawnAt` vs `drawDate` para la ventana semanal.**
   Reportes agrupa por `Draw.drawDate` (calendario del sorteo). PNL agrupa por `Draw.drawnAt` (instante de ejecución). Cuando un sorteo se ejecuta semanas tarde, queda atribuido a semanas distintas en cada vista. Hay un caso concreto en W19: un sorteo con `drawDate=2026-04-21` se ejecutó (`drawnAt`) el `2026-05-10 20:34`. PNL lo cuenta en W19, reportes no.

Además hay diferencias en **conteo de tickets** para WEBHOOK_PUSH que son **esperadas y correctas en PNL**: `Ticket.drawId` es ambiguo para tickets multi-sorteo (virtuales), por eso PNL cuenta por `TicketDetail.drawId` (diseño explícito en `draw-financial.service.js`, "F-3 fix"). Los montos totales coinciden; solo el conteo de tickets cambia.

## Tabla de comparación

### Totales W19 (4–10 may 2026)

| Vista | Sorteos | Tickets | Ventas (Bs) | Premios (Bs) |
|---|---|---|---|---|
| Reportes (Ticket × drawDate) | 337 | 17,105 | 1,542,519.13 | 844,873.00 |
| PNL (DrawFinancial × drawnAt) | 337 | 17,896 | 1,544,729.32 | 845,173.00 |
| **Δ (PNL − reportes)** | 0 | **+791** | **+2,210.19** | **+300.00** |

### Totales W20 (11–17 may 2026)

| Vista | Sorteos | Tickets | Ventas (Bs) | Premios (Bs) |
|---|---|---|---|---|
| Reportes (Ticket × drawDate) | 336 | 23,907 | 3,247,094.53 | 2,135,110.65 |
| PNL (DrawFinancial × drawnAt) | 336 | 25,806 | 3,245,914.19 | 2,135,110.65 |
| **Δ (PNL − reportes)** | 0 | **+1,899** | **−1,180.34** | 0.00 |

### W20 desglose por fuente

| Fuente | Reportes tickets | Reportes ventas | PNL tickets | PNL ventas | Δ ventas |
|---|---|---|---|---|---|
| WEBHOOK_PUSH (virtuales + premier) | 6,202 | 1,699,526.53 | 8,139 | 1,699,526.53 | **0.00** ✓ |
| EXTERNAL_API (SRQ) | 7,911 | 1,369,981.00 | 7,873 | 1,368,800.66 | **−1,180.34** ⚠ |
| EXTERNAL_SCRAPE (Maxplay) | 9,794 | 177,587.00 | 9,794 | 177,587.00 | **0.00** ✓ |

### W19 desglose por fuente

| Fuente | Reportes ventas | PNL ventas | Δ ventas |
|---|---|---|---|
| WEBHOOK_PUSH | 483,283.13 | 483,283.13 | **0.00** ✓ |
| EXTERNAL_API (SRQ) | 909,831.00 | 912,041.19 | **+2,210.19** ⚠ |
| EXTERNAL_SCRAPE | 149,405.00 | 149,405.00 | **0.00** ✓ |

## Hallazgo A — TicketDetail.drawId NULL (afecta SRQ)

### Evidencia

En W20, agrupando `TicketDetail` con `drawId IS NULL` cuyo `Ticket.drawId` cae en el rango:

```
 source        | rows | amount_sum
---------------+------+-----------
 EXTERNAL_API  |  114 |   1180.02
```

`1,180.02 ≈ |−1,180.34|` (la diferencia .32 es ruido de redondeo entre `Ticket.totalAmount` y `SUM(TicketDetail.amount)` para SRQ, ya observada).

### Causa raíz

`backend/src/services/draw-financial.service.js:67-73` agrega así:

```js
const salesAgg = await prisma.ticketDetail.aggregate({
  where: { drawId, ticket: { status: { not: 'CANCELLED' } } },
  _sum: { amount: true },
});
```

Filtra estrictamente por `td.drawId = drawId`. Si la fila tiene `td.drawId = NULL`, no entra al agregado, aun cuando el `Ticket.drawId` parent sí coincida con el draw objetivo.

El patrón correcto está en `backend/src/services/prize-processor.service.js:77-89`:

```js
where: {
  status: 'ACTIVE',
  OR: [
    { drawId },
    { drawId: null, ticket: { drawId } },
  ],
},
```

### Por qué hay 114 filas con `drawId NULL` para SRQ

Según el comentario en `prize-processor.service.js:64-74`, solo el adapter de virtuales (`WEBHOOK_PUSH`) popula `TicketDetail.drawId` por su flujo multi-sorteo; los demás flujos (incluyendo SRQ) **deberían** dejarlo en NULL. En realidad la mayoría de filas SRQ del W20 sí lo tienen poblado (35,709 con drawId vs 114 sin) — probablemente por un backfill parcial. Las 114 son legacy o casos del adapter que no lo setean.

Solo importa que el agregador de `DrawFinancial` no asume que esté siempre poblado.

### Fix propuesto (mínimo)

`draw-financial.service.js`: cambiar la condición de las dos agregaciones (`computeAndUpsertSales` y `computeAndUpsertPrizes`) para incluir filas con `drawId NULL` cuyo `ticket.drawId` apunte al draw objetivo. Mismo patrón de `prize-processor.service.js`.

Aplicar también al `$queryRaw` per-provider en ambas fases.

Tras el fix, hay que **rebuildear `DrawFinancial`** para los draws afectados (idempotente — el worker reescribe el row). Opciones:
- `npm run pnl:rebuild` si existe (verificar `package.json`)
- Backfill manual sobre los draws con `drawDate >= 2026-05-04`

### Impacto

El undercount es estructural: cualquier semana con tickets SRQ que tengan `TicketDetail.drawId NULL` mostrará ventas menores a las reales en PNL. El error es pequeño en proporción (~0.04% de las ventas SRQ semanales) pero **siempre va hacia abajo**, así que se acumula al neto.

## Hallazgo B — Ventana semanal por `drawDate` vs `drawnAt`

### Evidencia

W19 tiene un sorteo "huérfano" con cronograma desfasado:

```
 id            | drawDate   | drawnAt                 | totalSales | totalPrize | ticketCount
---------------+------------+-------------------------+------------+------------+-------------
 4b55eeb0…f5e… | 2026-04-21 | 2026-05-10 20:34:00.149 |    2210.00 |     300.00 |          35
```

- Reportes lo cuenta en la semana del calendario de `drawDate` → W17 (no W19).
- PNL lo cuenta en la semana del `drawnAt` → W19.

El delta exacto de W19 (`+2,210.19 ventas, +300.00 premios, +35 tickets, ventas SRQ +2,210.19`) coincide casi al céntimo con este draw + la suma de las diferencias de redondeo SRQ. La discrepancia W19 es **íntegramente atribuible a este sorteo huérfano**.

### Causa raíz

No es bug — es **decisión semántica**. Hay dos preguntas distintas:

| Pregunta del negocio | Vista correcta |
|---|---|
| "¿Cuánto vendimos en la semana del calendario X?" | reportes (`drawDate`) |
| "¿Cuánto se totalizó/cerró en la semana X?" | PNL (`drawnAt`) |

Cuando todos los sorteos se ejecutan dentro de su `drawDate` (lo normal), ambas vistas coinciden. Los sorteos huérfanos (cancelaciones tardías, ejecuciones reanudadas mucho después) introducen la diferencia.

### Recomendación

Documentar el criterio claramente en la UI de PNL ("semana de totalización") y en `/admin/reportes` ("semana de calendario"). No cambiar la fórmula sin que el negocio decida cuál es la canónica para liquidaciones. Para reconciliar contra reportes mensuales, agregar un toggle o columna que muestre los draws huérfanos detectados en el rango.

Alternativa más conservadora: agregar a la respuesta de PNL un campo `orphanDraws: [{drawId, drawDate, drawnAt, totalSales, totalPrize}]` para que el operador vea explícitamente cuáles sorteos no caen en su semana calendario.

## Hallazgo C — Diferencia esperada en conteo de tickets WEBHOOK_PUSH

En W20, WEBHOOK_PUSH tiene 6,202 tickets en reportes y 8,139 en PNL (+1,937). Las **ventas coinciden al céntimo** (1,699,526.53). Esto es por diseño:

- Reportes agrupa por `Ticket.drawId` (el draw "original" del ticket).
- PNL agrupa por `TicketDetail.drawId` (cada jugada cuenta en su sorteo destino).

Un ticket multi-sorteo de virtuales con 4 jugadas en 4 sorteos distintos cuenta como **1** ticket en reportes (del draw del primer sorteo) y como **1** ticket en cada uno de los 4 sorteos en PNL → 4 unidades de conteo. El comentario en `draw-financial.service.js:8-13` lo explica: PNL es el contador correcto para análisis por-sorteo; reportes sirve para "cuántos tickets emitimos en total" si uno acepta el sesgo.

**No requiere fix.** Solo asegurar que la UI de PNL deje claro que `ticketCount` cuenta jugadas-por-sorteo, no tickets únicos.

## Plan de remediación

Aprobación pendiente por @diazhh.

### Cambio 1 — Fix Hallazgo A (estructural)

Archivo: `backend/src/services/draw-financial.service.js`
- En `computeAndUpsertSales`: cambiar `where: { drawId, ticket: ... }` por `where: { OR: [{ drawId }, { drawId: null, ticket: { drawId } }], ticket: { status: { not: 'CANCELLED' } } }`.
- En `computeAndUpsertPrizes`: idéntico cambio.
- En los dos `$queryRaw` per-provider: agregar el join condicional `(td."drawId" = ${drawId} OR (td."drawId" IS NULL AND t."drawId" = ${drawId}))`.

Tests: agregar caso a `__tests__/draw-financial.service.test.js` con TicketDetail.drawId NULL y verificar que se incluye en el agregado.

Backfill: rebuild de `DrawFinancial` para draws desde 2026-05-04. Identificar el comando exacto (existe worker `draw-financial-recompute` o similar — verificar antes de correr).

### Cambio 2 — Documentar Hallazgo B (UX)

Archivo: `frontend/app/admin/reportes/pnl-semanal/page.js`
- Subtítulo de la página: "Agrupado por fecha de totalización (`drawnAt`)".
- Tooltip en el header con explicación.

Opcional (más invasivo): exponer `orphanDraws` en la respuesta del endpoint y mostrar un banner cuando haya draws huérfanos en el rango.

### Cambio 3 — Documentar Hallazgo C (UX)

Tooltip en la columna "Tickets" del PNL: "Cuenta jugadas-por-sorteo. Un ticket multi-sorteo cuenta una vez por cada sorteo en el que tiene jugadas."

## Queries reproducibles

```sql
-- Totales reportes-style vs pnl-style (ajustar fechas)
SELECT 'reportes' AS view, COUNT(DISTINCT d.id) AS draws,
       COUNT(t.id) AS tickets,
       COALESCE(SUM(t."totalAmount"),0)::numeric(14,2) AS sales,
       COALESCE(SUM(t."totalPrize"),0)::numeric(14,2)  AS prizes
FROM "Draw" d LEFT JOIN "Ticket" t ON t."drawId" = d.id AND t.status <> 'CANCELLED'
WHERE d."drawDate" BETWEEN '2026-05-11' AND '2026-05-17'
UNION ALL
SELECT 'pnl', COUNT(DISTINCT d.id),
       COALESCE(SUM(df."ticketCount"),0)::int,
       COALESCE(SUM(df."totalSales"),0)::numeric(14,2),
       COALESCE(SUM(df."totalPrize"),0)::numeric(14,2)
FROM "Draw" d JOIN "DrawFinancial" df ON df."drawId" = d.id
WHERE d."drawnAt" >= '2026-05-11 04:00:00+00'::timestamptz
  AND d."drawnAt" <  '2026-05-18 04:00:00+00'::timestamptz
  AND df."totalizedAt" IS NOT NULL;

-- Detectar TicketDetail con drawId NULL en una ventana
SELECT t.source, COUNT(*) AS rows, SUM(td.amount)::numeric(14,2) AS amount_sum
FROM "TicketDetail" td
JOIN "Ticket" t ON t.id = td."ticketId"
JOIN "Draw" d   ON d.id = t."drawId"
WHERE d."drawDate" BETWEEN '2026-05-11' AND '2026-05-17'
  AND t.status <> 'CANCELLED'
  AND td."drawId" IS NULL
GROUP BY t.source;

-- Draws huérfanos (drawDate y drawnAt en semanas distintas)
SELECT d.id, d."drawDate", d."drawnAt",
       df."totalSales", df."totalPrize", df."ticketCount"
FROM "Draw" d
LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
WHERE d."drawnAt" IS NOT NULL
  AND date_trunc('week', d."drawDate") <> date_trunc('week', d."drawnAt" AT TIME ZONE 'America/Caracas')
  AND d."drawDate" >= '2026-05-01';
```
