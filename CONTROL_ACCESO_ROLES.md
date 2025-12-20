# Control de Acceso Basado en Roles

## 📋 Resumen

Se ha implementado un **sistema completo de control de acceso basado en roles** para separar correctamente los usuarios PLAYER de los usuarios ADMIN/OPERATOR.

---

## 🔐 Implementación Backend

### Middleware de Autorización

El backend ya contaba con el middleware `authorize()` en `@/home/diazhh/dev/tote-web/backend/src/middlewares/auth.middleware.js:56-74` que verifica roles antes de permitir acceso a rutas protegidas.

### Rutas Protegidas

**Rutas de Admin (requieren rol ADMIN):**
- `GET /api/deposits` - Listar todos los depósitos
- `POST /api/deposits/:id/approve` - Aprobar depósito
- `POST /api/deposits/:id/reject` - Rechazar depósito
- `GET /api/withdrawals` - Listar todos los retiros
- `POST /api/withdrawals/:id/process` - Procesar retiro
- `POST /api/withdrawals/:id/complete` - Completar retiro
- `POST /api/withdrawals/:id/reject` - Rechazar retiro
- `POST /api/system-pago-movil` - CRUD de cuentas sistema

**Rutas de Jugador (requieren autenticación, cualquier rol):**
- `POST /api/deposits` - Crear depósito
- `GET /api/deposits/my-deposits` - Mis depósitos
- `POST /api/withdrawals` - Solicitar retiro
- `GET /api/withdrawals/my-withdrawals` - Mis retiros
- `DELETE /api/withdrawals/:id` - Cancelar retiro
- `GET /api/player/*` - Todas las consultas de jugador

---

## 🎨 Implementación Frontend

### 1. Middleware de Next.js

**Archivo:** `@/home/diazhh/dev/tote-web/frontend/middleware.js:1-62`

Intercepta todas las peticiones a rutas protegidas y verifica:
- Si el usuario está autenticado (tiene token)
- Si el usuario tiene el rol correcto para la ruta solicitada

**Rutas protegidas:**
- `/admin/*` - Solo ADMIN y OPERATOR
- `/dashboard/*` - Solo PLAYER
- `/depositos/*` - Solo PLAYER
- `/retiros/*` - Solo PLAYER
- `/cuentas/*` - Solo PLAYER

### 2. Redirección en Login

**Archivo:** `@/home/diazhh/dev/tote-web/frontend/app/login/page.js:18-27`

Después de un login exitoso, redirige según el rol:
- **ADMIN/OPERATOR** → `/admin`
- **PLAYER** → `/dashboard`

### 3. Protección en Layouts

**Admin Layout:** `@/home/diazhh/dev/tote-web/frontend/app/admin/layout.js:16-33`
- Verifica autenticación
- Si el usuario es PLAYER, redirige a `/dashboard`

**Dashboard Page:** `@/home/diazhh/dev/tote-web/frontend/app/dashboard/page.js:18-33`
- Verifica autenticación
- Si el usuario es ADMIN/OPERATOR, redirige a `/admin`

### 4. Cookies para Middleware

**Archivo:** `@/home/diazhh/dev/tote-web/frontend/lib/stores/authStore.js:29-37`

Al hacer login, se guardan tanto en localStorage como en cookies:
- `accessToken` - Token JWT
- `user` - Datos del usuario (incluye rol)

Las cookies permiten que el middleware de Next.js pueda verificar el rol antes de renderizar la página.

---

## ✅ Pruebas Realizadas

### Usuario Jugador (PLAYER)

**Credenciales:**
```
Usuario: jugador1
Contraseña: jugador123
Rol: PLAYER
```

**Acceso permitido:**
- ✅ `/dashboard` - Dashboard de jugador
- ✅ `/depositos` - Página de depósitos
- ✅ `/retiros` - Página de retiros
- ✅ `/cuentas` - Gestión de cuentas Pago Móvil
- ✅ `GET /api/player/balance` - Consultar balance
- ✅ `POST /api/deposits` - Crear depósito
- ✅ `POST /api/withdrawals` - Solicitar retiro

**Acceso denegado:**
- ❌ `/admin` - Redirige a `/dashboard`
- ❌ `GET /api/deposits` - Error 403: "No tienes permisos"
- ❌ `POST /api/deposits/:id/approve` - Error 403

### Usuario Administrador (ADMIN)

**Credenciales:**
```
Usuario: admin
Contraseña: admin123
Rol: ADMIN
```

**Acceso permitido:**
- ✅ `/admin` - Panel de administración
- ✅ Todas las rutas de admin
- ✅ Todas las rutas de API admin

**Acceso denegado:**
- ❌ `/dashboard` - Redirige a `/admin`
- ❌ Rutas de jugador redirigen a `/admin`

---

## 🔒 Niveles de Seguridad

### Nivel 1: Middleware de Next.js
Intercepta peticiones antes de renderizar páginas. Verifica cookies.

### Nivel 2: Verificación en Componentes
Los layouts y páginas verifican el rol del usuario en `useEffect`.

### Nivel 3: Backend API
Todas las rutas sensibles están protegidas con `authorize()` middleware.

---

## 📝 Archivos Modificados

### Backend
- ✅ Ya estaba implementado correctamente

### Frontend
1. `@/home/diazhh/dev/tote-web/frontend/middleware.js` - **NUEVO**
2. `@/home/diazhh/dev/tote-web/frontend/app/login/page.js` - Modificado
3. `@/home/diazhh/dev/tote-web/frontend/app/admin/layout.js` - Modificado
4. `@/home/diazhh/dev/tote-web/frontend/app/dashboard/page.js` - Modificado
5. `@/home/diazhh/dev/tote-web/frontend/lib/stores/authStore.js` - Modificado
6. `@/home/diazhh/dev/tote-web/frontend/components/common/ProtectedRoute.js` - **NUEVO** (componente auxiliar)

---

## 🚀 Cómo Probar

### 1. Iniciar Backend
```bash
cd backend
npm start
```

### 2. Iniciar Frontend
```bash
cd frontend
npm run dev
```

### 3. Probar Usuario Jugador
1. Ir a `http://localhost:3000/login`
2. Ingresar: `jugador1` / `jugador123`
3. Verificar que redirige a `/dashboard`
4. Intentar acceder a `http://localhost:3000/admin`
5. Verificar que redirige de vuelta a `/dashboard`

### 4. Probar Usuario Admin
1. Hacer logout
2. Ingresar: `admin` / `admin123`
3. Verificar que redirige a `/admin`
4. Intentar acceder a `http://localhost:3000/dashboard`
5. Verificar que redirige de vuelta a `/admin`

---

## 🎯 Resultado

✅ **Problema resuelto:** Los usuarios PLAYER ya no pueden acceder al panel de administración.

✅ **Seguridad implementada:** Control de acceso en 3 niveles (middleware, componentes, backend).

✅ **Experiencia de usuario:** Redirección automática según el rol del usuario.

---

*Documento generado el: 2024-12-20*
