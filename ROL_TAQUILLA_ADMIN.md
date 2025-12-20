# Rol TAQUILLA_ADMIN

**Fecha de creación:** 2024-12-20  
**Versión:** 1.0

---

## 📋 Descripción

Se ha creado un nuevo rol llamado **TAQUILLA_ADMIN** (Administrador de Taquilla) que tiene acceso exclusivo a las interfaces de administración relacionadas con el sistema de taquilla online, sin acceso a las funcionalidades principales del sistema de sorteos.

---

## 🎯 Propósito

Este rol permite delegar la gestión de la taquilla online (depósitos, retiros, jugadores, tickets) a un usuario específico sin darle acceso completo al sistema de administración de sorteos, juegos, canales, etc.

---

## 🔐 Permisos y Accesos

### ✅ Acceso Permitido

El rol **TAQUILLA_ADMIN** tiene acceso a las siguientes secciones:

1. **Depósitos** (`/admin/depositos`)
   - Ver todos los depósitos
   - Aprobar depósitos
   - Rechazar depósitos
   - Ver detalles de depósitos

2. **Retiros** (`/admin/retiros`)
   - Ver todos los retiros
   - Marcar retiros como procesando
   - Completar retiros
   - Rechazar retiros
   - Ver detalles de retiros

3. **Cuentas Sistema** (`/admin/cuentas-sistema`)
   - Ver cuentas Pago Móvil del sistema
   - Crear nuevas cuentas
   - Editar cuentas existentes
   - Eliminar cuentas
   - Activar/desactivar cuentas

4. **Jugadores** (`/admin/jugadores`)
   - Ver lista de todos los jugadores
   - Ver balance de jugadores
   - Ver estadísticas de jugadores
   - Buscar jugadores

5. **Tickets** (`/admin/tickets`)
   - Ver todos los tickets de jugadas
   - Ver detalles de tickets
   - Ver estadísticas de tickets
   - Filtrar tickets por estado

6. **Reportes Taquilla** (`/admin/reportes-taquilla`)
   - Ver reportes financieros
   - Ver estadísticas de jugadas
   - Ver estadísticas de jugadores
   - Filtrar por rango de fechas

### ❌ Acceso Denegado

El rol **TAQUILLA_ADMIN** NO tiene acceso a:

- Dashboard principal (`/admin`)
- Sorteos (`/admin/sorteos`)
- Juegos (`/admin/juegos`)
- Cuentas Pago Móvil (legacy) (`/admin/pago-movil`)
- Pausas y Emergencia (`/admin/pausas`)
- Usuarios (`/admin/usuarios`)
- Bots Admin (`/admin/bots-admin`)
- Canales (WhatsApp, Telegram, Instagram, Facebook, TikTok)
- Configuración (`/admin/configuracion`)

---

## 🛠️ Implementación Técnica

### Backend

#### 1. Prisma Schema
```prisma
enum UserRole {
  ADMIN           // Acceso completo
  OPERATOR        // Gestión de sorteos
  VIEWER          // Solo lectura
  PLAYER          // Usuario jugador (taquilla online)
  TAQUILLA_ADMIN  // Administrador de taquilla online
}
```

#### 2. Rutas Protegidas

**Archivo:** `backend/src/routes/deposit.routes.js`
```javascript
router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));
```

**Archivo:** `backend/src/routes/withdrawal.routes.js`
```javascript
router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));
```

**Archivo:** `backend/src/routes/system-pago-movil.routes.js`
```javascript
router.use(authorize('ADMIN', 'TAQUILLA_ADMIN'));
```

**Archivo:** `backend/src/routes/admin.routes.js` (nuevo)
```javascript
router.get('/players', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), ...);
router.get('/tickets', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), ...);
```

### Frontend

#### 1. Middleware de Next.js

**Archivo:** `frontend/middleware.js`

El middleware intercepta las rutas de admin y verifica:
- Si la ruta es de taquilla → permite acceso a ADMIN y TAQUILLA_ADMIN
- Si la ruta es de admin general → solo permite ADMIN y OPERATOR
- Si el usuario es TAQUILLA_ADMIN intentando acceder a rutas no permitidas → redirige a `/admin/depositos`

```javascript
const taquillaRoutes = [
  '/admin/depositos',
  '/admin/retiros',
  '/admin/cuentas-sistema',
  '/admin/jugadores',
  '/admin/tickets',
  '/admin/reportes-taquilla'
];
```

#### 2. Layout de Admin

**Archivo:** `frontend/app/admin/layout.js`

El menú de navegación se filtra según el rol:
```javascript
const filteredNav = navigation.filter(item => {
  if (user?.role === 'TAQUILLA_ADMIN') {
    return item.taquillaAccess === true;
  }
  // ... otros filtros
});
```

#### 3. Login

**Archivo:** `frontend/app/login/page.js`

Al hacer login, redirige según el rol:
```javascript
if (user.role === 'TAQUILLA_ADMIN') {
  router.push('/admin/depositos');
}
```

---

## 📄 Páginas Creadas

### 1. Cuentas Sistema (`/admin/cuentas-sistema/page.js`)
- CRUD completo de cuentas Pago Móvil del sistema
- Listado con búsqueda y filtros
- Modal de creación/edición
- Selector de 23 bancos venezolanos

### 2. Jugadores (`/admin/jugadores/page.js`)
- Listado de todos los jugadores
- Estadísticas: total, activos, balance total, balance bloqueado
- Búsqueda por usuario, email o teléfono
- Vista de balance individual

### 3. Tickets (`/admin/tickets/page.js`)
- Listado de todos los tickets
- Estadísticas: total, activos, ganadores, perdedores, apostado, premios
- Filtros por estado
- Búsqueda por usuario o ID

### 4. Reportes Taquilla (`/admin/reportes-taquilla/page.js`)
- Resumen financiero (depósitos, retiros, flujo neto)
- Estadísticas de jugadas (tickets, apostado, premios, ganancia)
- Estadísticas de jugadores
- Filtro por rango de fechas

---

## 🚀 Cómo Crear un Usuario TAQUILLA_ADMIN

### Opción 1: Desde la Base de Datos

```sql
INSERT INTO "User" (
  id, username, email, password, role, "isActive", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'taquilla_admin',
  'taquilla@example.com',
  '$2b$10$hashedpassword', -- Hash de la contraseña
  'TAQUILLA_ADMIN',
  true,
  NOW(),
  NOW()
);
```

### Opción 2: Actualizar Usuario Existente

```sql
UPDATE "User" 
SET role = 'TAQUILLA_ADMIN' 
WHERE username = 'nombre_usuario';
```

### Opción 3: Desde el Panel de Admin (ADMIN role)

Un usuario con rol ADMIN puede crear o modificar usuarios desde `/admin/usuarios` (cuando se implemente el CRUD de usuarios).

---

## 📊 Endpoints API Disponibles

### Depósitos
- `GET /api/deposits` - Listar todos los depósitos
- `GET /api/deposits/:id` - Ver detalle de depósito
- `POST /api/deposits/:id/approve` - Aprobar depósito
- `POST /api/deposits/:id/reject` - Rechazar depósito

### Retiros
- `GET /api/withdrawals` - Listar todos los retiros
- `GET /api/withdrawals/:id` - Ver detalle de retiro
- `POST /api/withdrawals/:id/process` - Marcar como procesando
- `POST /api/withdrawals/:id/complete` - Completar retiro
- `POST /api/withdrawals/:id/reject` - Rechazar retiro

### Cuentas Sistema
- `GET /api/system-pago-movil` - Listar todas las cuentas
- `POST /api/system-pago-movil` - Crear cuenta
- `GET /api/system-pago-movil/:id` - Ver detalle
- `PUT /api/system-pago-movil/:id` - Actualizar cuenta
- `DELETE /api/system-pago-movil/:id` - Eliminar cuenta

### Jugadores
- `GET /api/admin/players` - Listar todos los jugadores

### Tickets
- `GET /api/admin/tickets` - Listar todos los tickets

---

## 🔒 Seguridad

### Niveles de Protección

1. **Middleware de Next.js**: Intercepta peticiones antes de renderizar
2. **Verificación en Componentes**: Los layouts verifican el rol
3. **Backend API**: Todas las rutas protegidas con `authorize()`

### Validaciones

- El middleware verifica el rol antes de permitir acceso a rutas
- El backend valida el rol en cada endpoint
- Las cookies se verifican en el servidor
- Los tokens JWT incluyen el rol del usuario

---

## 📝 Flujo de Trabajo Típico

### Para un TAQUILLA_ADMIN:

1. **Login** → Redirige automáticamente a `/admin/depositos`
2. **Gestionar Depósitos**:
   - Ver depósitos pendientes
   - Aprobar/rechazar depósitos
   - Acreditar saldo a jugadores
3. **Gestionar Retiros**:
   - Ver retiros pendientes
   - Procesar retiros
   - Completar retiros con referencia
4. **Monitorear Jugadores**:
   - Ver balance de jugadores
   - Buscar jugadores específicos
5. **Revisar Tickets**:
   - Ver jugadas activas
   - Ver tickets ganadores
6. **Generar Reportes**:
   - Análisis financiero
   - Estadísticas de jugadas

---

## ✅ Testing

### Credenciales de Prueba

Para crear un usuario de prueba:

```bash
# Crear usuario TAQUILLA_ADMIN
curl -X POST http://localhost:10000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "taquilla_admin",
    "email": "taquilla@test.com",
    "password": "taquilla123",
    "role": "TAQUILLA_ADMIN"
  }'
```

### Verificar Acceso

1. Login con usuario TAQUILLA_ADMIN
2. Verificar redirección a `/admin/depositos`
3. Intentar acceder a `/admin/sorteos` → debe redirigir a `/admin/depositos`
4. Verificar que solo aparecen las opciones de taquilla en el menú

---

## 🎯 Próximos Pasos

### Mejoras Pendientes

1. **CRUD de Usuarios** en `/admin/usuarios` para que ADMIN pueda crear TAQUILLA_ADMIN
2. **Auditoría**: Registrar acciones de TAQUILLA_ADMIN
3. **Notificaciones**: Alertas cuando hay depósitos/retiros pendientes
4. **Dashboard específico**: Crear un dashboard inicial para TAQUILLA_ADMIN
5. **Permisos granulares**: Permitir configurar permisos específicos por TAQUILLA_ADMIN

---

## 📚 Archivos Modificados/Creados

### Backend
- ✅ `backend/prisma/schema.prisma` - Agregado rol TAQUILLA_ADMIN
- ✅ `backend/src/routes/deposit.routes.js` - Autorización actualizada
- ✅ `backend/src/routes/withdrawal.routes.js` - Autorización actualizada
- ✅ `backend/src/routes/system-pago-movil.routes.js` - Autorización actualizada
- ✅ `backend/src/routes/admin.routes.js` - **NUEVO** - Endpoints de jugadores y tickets
- ✅ `backend/src/index.js` - Registrado admin routes

### Frontend
- ✅ `frontend/middleware.js` - Lógica de autorización por rutas
- ✅ `frontend/app/login/page.js` - Redirección según rol
- ✅ `frontend/app/admin/layout.js` - Filtrado de navegación
- ✅ `frontend/app/admin/cuentas-sistema/page.js` - **NUEVO**
- ✅ `frontend/app/admin/jugadores/page.js` - **NUEVO**
- ✅ `frontend/app/admin/tickets/page.js` - **NUEVO**
- ✅ `frontend/app/admin/reportes-taquilla/page.js` - **NUEVO**

---

*Documento generado el: 2024-12-20*
