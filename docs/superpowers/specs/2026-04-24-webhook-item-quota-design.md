# Cupos por Item por Sorteo (Webhook PUSH)

**Fecha:** 2026-04-24
**Estado:** Diseño aprobado — pendiente plan de implementación
**Autor:** diazhh

## Contexto

Los proveedores PUSH (Premier, Virtuales, futuros) envían jugadas vía webhook. El sistema hoy acepta todo lo que el adapter normalice correctamente. Se requiere un mecanismo para que el admin fije un monto máximo vendible por item en sorteos específicos, y que el webhook rechace jugadas que excedan ese tope.

**Ejemplo operativo:** Admin entra al sorteo de LOTOANIMALITO de las 10:00 AM del día, fija cupo de 20000 Bs para el item "30". Cuando las ventas activas para `(drawId, item30)` lleguen a 20000 Bs, los siguientes webhooks que incluyan item 30 se rechazan.

## Decisiones de alcance (acordadas con el usuario)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Dónde se enforce? | Solo webhook PUSH ahora, pero **servicio centralizado** para extender a online/PULL después sin refactor. |
| 2 | ¿Granularidad del cupo? | Por `(drawId, gameItemId)` — instancia específica del sorteo. No afecta otros sorteos ni es estático. |
| 3 | ¿Comportamiento cuando se excede? | **All-or-nothing**: si cualquier play de un ticket excede cupo, se rechaza el ticket completo (coherente con D-02/D-06 del adapter Premier). |
| 4 | ¿Qué representa el cupo? | **Monto vendido** (gross bet amount — suma de `TicketDetail.amount`). No exposición por multiplier. |
| 5.1 | ¿Qué cuenta como vendido? | Solo `status = ACTIVE` (en Ticket **y** TicketDetail). Anulaciones liberan cupo automáticamente. |
| 5.2 | ¿Cupo menor a lo ya vendido? | Permitido. Ventas previas intactas; nuevas ventas se rechazan. UI muestra "excedido". |

## No incluido en este alcance

- Aplicación en jugadas online de jugadores (`TAQUILLA_ONLINE`) — servicio queda listo para consumir, pero no se invoca desde ese flujo.
- Aplicación en SRQ / PULL — los tickets de `EXTERNAL_API` llegan pre-confirmados; no hay punto natural de rechazo.
- Cupos default por juego o por item global — opt-in puro por sorteo.
- Cupos por banca, comercial o grupo — solo por item.
- Cupo sobre exposición (amount × multiplier).

## Arquitectura

### 1. Schema Prisma

Nuevo modelo `DrawItemQuota`:

```prisma
model DrawItemQuota {
  id         String   @id @default(uuid())
  drawId     String
  gameItemId String
  maxAmount  Decimal  @db.Decimal(12, 2)
  createdBy  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  draw     Draw     @relation(fields: [drawId], references: [id], onDelete: Cascade)
  gameItem GameItem @relation(fields: [gameItemId], references: [id], onDelete: Cascade)

  @@unique([drawId, gameItemId])
  @@index([drawId])
}
```

Relaciones inversas agregadas a `Draw` y `GameItem`:
- `Draw.itemQuotas DrawItemQuota[]`
- `GameItem.drawQuotas DrawItemQuota[]`

La presencia/ausencia de fila es booleana: si no existe, no hay cupo. Borrar la fila = quitar cupo. `onDelete: Cascade` en ambas relaciones porque el cupo no tiene sentido sin su sorteo o item.

### 2. Servicio central — `backend/src/services/quota.service.js`

Expuesto como módulo ES con 4 funciones:

**`checkTicketQuotas(plays, tx)`**
- Input: `plays = [{ drawId, gameItemId, amount }, ...]` (un ticket completo).
- Lógica:
  1. Agrupar plays por `(drawId, gameItemId)` → suma de `amount` intentada por combinación.
  2. `SELECT ... FOR UPDATE` sobre `DrawItemQuota` para todas las combinaciones con cupo existente (una query con `IN`).
  3. Para cada cupo existente: `SELECT SUM(amount) FROM TicketDetail td JOIN Ticket t ON td.ticketId = t.id WHERE td.drawId = :drawId AND td.gameItemId = :gameItemId AND td.status = 'ACTIVE' AND t.status = 'ACTIVE'`.
  4. Si `sold + intento > maxAmount` → devolver `{ ok: false, reason: "Cupo excedido para item <number> (<name>) en sorteo <drawTime>: vendido <sold> + intento <try> > cupo <max>" }`.
  5. Si todos pasan → `{ ok: true }`.
- Early exit: si no hay cupos para ninguna combinación, no hace locks ni queries adicionales (camino rápido).
- **Debe ejecutarse dentro de una transacción activa** (param `tx` obligatorio) para que `FOR UPDATE` tenga efecto y no libere los locks antes del insert.

**`setQuota({ drawId, gameItemId, maxAmount, userId })`**
- Upsert sobre el índice único `(drawId, gameItemId)`.
- Valida `maxAmount > 0`.
- No valida contra ventas existentes (decisión 5.2A).
- Devuelve el registro actualizado.

**`removeQuota({ drawId, gameItemId })`**
- Delete por el índice único. Idempotente (si no existe, no error).

**`getDrawQuotas(drawId)`**
- Devuelve para cada `GameItem` del juego del sorteo:
  ```js
  {
    gameItemId, number, name,
    maxAmount: Decimal | null,
    soldAmount: Decimal,
    availableAmount: Decimal | null,  // maxAmount - soldAmount, o null
    exceeded: boolean                  // maxAmount != null && soldAmount > maxAmount
  }
  ```
- Una sola query con `LEFT JOIN` a `DrawItemQuota` + agregación de `TicketDetail`.
- Consumido por la UI del monitor.

### 3. Integración webhook

Modificar `backend/src/services/webhook.service.js/dispatchWebhook()`:

Después de `adapter.normalize()` y antes de `createWebhookTicket`, envolver quota check + ticket creation en transacción:

```js
// Pseudocódigo simplificado
const result = await prisma.$transaction(async (tx) => {
  const quotaCheck = await checkTicketQuotas(normalized.details, tx);
  if (!quotaCheck.ok) {
    return { rejected: true, reason: quotaCheck.reason };
  }
  const ticket = await createWebhookTicketTx(normalized, log.id, apiSystem.id, tx);
  return { rejected: false, ticket };
}, { isolationLevel: 'ReadCommitted' });

if (result.rejected) {
  await prisma.webhookLog.update({ where: { id: log.id }, data: { status: 'FAILED', errorMessage: result.reason } });
  return { status: 'rejected', logId: log.id, reason: result.reason };
}
// ... flujo PROCESSED existente
```

`createWebhookTicket` debe aceptar un `tx` opcional (refactor menor: si se pasa, usarlo; si no, usar `prisma` como hoy). Esto mantiene backwards-compatibility con la función y centraliza la lógica de creación.

**Contrato HTTP sin cambios:** el controller ya devuelve `{ ticket: { status: 'REJECTED', reason } }` para `status === 'rejected'`. Los adapters no se tocan.

### 4. API REST

Tres endpoints nuevos bajo `/api/draws/:drawId/quotas`. Archivos:

- `backend/src/routes/quota.routes.js` (nuevo) — montado en `app.js` como `app.use('/api/draws', quotaRouter)`.
- `backend/src/controllers/quota.controller.js` (nuevo) — thin layer, delega al servicio.

Endpoints:

| Método | Path | Body | Respuesta | Uso |
|---|---|---|---|---|
| GET | `/api/draws/:drawId/quotas` | — | `[ { gameItemId, number, name, maxAmount, soldAmount, availableAmount, exceeded } ]` | Carga del tab Números |
| PUT | `/api/draws/:drawId/quotas/:gameItemId` | `{ maxAmount: number }` | `{ gameItemId, maxAmount, ... }` | Setear/editar cupo |
| DELETE | `/api/draws/:drawId/quotas/:gameItemId` | — | `204` | Quitar cupo |

Middleware: `authenticate` + `requireRole('ADMIN')` (mismo patrón que otras rutas admin).

Validaciones en el controller:
- `drawId` y `gameItemId` existen y `gameItemId.gameId === draw.gameId`.
- `maxAmount` en PUT: número, `> 0`, dos decimales máximo.
- El sorteo NO está `DRAWN` ni `CANCELLED` (bloquear mutaciones post-ejecución; GET sí permite para auditoría histórica).

### 5. UI — tab "Números" del Monitor

Archivo: `frontend/app/admin/monitor/page.js`.

Cambios en `fetchData()` para `activeTab === 'numeros'`: `Promise.all([monitorApi.getItemStats(selectedDraw), quotaApi.getDrawQuotas(selectedDraw)])` y hacer merge por `gameItemId` antes de setear state.

Extensiones a la tabla del tab Números:

- **Columna nueva "Cupo"**: muestra `formatCurrency(maxAmount)` o `—` en gris.
- **Columna nueva "Disponible"**: muestra `formatCurrency(availableAmount)` si hay cupo, colorizado:
  - verde si `availableAmount > maxAmount * 0.2` (más del 20%)
  - amarillo si entre 0 y 20%
  - rojo si `exceeded === true` con badge "Excedido"
- **Fila rojo suave** cuando `exceeded === true` (mismo patrón que ya existe para `totalPotentialPrize > totalSales * 0.7`).
- **Acción nueva por fila**: ícono de candado (`lucide-react:Shield`) que abre un modal chico:
  ```
  Cupo del item [número] - [nombre]
  Sorteo: [game] [drawTime]

  Vendido actual: [formatCurrency(soldAmount)]

  Monto máximo: [input numérico] Bs

  [Guardar] [Eliminar cupo] [Cancelar]
  ```
  - "Guardar" → `PUT` endpoint.
  - "Eliminar cupo" → `DELETE`, oculto si no hay cupo seteado.
  - Refresca datos al cerrar.
- El botón de cupo se **oculta** si `draw.status === 'DRAWN' || 'CANCELLED'` (consistente con la validación del backend).

Cliente API nuevo: `frontend/lib/api/quota.js` con `getDrawQuotas`, `setQuota`, `removeQuota`.

## Concurrencia y correctness

- `SELECT ... FOR UPDATE` en `DrawItemQuota` serializa webhooks concurrentes que apunten al mismo `(drawId, gameItemId)`. Dos inserts simultáneos que sumen exactamente al límite → uno pasa, uno se rechaza.
- Items sin cupo no entran al lock (early exit en `checkTicketQuotas`) — cero impacto en latencia para tráfico sin cupos configurados.
- Anulación de ticket (`annulWebhookTicket` dentro de la ventana de 190s): marca Ticket y detalles como `CANCELLED`. La query de `soldAmount` filtra `status = 'ACTIVE'`, por lo que libera el cupo automáticamente sin código extra.
- Cupo seteado durante venta activa: permitido. Ventas previas no afectadas. UI muestra "excedido" si aplica.

## Manejo de errores

- Check de cupo lanza → capturado por el `try/catch` existente en `dispatchWebhook`, log queda `FAILED` con el mensaje de error, respuesta HTTP 200 con `received: true` (no rompe al proveedor).
- Deadlock / fallo de transacción → burbujea como error, log queda `FAILED`, no se crea ticket. El proveedor puede reintentar con el mismo `externalTicketId` (idempotencia ya cubierta por `createWebhookTicket`).
- Admin intenta setear cupo en sorteo `DRAWN` → 400 con mensaje claro.

## Observabilidad

- Log en `webhook.service.js` al rechazar por cupo: `logger.info('[webhook] Rejected by quota — slug=<slug> logId=<id> reason=<reason>')`.
- `WebhookLog.errorMessage` guarda la razón exacta — visible en `/admin/proveedores/logs`.
- No se agrega nueva métrica/dashboard en esta entrega (puede ir en una siguiente iteración si hace falta).

## Testing

### Unit (`quota.service.js`)
- OK: play con monto dentro del cupo.
- Excede: un solo play que supera cupo → rechazo con razón.
- Sin cupo: `DrawItemQuota` no existe → pasa.
- Múltiples plays en un ticket, uno excede → rechaza todo el ticket (all-or-nothing).
- Cupo liberado por anulación: crear ticket ACTIVE, anular, verificar que `soldAmount` baja y el siguiente ticket pasa.
- Set/remove/get roundtrip.

### Integración (webhook)
- Premier payload que excede cupo del item → `WebhookLog.status = 'FAILED'`, respuesta `{ ticket: { status: 'REJECTED', reason } }`.
- Premier payload sin cupo configurado → se procesa normal (regresión).
- Anulación post-venta libera cupo.

### Concurrencia
- Dos `dispatchWebhook` en paralelo con plays que juntos superan cupo exacto → exactamente uno rechaza.

### API + UI
- `PUT` cupo → `GET` refleja el cambio.
- `DELETE` cupo → `GET` lo retira.
- `PUT` en sorteo `DRAWN` → 400.

## Impacto

| Área | Archivos |
|---|---|
| Schema | `backend/prisma/schema.prisma` + migración nueva |
| Backend | `backend/src/services/quota.service.js` (nuevo), `backend/src/services/webhook.service.js` (modificado), `backend/src/routes/quota.routes.js` (nuevo), `backend/src/controllers/quota.controller.js` (nuevo), `backend/src/app.js` (registro de router) |
| Frontend | `frontend/app/admin/monitor/page.js` (extensión), `frontend/lib/api/quota.js` (nuevo) |
| Tests | `backend/src/services/__tests__/quota.service.test.js`, tests de integración de webhook |

## Preguntas abiertas aclaradas

- **¿Cupo en sorteo `DRAWN`?** No. Bloquear mutaciones post-ejecución. GET sí se permite.
- **¿`createdBy` obligatorio?** Nice-to-have. Opcional — poblado si el request lo trae, no rompe si no.
