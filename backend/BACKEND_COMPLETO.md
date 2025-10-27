# Backend Completado - Sistema Totalizador de Loterías

## 🎉 Estado Actual

El backend está **completamente funcional** con todas las características principales implementadas.

---

## ✅ Características Implementadas

### 1. **Autenticación y Autorización**
- ✅ Sistema JWT completo
- ✅ Registro y login de usuarios
- ✅ Roles: ADMIN, OPERATOR, VIEWER
- ✅ Middleware de autenticación
- ✅ Middleware de autorización por roles
- ✅ Cambio de contraseña
- ✅ Gestión de usuarios

### 2. **API REST Completa**

#### Endpoints Públicos (sin autenticación)
- `GET /api/public/games` - Listar juegos activos
- `GET /api/public/draws/today` - Sorteos de hoy
- `GET /api/public/draws/next` - Próximos sorteos
- `GET /api/public/draws/:id` - Detalle de sorteo
- `GET /api/public/draws/game/:slug/today` - Sorteos del día por juego
- `GET /api/public/draws/game/:slug/history` - Histórico con paginación
- `GET /api/public/stats/game/:slug` - Estadísticas del juego

#### Endpoints de Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Usuario actual
- `POST /api/auth/change-password` - Cambiar contraseña
- `POST /api/auth/register` - Registrar usuario (solo ADMIN)
- `GET /api/auth/users` - Listar usuarios (solo ADMIN)
- `PATCH /api/auth/users/:id` - Actualizar usuario (solo ADMIN)

#### Endpoints de Juegos (requiere autenticación)
- `GET /api/games` - Listar juegos
- `GET /api/games/:id` - Obtener juego
- `POST /api/games` - Crear juego (ADMIN/OPERATOR)
- `PATCH /api/games/:id` - Actualizar juego (ADMIN/OPERATOR)
- `DELETE /api/games/:id` - Eliminar juego (ADMIN)
- `GET /api/games/:gameId/items` - Items del juego
- `GET /api/games/:gameId/items/random` - Item aleatorio

#### Endpoints de Items (requiere autenticación)
- `GET /api/items` - Listar items
- `GET /api/items/:id` - Obtener item
- `POST /api/items` - Crear item (ADMIN/OPERATOR)
- `PATCH /api/items/:id` - Actualizar item (ADMIN/OPERATOR)
- `DELETE /api/items/:id` - Eliminar item (ADMIN)

#### Endpoints de Sorteos (requiere autenticación)
- `GET /api/draws` - Listar sorteos
- `GET /api/draws/:id` - Obtener sorteo
- `POST /api/draws` - Crear sorteo manual (ADMIN/OPERATOR)
- `PATCH /api/draws/:id` - Actualizar sorteo (ADMIN/OPERATOR)
- `PATCH /api/draws/:id/winner` - Cambiar ganador (ADMIN/OPERATOR)
- `DELETE /api/draws/:id` - Cancelar sorteo (ADMIN)
- `GET /api/draws/today` - Sorteos de hoy
- `GET /api/draws/upcoming` - Próximos sorteos

#### Endpoints de Plantillas (requiere autenticación)
- `GET /api/templates` - Listar plantillas
- `GET /api/templates/:id` - Obtener plantilla
- `POST /api/templates` - Crear plantilla (ADMIN/OPERATOR)
- `PATCH /api/templates/:id` - Actualizar plantilla (ADMIN/OPERATOR)
- `DELETE /api/templates/:id` - Eliminar plantilla (ADMIN)

#### Endpoints de Pausas (requiere autenticación)
- `GET /api/pauses` - Listar pausas
- `GET /api/pauses/:id` - Obtener pausa
- `POST /api/pauses` - Crear pausa (ADMIN/OPERATOR)
- `PATCH /api/pauses/:id` - Actualizar pausa (ADMIN/OPERATOR)
- `DELETE /api/pauses/:id` - Eliminar pausa (ADMIN)

### 3. **WebSocket (Socket.io)**
- ✅ Conexión en tiempo real
- ✅ Salas por juego: `game:{slug}`
- ✅ Sala de administración: `admin`
- ✅ Eventos emitidos:
  - `draws:generated` - Sorteos generados
  - `draw:closed` - Sorteo cerrado
  - `draw:executed` - Sorteo ejecutado
  - `draw:published` - Sorteo publicado

### 4. **Sistema de Jobs Automatizados**

#### GenerateDailyDrawsJob
- **Frecuencia**: Diario a las 00:05 AM
- **Función**: Genera sorteos del día basándose en plantillas activas
- **Validaciones**: 
  - Verifica pausas de juegos
  - Evita duplicados
  - Registra en audit log

#### CloseDrawJob
- **Frecuencia**: Cada minuto
- **Función**: Cierra sorteos 5 minutos antes y preselecciona ganador
- **Acciones**:
  - Selección aleatoria de número ganador
  - Cambio de estado a CLOSED
  - Notificación WebSocket
  - Registro en audit log

#### ExecuteDrawJob
- **Frecuencia**: Cada minuto
- **Función**: Ejecuta sorteos en su hora programada
- **Acciones**:
  - Confirma número ganador (preseleccionado o cambiado manualmente)
  - Cambio de estado a DRAWN
  - Crea registros de publicación para cada canal
  - Notificación WebSocket
  - Registro en audit log

### 5. **Servicios de Negocio**

- ✅ **AuthService** - Autenticación y gestión de usuarios
- ✅ **GameService** - CRUD de juegos
- ✅ **GameItemService** - CRUD de items
- ✅ **DrawService** - Gestión completa de sorteos
- ✅ **DrawTemplateService** - Gestión de plantillas
- ✅ **DrawPauseService** - Gestión de pausas

### 6. **Seguridad**
- ✅ Helmet.js para headers de seguridad
- ✅ CORS configurado
- ✅ Rate limiting (100 req/15min)
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Tokens JWT con expiración
- ✅ Validación de roles y permisos

### 7. **Logging y Auditoría**
- ✅ Winston para logging estructurado
- ✅ Logs de todas las requests
- ✅ Logs de errores con stack trace
- ✅ Audit log en base de datos para acciones críticas

### 8. **Base de Datos**
- ✅ Prisma ORM
- ✅ PostgreSQL
- ✅ 9 entidades principales
- ✅ Índices optimizados
- ✅ Relaciones y cascadas configuradas

---

## 📁 Estructura de Archivos

```
backend/
├── src/
│   ├── controllers/          # Controladores HTTP
│   │   ├── auth.controller.js
│   │   ├── draw.controller.js
│   │   ├── draw-pause.controller.js
│   │   ├── draw-template.controller.js
│   │   ├── game.controller.js
│   │   ├── game-item.controller.js
│   │   └── public.controller.js
│   ├── services/             # Lógica de negocio
│   │   ├── auth.service.js
│   │   ├── draw.service.js
│   │   ├── draw-pause.service.js
│   │   ├── draw-template.service.js
│   │   ├── game.service.js
│   │   └── game-item.service.js
│   ├── routes/               # Definición de rutas
│   │   ├── auth.routes.js
│   │   ├── draw.routes.js
│   │   ├── draw-pause.routes.js
│   │   ├── draw-template.routes.js
│   │   ├── game.routes.js
│   │   ├── game-item.routes.js
│   │   └── public.routes.js
│   ├── middlewares/          # Middlewares
│   │   └── auth.middleware.js
│   ├── jobs/                 # Jobs programados
│   │   ├── generate-daily-draws.job.js
│   │   ├── close-draw.job.js
│   │   ├── execute-draw.job.js
│   │   └── index.js
│   ├── lib/                  # Utilidades y configuración
│   │   ├── prisma.js
│   │   ├── logger.js
│   │   └── socket.js
│   ├── scripts/              # Scripts de utilidad
│   │   ├── migrate-legacy.js
│   │   └── seed.js
│   └── index.js              # Punto de entrada
├── prisma/
│   └── schema.prisma         # Esquema de base de datos
├── .env.example              # Variables de entorno
├── package.json
└── README.md
```

---

## 🚀 Instalación y Uso

### 1. Instalar dependencias
```bash
cd backend
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### 3. Configurar base de datos
```bash
# Generar cliente Prisma
npm run db:generate

# Aplicar migraciones
npm run db:push

# Crear usuarios iniciales
npm run db:seed
```

### 4. (Opcional) Migrar datos legacy
```bash
npm run migrate:legacy
```

### 5. Iniciar servidor
```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

El servidor estará disponible en `http://localhost:3001`

---

## 🔑 Usuarios por Defecto

Después de ejecutar `npm run db:seed`:

**Administrador:**
- Username: `admin`
- Password: `admin123`
- Role: `ADMIN`

**Operador:**
- Username: `operator`
- Password: `operator123`
- Role: `OPERATOR`

⚠️ **IMPORTANTE**: Cambiar estas contraseñas en producción.

---

## 🧪 Probar la API

### 1. Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "username": "admin",
      "email": "admin@tote.com",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. Usar el token en requests protegidos
```bash
curl http://localhost:3001/api/games \
  -H "Authorization: Bearer {TOKEN}"
```

### 3. Endpoints públicos (sin token)
```bash
# Listar juegos
curl http://localhost:3001/api/public/games

# Sorteos de hoy
curl http://localhost:3001/api/public/draws/today

# Próximos sorteos
curl http://localhost:3001/api/public/draws/next
```

---

## 📊 Sistema de Jobs

Los jobs se ejecutan automáticamente al iniciar el servidor (si `ENABLE_JOBS=true`).

### Deshabilitar jobs temporalmente
```bash
# En .env
ENABLE_JOBS=false
```

### Ejecutar jobs manualmente
```javascript
import jobs from './src/jobs/index.js';

// Generar sorteos del día
await jobs.generateDailyDrawsJob.execute();

// Cerrar sorteos pendientes
await jobs.closeDrawJob.execute();

// Ejecutar sorteos
await jobs.executeDrawJob.execute();
```

---

## 🔌 WebSocket

### Conectar desde el cliente
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// Unirse a sala de un juego
socket.emit('join:game', 'triple');

// Escuchar eventos
socket.on('draw:closed', (data) => {
  console.log('Sorteo cerrado:', data);
});

socket.on('draw:executed', (data) => {
  console.log('Sorteo ejecutado:', data);
});
```

---

## 📝 Próximos Pasos

### Pendientes para completar el sistema:

1. **Generación de Imágenes**
   - Implementar generadores específicos por tipo de juego
   - Integrar con ExecuteDrawJob

2. **Bot de Telegram**
   - Configurar bot
   - Comandos de administración
   - Notificaciones automáticas

3. **Publishers**
   - Implementar publicadores para cada canal
   - Job de publicación
   - Job de reintentos

4. **Frontend**
   - Landing page pública
   - Dashboard administrativo

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"
- Verificar que PostgreSQL esté corriendo
- Verificar DATABASE_URL en .env

### Error: "JWT secret not configured"
- Configurar JWT_SECRET en .env

### Jobs no se ejecutan
- Verificar ENABLE_JOBS=true en .env
- Revisar logs del servidor

---

## 📚 Documentación Adicional

- [MODELO_DATOS.md](../MODELO_DATOS.md) - Esquema de base de datos
- [API_ENDPOINTS.md](../API_ENDPOINTS.md) - Documentación completa de APIs
- [JOBS_SYSTEM.md](../JOBS_SYSTEM.md) - Sistema de jobs detallado
- [PLANIFICACION.md](../PLANIFICACION.md) - Planificación del proyecto

---

**Última actualización**: 2025-10-01
