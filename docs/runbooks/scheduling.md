# Scheduling Runbook

> Estado post-migración 2026-05-12 — un único patrón: **cron Linux + pg-boss**.

## Resumen del patrón

Todos los jobs programados siguen la misma cadena:

```
/etc/cron.d/tote-triggers   →   trigger-pgboss-cron.mjs <queue>   →   boss.send()   →   pg-boss worker
       (cron Linux)           (encolador, exit <1s)                  (DB)              (backend Node)
```

- **Cuándo:** declarado en `/etc/cron.d/tote-triggers` (VPS 94).
- **Encolado:** `backend/src/scripts/trigger-pgboss-cron.mjs` valida queue contra allowlist y hace un solo `boss.send()` con timeout 15s.
- **Ejecución:** workers en `backend/src/queue/workers/`, registrados en `backend/src/queue/register.js` con `boss.createQueue` + `boss.work`.

## Jobs activos

| Queue | Frecuencia | TZ server (CEST) | TZ VE (UTC-4) | Worker |
|-------|------------|------------------|----------------|--------|
| `close-and-ingest-sweep` | `* * * * *` | cada minuto | cada minuto | `close-and-ingest-sweep.worker.js` |
| `preselect-sweep` | `* * * * *` | cada minuto | cada minuto | `preselect-sweep.worker.js` |
| `execute-draw-sweep` | `* * * * *` | cada minuto | cada minuto | `execute-draw-sweep.worker.js` |
| `monitor-dlq` | `*/2 * * * *` | cada 2 min | cada 2 min | `monitor-dlq.worker.js` |
| `sync-api-tickets` | `*/5 * * * *` | cada 5 min | cada 5 min | `sync-api-tickets.worker.js` |
| `sync-scrape-tickets` | `*/5 * * * *` | cada 5 min | cada 5 min | `sync-scrape-tickets.worker.js` (Maxplay) |
| `retry-failed-publications` | `*/5 * * * *` | cada 5 min | cada 5 min | `retry-failed-publications.worker.js` |
| `sync-api-planning` | `0 12 * * *` | 12:00 diario | 06:00 diario | `sync-api-planning.worker.js` |
| `generate-daily-draws` | `5 7 * * *` | 07:05 diario | 01:05 diario | `generate-daily-draws.worker.js` |
| `cleanup-logs` | `15 9 * * *` | 09:15 diario | 03:15 diario | `cleanup-logs.worker.js` |

> **Importante TZ**: cron Linux en VPS 94 usa la TZ del server (`Europe/Berlin = CEST/CET`). Para horas absolutas en Venezuela, sumá +6h (CEST en verano, +5h CET en invierno).

## Cómo agregar un nuevo job programado

1. **Crear worker** en `backend/src/queue/workers/<nombre>.worker.js`. Patrón:
   - Idempotente (DB constraints, singletonKey en boss.send)
   - Sin lanzar excepciones para fallos esperados — retornar `{ ok: false, reason: ... }` para que pg-boss no entre en retry loop
   - Devolver `{ success: true, ...stats }` en path exitoso

2. **Agregar queue name + config** en `backend/src/queue/constants.js`:
   ```javascript
   QUEUES = { ..., MI_NUEVO: 'mi-nuevo' };
   QUEUE_CONFIGS = { ..., [QUEUES.MI_NUEVO]: { retryLimit: 1, ... } };
   ```

3. **Registrar en `backend/src/queue/register.js`**:
   ```javascript
   const { miNuevoWorker } = await import('./workers/mi-nuevo.worker.js');
   await boss.createQueue(QUEUES.MI_NUEVO);  // crítico: pg-boss v10 NO crea cola con boss.work()
   await boss.work(QUEUES.MI_NUEVO, QUEUE_CONFIGS[QUEUES.MI_NUEVO], miNuevoWorker);
   ```

4. **Agregar al allowlist** en `backend/src/scripts/trigger-pgboss-cron.mjs`:
   ```javascript
   const ALLOWED_QUEUES = new Set([..., 'mi-nuevo']);
   ```

5. **Agregar entrada** en `/etc/cron.d/tote-triggers` (vía SSH al VPS 94):
   ```
   * * * * * root cd /var/proyectos/tote-web/backend && /usr/bin/node src/scripts/trigger-pgboss-cron.mjs mi-nuevo >> /var/log/tote-triggers.log 2>&1
   ```

6. **Deploy:**
   ```bash
   git push
   ssh 94 "cd /var/proyectos/tote-web && git pull && pm2 restart tote-backend"
   ```

7. **Verificar:**
   ```bash
   ssh 94 "cd /var/proyectos/tote-web/backend && /usr/bin/node src/scripts/trigger-pgboss-cron.mjs mi-nuevo"
   ssh 94 "PGPASSWORD='...' psql ... -c \"SELECT state, output FROM pgboss.job WHERE name='mi-nuevo' ORDER BY created_on DESC LIMIT 1;\""
   ```

## Cómo diagnosticar "el job no corre"

Cuatro preguntas en orden:

### 1. ¿cron Linux dispara?
```bash
ssh 94 "tail -50 /var/log/tote-triggers.log | grep <queue>"
```
- Si **NO hay entries**: cron daemon no está corriendo (`systemctl status cron`) o el archivo `/etc/cron.d/tote-triggers` está mal formateado. Verificar sintaxis con `crontab -T < /etc/cron.d/tote-triggers` (si está disponible) o leer el log de cron: `journalctl -u cron --since "10 minutes ago"`.
- Si hay entries con error tipo `FATAL: queue X not in allowlist`: actualizar `ALLOWED_QUEUES` en `trigger-pgboss-cron.mjs`.

### 2. ¿pg-boss encola?
```bash
ssh 94 "PGPASSWORD='...' psql ... -c \"SELECT name, state, COUNT(*) FROM pgboss.job WHERE name='<queue>' AND created_on > NOW() - INTERVAL '15 minutes' GROUP BY name, state;\""
```
- Si `created` permanece y nunca pasa a `completed`/`failed`: el worker NO está registrado o el backend está caído.
- Si todos son `failed`: revisar `output` de los jobs (`SELECT id, output FROM pgboss.job WHERE name='<queue>' AND state='failed' LIMIT 5;`) para ver el error.

### 3. ¿Backend procesa?
```bash
ssh 94 "pm2 list | grep tote-backend"
ssh 94 "grep '<queue>' /var/proyectos/tote-web/backend/logs/combined.log | tail -20"
```
- Si pm2 status no es `online`: `pm2 logs tote-backend --lines 100` para ver causa de crash.
- Si está online pero no hay logs del worker: el worker no se registró. Verificar `register.js` y el flag PGBOSS_* correspondiente en `.env`.

### 4. ¿Recursión / loop?
Si ves cientos de jobs del mismo nombre en pgboss.job con timestamps muy cercanos (segundos), es recursión. Causa típica: worker llama a una función del legacy Croner job que vuelve a hacer `boss.send` a su propia queue. Fix: pasar `{viaWorker: true}` al método que tiene el check del flag (ver `sync-api-tickets.job.js` y `generate-daily-draws.job.js` como referencia post-fix 2026-05-12).

**Stop de emergencia para recursión:**
```bash
ssh 94 "pm2 stop tote-backend"     # Detiene el procesamiento
ssh 94 "PGPASSWORD='...' psql ... -c \"DELETE FROM pgboss.job WHERE name='<queue>' AND state='created';\""  # Limpia backlog si necesario
# Fix the code, then:
ssh 94 "pm2 start tote-backend"
```

## Cómo rollback un cambio de scheduling

### Rollback completo del último cambio
```bash
git revert HEAD
git push
ssh 94 "cd /var/proyectos/tote-web && git pull && pm2 restart tote-backend"
```

### Rollback rápido de UN job específico
1. Comentar la línea correspondiente en `/etc/cron.d/tote-triggers` (poner `#` al inicio)
2. Eso detiene el trigger inmediatamente sin tocar código

### Rollback total a Croner
Para un job migrado, restaurar Croner como red final:
1. Comentar la línea cron Linux en `/etc/cron.d/tote-triggers`
2. Setear el flag `PGBOSS_<JOB>=false` en `.env`
3. Descomentar la `<job>Job.start()` correspondiente en `backend/src/jobs/index.js`
4. `pm2 restart tote-backend` — el Croner toma el control

> Esto solo aplica si los archivos `backend/src/jobs/*.job.js` aún existen (Task 5.1 los conserva como librerías).

## Tabla de conversión timezone

Server VPS 94 está en `Europe/Berlin`. Esa zona cambia entre **CEST (UTC+2, marzo-octubre)** y **CET (UTC+1, octubre-marzo)**. Venezuela es UTC-4 todo el año.

| Hora deseada VE | CEST (verano) | CET (invierno) | Delta |
|-----------------|---------------|----------------|-------|
| 00:00 | 06:00 | 05:00 | +6h / +5h |
| 01:05 | 07:05 | 06:05 | +6h / +5h |
| 03:15 | 09:15 | 08:15 | +6h / +5h |
| 06:00 | 12:00 | 11:00 | +6h / +5h |
| 08:00 | 14:00 | 13:00 | +6h / +5h |

> **Recomendación futura**: cambiar el VPS a UTC (`timedatectl set-timezone UTC`). Eliminaría toda esta complejidad. Las cron entries serían VE+4 sin importar DST.

## Glosario

- **sweep worker**: descubre trabajo (e.g. draws en estado X) y encola N jobs hijos. Cero work pesado, exit <100ms.
- **per-item worker**: recibe `{ drawId }` o similar y hace el trabajo real.
- **singletonKey**: previene duplicate enqueue cuando dos sweeps overlap. Patrón: `<verbo>-<id>` (ej. `execute-${drawId}`).
- **expireInMinutes**: TTL del job. Si excede, pg-boss lo marca `expired` y puede retentar según `retryLimit`.

## Histórico

- **2026-05-11**: Deploy close-draw rearchitecture (close-and-ingest + preselect via cron Linux). Resuelve drift bug de `boss.schedule()` v10.4.2.
- **2026-05-12**: Migración completa de los 8 jobs restantes al patrón unificado. Elimina la triple convivencia Croner + `boss.schedule()` + cron Linux.
