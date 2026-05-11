# Handoff de sesión — 2026-05-11

Documento para retomar el trabajo después de `/clear`. Contiene todo el contexto necesario para una sesión nueva sin pasar por el historial.

## 1. Qué pasó hoy (resumen ejecutivo)

**Incidente operativo:** TRIPLE PANTERA 08:00 AM arrojó número **100** y pagó **160.175 Bs** sobre ventas de **7.050 Bs** (pérdida ~153K).

**Causa raíz:** un bug en `close-draw.job.js` (legacy Croner). El `Promise.race` con timeout 15s abortaba el await de `selectPrewinner` aun cuando el optimizer YA había persistido el pre-ganador correcto. El catch trataba el timeout como falla y ejecutaba el fallback aleatorio que sobreescribía con un `prisma.draw.update` sin guard de status.

**Fix urgente desplegado** (commits `3157db4` + `892f03d`):
- Defensive recheck en el catch: si el optimizer ya persistió, respetar y NO sobreescribir.
- `updateMany WHERE status='SCHEDULED'` (guard atómico) en la rama random.
- `hasTickets` ahora cuenta tickets de DB en vez de mirar solo lo recién importado.
- Eliminación completa de PDF de cierre (causa del timeout).

**Verificación post-fix:**
- 12 PM Caracas: `Preselección inteligente`, sin timeout, sin PDF. ✅
- 1 PM Caracas: ídem para los 3 juegos. ✅
- Usuario confirmó que Telegram ya no recibe PDFs. ✅

**Trabajo adicional completado hoy:**
- Reporte contable nuevo en `/admin/reportes-contable` (commit `976b7a7` local, no desplegado).
- Spec de re-arquitectura close-draw aprobado para implementación.

## 2. Estado del repo

### Commits desplegados en VPS 94 (producción)
```
892f03d  refactor(close-draw): eliminar PDF de cierre enviado a Telegram
bd8d987  docs(spec): eliminar PDF de cierre de sorteo enviado a Telegram
3157db4  fix(close-draw): prevent random fallback from overwriting persisted intelligent selection
```

### Commits locales pendientes de push/deploy
```
c49ee3a  docs(spec): re-arquitectura close-draw — Cron A/B + webhook validation + diff imports
976b7a7  feat(reportes): reporte contable agregado por día y juego
9f91734  docs(spec): reporte contable
```

### Archivos modificados sin commitear (heredados de antes de hoy, no tocar)
- `backend/src/jobs/execute-draw.job.js`
- `backend/src/queue/workers/retry-failed-publications.worker.js`
- `backend/src/services/publication.service.js`
- `ecosystem.config.js` (solo en VPS 94)

## 3. Próximo trabajo a realizar

**Tarea principal:** implementar el spec `docs/superpowers/specs/2026-05-11-close-draw-rearchitecture-design.md`.

Alcance acordado y aprobado por el usuario:

1. **Re-arquitectura close-draw nativa pg-boss** (no Croner)
   - Worker nuevo: `close-and-ingest-sweep.worker.js` (sweep cada minuto, encola jobs por draw)
   - Worker nuevo: `close-and-ingest.worker.js` (procesa UN draw: cierre atómico + 2 pasadas SRQ)
   - Worker nuevo: `preselect-sweep.worker.js` (sweep cada minuto, encola jobs preselect)
   - Worker nuevo: `preselect.worker.js` (corre optimizer para UN draw)
   - 4 queues nuevas en `queue/constants.js`
   - Triggers via `boss.schedule(...)` nativo

2. **Fix `createQueue` faltante** en 6 workers críticos de `register.js`:
   - `CLOSE_DRAW`, `EXECUTE_DRAW`, `STEP_GENERATE_IMAGE`, `STEP_NOTIFY_ADMINS`, `STEP_PUBLISH_DRAW`, `STEP_PROCESS_PRIZES`, `STEP_CALCULATE_STATS`
   - Antes de cada `boss.work(...)` agregar `await boss.createQueue(QUEUE_NAME)`

3. **Webhook validation** en `webhook.service.js`:
   - Nueva función `checkDrawIsOpen(drawId, tx)`
   - Llamarla dentro de la transacción ANTES de `checkTicketQuotas`
   - Rechazar si `draw.status !== 'SCHEDULED'`

4. **Diff-based imports SRQ** en `api-integration.service.js`:
   - Quitar `deleteMany` (líneas 339-351)
   - En `groupTicketsByExternalId`: en vez de `continue` para anulados, recolectar en lista `toCancel`
   - Procesar `toCancel`: si existe ACTIVE → marcar CANCELLED; si WON → log warning; si CANCELLED → no-op
   - Agregar parámetro `{ allowClosed }` para usar desde el nuevo worker
   - Relax del guard de status: aceptar SCHEDULED o CLOSED si `closedAt < 2min`

5. **Diff-based imports Maxplay** en `maxplay.service.js`:
   - Quitar `deleteMany` (líneas 213-215)
   - Cambiar `prisma.ticket.create` por `prisma.ticket.upsert` keyed en `(drawId, externalTicketId, source)`
   - Update: solo `totalAmount`, `providerData`, recreate details. NO tocar `createdAt` ni `status`
   - Agregar parámetro `{ allowClosed }`
   - Relax del guard de status (mismo criterio que SRQ)

6. **Recovery en execute-draw** (`execute-draw.job.js`, sigue en Croner):
   - Antes de procesar: si `draw.status === 'CLOSED' && !draw.preselectedItemId`, llamar `selectPrewinner(draw.id)` inline
   - Es la red de seguridad si pg-boss preselect falló

7. **Activar flags** en `backend/.env`:
   ```
   PGBOSS_CLOSE_DRAW=true
   PGBOSS_PRESELECT=true
   ```
   - El flag `PGBOSS_CLOSE_DRAW` ahora apunta al NUEVO worker `close-and-ingest`, no al viejo `close-draw.worker.js`.
   - El viejo `close-draw.worker.js` se ELIMINA del registro.

8. **Eliminar código Croner viejo**:
   - `backend/src/jobs/close-draw.job.js` → delete
   - Su entrada en `backend/src/jobs/index.js` → delete
   - `backend/src/queue/workers/close-draw.worker.js` → delete (el viejo, queda reemplazado por `close-and-ingest.worker.js`)

## 4. Casos borde manejados (en el spec)

- **Admin preselect antes del cierre**: el worker close-and-ingest detecta `preselectedItemId` ya seteado, emite y notifica con la elección del admin, NO corre optimizer.
- **Admin preselect entre xx:55 y xx:56**: `drawService.preselectWinner` emite WS + Telegram al setear; cuando preselect-sweep corre a xx:56, ese draw ya tiene preselectedItemId → no matchea → skip.
- **Admin override después de xx:56**: `handleChangeResult` (flujo Tocayo via Telegram) sigue intacto, permite override en CLOSED.
- **Maxplay scrape lento (cold start ~45s)**: como sync-scrape corre paralelo, sus tickets llegan dentro de la ventana de 60s entre xx:55 y xx:56. El guard relajado de status permite insertar aunque el draw ya esté CLOSED.
- **Crash entre xx:55 y xx:56**: pg-boss persiste el job en DB; al volver el worker lo retoma. Si pasa el tiempo, execute-draw a xx:00 hace recovery inline.
- **TERMINAL games**: cierre simple, sin optimizer (su ganador viene cascada del Triple). Filtrado en preselect-sweep con `game: { type: { not: 'TERMINAL' } }`.

## 5. Lo que NO se toca

- `prewinner-optimizer.service.js` — el algoritmo del optimizer se mantiene.
- `drawService.preselectWinner` (admin UI manual) — flujo intacto.
- `handleChangeResult` (admin Telegram post-cierre) — flujo intacto.
- `execute-draw` y su pipeline de 5 steps — siguen en Croner. Solo agregamos el recovery inline.
- Syncs periódicos (`sync-api-tickets`, `sync-scrape-tickets`) — siguen en Croner, solo se ajusta el guard de status del servicio Maxplay.
- Reporte contable nuevo — código aislado, no se mezcla con esta refactorización.

## 6. Validación local antes de cualquier deploy

Antes de pushear, en local:

1. `cd backend && npm run dev` — backend levanta sin errores
2. `cd frontend && npm run dev` — frontend levanta
3. Crear un draw SCHEDULED para dentro de 6 min en la DB local
4. Insertar tickets via API
5. Esperar al sweep de close-and-ingest (xx:55 del minuto correspondiente)
6. Verificar logs: cierre + ingest correctos, draw queda CLOSED sin preselect
7. Esperar al sweep de preselect (xx:56)
8. Verificar logs: optimizer corrió, WS emitido, Telegram enviado (si configurado en local)
9. Verificar `pgboss.job`: jobs aparecen en `completed`, ninguno en `failed`
10. Probar webhook a draw CLOSED → debe retornar rejected

Tests unitarios (Jest):
- `webhook.service` — `checkDrawIsOpen` con cada estado
- `api-integration.service.importSRQTickets` — diff-based correcto
- `maxplay.service.importMaxplayTickets` — upsert por jugada, preserva createdAt
- `close-and-ingest.worker` — cierra atómicamente, ingest 2 pasadas SRQ
- `preselect.worker` — corre optimizer, idempotente

## 7. Plan de deploy (cuando el usuario confirme)

**NO hacer push ni deploy sin instrucción explícita del usuario.**

Cuando confirme:

1. `git push origin main` (sube los commits locales)
2. `ssh 94 "cd /var/proyectos/tote-web && git stash && git pull && git stash pop"`
3. Editar `/var/proyectos/tote-web/backend/.env` en VPS 94 para agregar:
   ```
   PGBOSS_CLOSE_DRAW=true
   PGBOSS_PRESELECT=true
   ```
4. `ssh 94 "pm2 restart tote-backend"`
5. **VERIFICAR INMEDIATAMENTE** que el código nuevo cargó:
   - `pm2 jlist | python -c '...'` → uptime debe ser nuevo
   - Tail logs: buscar `[pg-boss] Worker close-and-ingest registrado` al startup
6. Monitorear el próximo cierre completo (xx:55 + xx:56) y verificar el flujo entero
7. Si todo OK: confirmación a usuario
8. Si algo falla: rollback con `git revert` + restart, o desactivar flags con `PGBOSS_CLOSE_DRAW=false` y restart

## 8. Comando para retomar después de /clear

Pegale al chat fresco esta instrucción:

```
Continúa la implementación de la re-arquitectura close-draw que ya está aprobada.

Lee primero estos dos archivos para contexto:
1. .planning/SESSION-RESUME-2026-05-11.md (handoff de la sesión anterior)
2. docs/superpowers/specs/2026-05-11-close-draw-rearchitecture-design.md (spec aprobado)

Estado: pendiente la implementación (task #5 en la lista). El spec ya tiene
los componentes pg-boss-native detallados. Mi pedido es:

1. Invocá el skill superpowers:writing-plans para generar el plan de implementación.
2. Ejecutá la implementación en local con tests.
3. NO pushear, NO deployar — esperás mi instrucción explícita para subir al VPS 94.
4. Avísame cuando esté listo para revisión.
```
