# Portal de Proveedores — Diseño (Design Spec)

**Fecha:** 2026-04-16
**Autor:** diazhh
**Estado:** Diseño aprobado — pendiente plan de implementación

---

## 1. Objetivo

Permitir que los proveedores PUSH (Virtuales, Premier) accedan a un portal web para consultar, en tiempo real, los tickets/jugadas que han enviado vía webhook y los resultados de los sorteos donde participaron.

**Fuera de alcance (explícito):**
- Reportes financieros, comisiones, saldos
- Exportación CSV/Excel
- Visor de webhook logs para el proveedor (hoy solo admin)
- Acceso para proveedores PULL (SRQ)
- Mutaciones desde el portal (read-only)
- Multi-usuario por proveedor (cuenta compartida por ahora)

## 2. Decisiones clave

| # | Decisión | Elegido | Racional |
|---|----------|---------|----------|
| 1 | Modelo de acceso | Un usuario por proveedor (cuenta compartida) | Rápido de lanzar; audit fino no es requerimiento hoy |
| 2 | Alcance de reportes | Tickets + resultados por sorteo | Lo que el proveedor pide; financiero viene después si aplica |
| 3 | Entrada al sistema | Login compartido `/admin/login` con redirect por rol | Reusa UI existente, evita duplicar auth |
| 4 | Proveedores con acceso | Solo PUSH (Virtuales, Premier) | SRQ no lo pide; simplifica scope inicial |
| 5 | Filtros/export | Lista paginada, filtros, sin exportar | Cubre 90% del uso; export se añade después si lo piden |
| 6 | Arquitectura auth | Extender `User` con rol `PROVIDER` + FK a `ApiSystem` | Reusa auth/JWT/middleware existentes; migración mínima |

## 3. Modelo de datos

### 3.1 Cambios en `backend/prisma/schema.prisma`

```prisma
enum UserRole {
  ADMIN
  OPERATOR
  VIEWER
  PLAYER
  TAQUILLA_ADMIN
  PROVIDER          // NUEVO
}

model User {
  // ... campos existentes
  apiSystemId   String?
  apiSystem     ApiSystem?  @relation(fields: [apiSystemId], references: [id])

  @@index([apiSystemId])
}

model ApiSystem {
  // ... campos existentes
  users User[]
}

model Ticket {
  // ... campos existentes
  apiSystemId  String?
  apiSystem    ApiSystem?  @relation(fields: [apiSystemId], references: [id])

  @@index([apiSystemId, createdAt])
}
```

### 3.2 Migración

Una sola: `add_provider_portal_and_ticket_apisystem`.

### 3.3 Backfill

Script idempotente `backend/src/scripts/backfill-ticket-apisystem.js`:

- Recorre tickets con `source='WEBHOOK_PUSH'` y `apiSystemId IS NULL`
- Extrae el `slug` del proveedor desde `providerData` (o desde `WebhookLog` asociado)
- Resuelve el `ApiSystem.id` por slug y lo asigna al ticket
- Seguro correr múltiples veces (solo toca tickets sin `apiSystemId`)

### 3.4 Validaciones

- `User.role = 'PROVIDER'` → `apiSystemId` obligatorio (validación a nivel servicio + defensiva en middleware)
- `User.role != 'PROVIDER'` → `apiSystemId = null` (enforcement a nivel servicio al crear)

## 4. Autenticación y autorización

### 4.1 Login

- Endpoint existente `POST /api/auth/login` sin cambios de superficie
- Payload JWT extendido: `{ id, role, apiSystemId }` (antes `{ id, role }`)
- Frontend `/admin/login`: tras login, redirect basado en `role`:
  - `PROVIDER` → `/proveedor`
  - `PLAYER` → `/jugar`
  - resto → `/admin`

### 4.2 Creación de credenciales

- UI: en `/admin/proveedores`, dentro del modal "Editar proveedor" de un `ApiSystem` con `mode=PUSH`, nueva sección **"Acceso al portal"**
- Botón "Crear usuario portal" abre submodal con `username` + `password` (mínimo 10 chars, validación server-side)
- Si ya existe: botón muestra "Resetear contraseña" y opción "Desactivar acceso"
- Backend: `POST /api/providers/systems/:id/portal-user` — admin-only (`authorize('ADMIN')`)
- Para `mode=PULL`, botón deshabilitado con tooltip "Solo proveedores PUSH pueden tener portal"

### 4.3 Middleware de scope

Archivo: `backend/src/middlewares/provider-scope.middleware.js`

```js
export const requireProvider = (req, res, next) => {
  if (req.user?.role !== 'PROVIDER') return res.status(403).json({ error: 'Forbidden' });
  if (!req.user.apiSystemId) return res.status(403).json({ error: 'Account misconfigured' });
  req.apiSystemId = req.user.apiSystemId;
  next();
};
```

### 4.4 Revocación

- Admin marca `User.isActive = false` desde `/admin/proveedores` o `/admin/usuarios`
- JWT vigente expira al TTL actual del sistema; si es >8h, evaluar reducirlo para el portal en iteración posterior (no bloqueante)
- Login futuro rechazado por middleware `authenticate` existente

## 5. Backend — API del portal

Archivo: `backend/src/routes/portal.routes.js`, montado en `/api/portal`, todas las rutas con `authenticate` + `requireProvider`.

### 5.1 Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/me` | `{ apiSystem: { id, name, slug, mode }, user: { username } }` |
| `GET` | `/tickets` | Lista paginada con filtros |
| `GET` | `/tickets/:id` | Detalle de un ticket |
| `GET` | `/draws` | Lista de sorteos con tráfico del proveedor |
| `GET` | `/draws/:id` | Detalle sorteo + tickets del proveedor en ese sorteo |

### 5.2 Query params (listados)

`/tickets`:

- `dateFrom`, `dateTo` (ISO 8601, default: últimos 7 días)
- `gameId` (opcional)
- `status` (opcional: `ACTIVE | WINNING | LOSING | ANNULLED`)
- `page` (default 1)
- `pageSize` (default 25, máx 100)

`/draws`:

- `dateFrom`, `dateTo` (default últimos 7 días)
- `gameId` (opcional)
- `page`, `pageSize`

### 5.3 Servicio — scope forzado

Archivo: `backend/src/services/portal.service.js`. Todas las queries **fuerzan** `apiSystemId = req.apiSystemId`. Los query params nunca permiten cambiar el `apiSystemId` (ignorados).

### 5.4 Status de draws

Filtro por `status IN ('DRAWN', 'PUBLISHED')` para el listado de sorteos completos — producción usa el status legado `PUBLISHED`.

## 6. Frontend — estructura

### 6.1 Árbol de archivos

```
frontend/app/proveedor/
├── layout.js              # Guard role=PROVIDER + sidebar mínimo
├── page.js                # Redirect a /proveedor/tickets
├── tickets/
│   ├── page.js            # Listado + filtros + paginación
│   └── [id]/page.js       # Detalle ticket
└── sorteos/
    ├── page.js            # Lista de sorteos con tráfico del proveedor
    └── [id]/page.js       # Detalle sorteo
```

### 6.2 Layout (`frontend/app/proveedor/layout.js`)

- Client-side guard: lee JWT, si `role !== 'PROVIDER'` → `router.replace('/admin/login')`
- Sidebar: "Tickets", "Sorteos", "Cerrar sesión"
- Header: nombre del proveedor desde `GET /api/portal/me`

### 6.3 Login redirect

Modificar `frontend/app/admin/login/page.js` para añadir branch `role === 'PROVIDER'`.

### 6.4 Página tickets

- Tabla con columnas: Fecha, ID Externo, Juego, Sorteo, Monto, Estado, # Jugadas
- Filtros: rango fechas, juego, estado
- Paginación inferior (25/pág)
- Filtros persisten en URL (`?dateFrom=...`) para que el proveedor comparta links

### 6.5 Detalle ticket

- Header: ID externo, fecha, monto total, estado
- Tabla de jugadas: número, multiplicador, monto, sorteo, resultado (si sorteo ya salió)

### 6.6 Página sorteos

- Columnas: Fecha, Juego, Estado sorteo, # Tickets del proveedor, Número ganador

### 6.7 Detalle sorteo

- Header: juego, fecha/hora, número ganador (o "pendiente")
- Tabla: tickets del proveedor en ese sorteo, flag "Ganador" en verde

### 6.8 Stack

Next.js App Router + Tailwind (mismo que admin). Reusar componentes de `frontend/components/shared/`. Sin nuevas dependencias.

## 7. Seguridad

### 7.1 Defensas en profundidad

1. **Scope forzado en servicio** — `portal.service.js` nunca acepta `apiSystemId` del request; solo de `req.user.apiSystemId`
2. **IDOR prevention** — `/portal/tickets/:id` verifica `ticket.apiSystemId === req.user.apiSystemId`; mismatch → 404
3. **JWT** — payload extendido; usuarios no-PROVIDER tienen `apiSystemId: null`
4. **Rate limit** — aplicar `express-rate-limit` en `/api/portal/*`, 120 req/min por IP
5. **Auditoría** — login del portal + acciones admin de credenciales → `AuditLog`
6. **Revocación** — `User.isActive=false` invalida logins futuros

### 7.2 Manejo de errores

| Caso | Código | Mensaje |
|---|---|---|
| Credenciales inválidas | 401 | "Usuario o contraseña incorrectos" |
| `User PROVIDER` sin `apiSystemId` | 403 | "Cuenta mal configurada, contacte admin" |
| Ticket de otro proveedor | 404 | "No encontrado" |
| Filtros inválidos | 400 | Mensaje específico |
| Error interno | 500 | Log `logger.error`, mensaje genérico |

## 8. Pruebas

### 8.1 Unit (Jest)

- `portal.service.test.js` — `listTickets` siempre inyecta `apiSystemId` en `where`, aunque reciba filtros hostiles que intenten cambiarlo

### 8.2 Integración

`portal.routes.test.js`:

- Login como PROVIDER devuelve JWT con `apiSystemId`
- `GET /portal/tickets` sin token → 401
- `GET /portal/tickets` con token ADMIN → 403
- `GET /portal/tickets/:id` con ticket de otro proveedor → 404
- `webhook.service` setea `apiSystemId` al crear ticket (webhook PUSH)

### 8.3 Backfill

- Dataset sembrado con tickets `WEBHOOK_PUSH` sin `apiSystemId`
- Correr script; verificar todos quedan con `apiSystemId` correcto
- Correr segunda vez; verificar idempotencia (no duplica ni sobrescribe)

### 8.4 Manual frontend

- Login como PROVIDER → redirect a `/proveedor`
- Guard de `/admin/*` bloquea a PROVIDER
- Filtros persisten en URL

## 9. Despliegue

### 9.1 Local

1. Implementar en rama `diazhh`
2. `docker-compose up -d` (Postgres local)
3. `cd backend && npm run db:migrate`
4. `node src/scripts/backfill-ticket-apisystem.js`
5. Crear usuario PROVIDER de prueba vía `/admin/proveedores`
6. Probar flujo completo en `localhost:10000`
7. `npm test` en backend
8. Commits atómicos por capa (prisma / auth / portal backend / portal frontend / tests)
9. Push a `diazhh`

### 9.2 Producción (VPS 144)

Pre-requisitos: local verificado + backup de DB producción.

```bash
# Backup
ssh 144 "PGPASSWORD='ToteSecure2024*' pg_dump -U tote_user -h localhost -p 5433 tote_db \
  > /var/backups/tote_db_$(date +%Y%m%d_%H%M%S).sql"

# Deploy código
ssh 144 "cd /var/proyectos/tote-web && git fetch origin && git checkout diazhh && git pull"

# Backend
ssh 144 "cd /var/proyectos/tote-web/backend && npm ci && npx prisma migrate deploy && npx prisma generate"
ssh 144 "cd /var/proyectos/tote-web/backend && node src/scripts/backfill-ticket-apisystem.js"

# Frontend
ssh 144 "cd /var/proyectos/tote-web/frontend && npm ci && npm run build"

# Restart
ssh 144 "pm2 restart tote-backend && pm2 restart tote-frontend"

# Smoke
ssh 144 "pm2 logs tote-backend --lines 30 --nostream"
curl -I https://tote.atilax.io/api/portal/me   # espera 401
```

Crear usuarios de proveedores en prod desde `/admin/proveedores`, entregar credenciales por canal seguro.

### 9.3 Rollback

```bash
ssh 144 "cd /var/proyectos/tote-web && git checkout <commit-anterior>"
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma migrate resolve --rolled-back <migration-name>"
# Si hubo corrupción:
ssh 144 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 tote_db \
  < /var/backups/tote_db_<timestamp>.sql"
ssh 144 "pm2 restart tote-backend tote-frontend"
```

### 9.4 Merge a `main`

Solo tras 24-48h sin issues en producción. PR `diazhh → main` lo abre el usuario cuando decida.

## 10. Consideraciones fuera de alcance (para futuras iteraciones)

- Multi-usuario por proveedor con roles granulares
- Reportes financieros (total vendido, premiado, comisión)
- Exportación CSV/Excel
- Visor de webhook logs para el proveedor
- Acceso para proveedores PULL (SRQ)
- 2FA en el portal
- API pública con OAuth2 para que el proveedor consulte programáticamente

---

**Archivos afectados (resumen):**

Backend:
- `prisma/schema.prisma` (modificar)
- `prisma/migrations/<timestamp>_add_provider_portal_and_ticket_apisystem/` (nuevo)
- `src/middlewares/provider-scope.middleware.js` (nuevo)
- `src/routes/portal.routes.js` (nuevo)
- `src/controllers/portal.controller.js` (nuevo)
- `src/services/portal.service.js` (nuevo)
- `src/controllers/auth.controller.js` (JWT payload extendido)
- `src/controllers/provider.controller.js` (endpoint crear/resetear portal-user)
- `src/routes/provider.routes.js` (wire del nuevo endpoint)
- `src/services/webhook.service.js` (setear `apiSystemId` al crear ticket)
- `src/app.js` o `src/index.js` (montar `/api/portal`)
- `src/scripts/backfill-ticket-apisystem.js` (nuevo)
- `tests/portal.service.test.js` (nuevo)
- `tests/portal.routes.test.js` (nuevo)

Frontend:
- `app/admin/login/page.js` (redirect por rol)
- `app/admin/proveedores/page.js` (sección "Acceso al portal")
- `app/proveedor/layout.js` (nuevo)
- `app/proveedor/page.js` (nuevo)
- `app/proveedor/tickets/page.js` (nuevo)
- `app/proveedor/tickets/[id]/page.js` (nuevo)
- `app/proveedor/sorteos/page.js` (nuevo)
- `app/proveedor/sorteos/[id]/page.js` (nuevo)
