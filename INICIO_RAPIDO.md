# 🚀 Inicio Rápido - Sistema Totalizador de Loterías

## ✅ Estado Actual

**Backend:** 100% Completado y Funcional  
**Frontend:** Pendiente (próximo paso)

---

## 📋 Requisitos Previos

- Node.js 20+
- PostgreSQL 14+
- npm o yarn

---

## ⚡ Iniciar el Backend (5 pasos)

### 1️⃣ Instalar dependencias

```bash
cd backend
npm install
```

### 2️⃣ Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` y configurar:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/tote_db?schema=public"
PORT=3001
JWT_SECRET="tu-secreto-seguro-aqui"
```

### 3️⃣ Configurar base de datos

```bash
# Generar cliente Prisma
npm run db:generate

# Aplicar schema a PostgreSQL
npm run db:push

# Crear usuarios iniciales (admin/operator)
npm run db:seed
```

### 4️⃣ (Opcional) Migrar datos legacy

Si tienes datos de MySQL legacy:

```bash
# Configurar en .env:
# LEGACY_DB_HOST, LEGACY_DB_USER, LEGACY_DB_PASSWORD, LEGACY_DB_NAME

npm run migrate:legacy
```

### 5️⃣ Iniciar servidor

```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

✅ **Servidor corriendo en:** `http://localhost:3001`

---

## 🔑 Credenciales por Defecto

Después de ejecutar `npm run db:seed`:

| Usuario | Password | Rol |
|---------|----------|-----|
| `admin` | `admin123` | ADMIN |
| `operator` | `operator123` | OPERATOR |

⚠️ **IMPORTANTE:** Cambiar estas contraseñas en producción.

---

## 🧪 Probar la API

### 1. Health Check

```bash
curl http://localhost:3001/health
```

### 2. Login

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
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. Endpoints Públicos (sin autenticación)

```bash
# Listar juegos activos
curl http://localhost:3001/api/public/games

# Sorteos de hoy
curl http://localhost:3001/api/public/draws/today

# Próximos sorteos
curl http://localhost:3001/api/public/draws/next

# Histórico de un juego
curl http://localhost:3001/api/public/draws/game/triple/history?page=1&pageSize=20
```

### 4. Endpoints Protegidos (con token)

```bash
# Guardar el token en una variable
TOKEN="tu-token-aqui"

# Listar juegos (protegido)
curl http://localhost:3001/api/games \
  -H "Authorization: Bearer $TOKEN"

# Crear plantilla de sorteo
curl -X POST http://localhost:3001/api/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "game-uuid",
    "name": "Plantilla Lunes-Viernes",
    "daysOfWeek": [1,2,3,4,5],
    "drawTimes": ["08:00", "09:00", "10:00", "11:00", "12:00"]
  }'
```

---

## 📡 WebSocket

### Conectar desde JavaScript

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// Unirse a sala de un juego
socket.emit('join:game', 'triple');

// Escuchar eventos
socket.on('draw:closed', (data) => {
  console.log('🔒 Sorteo cerrado:', data);
});

socket.on('draw:executed', (data) => {
  console.log('🎲 Sorteo ejecutado:', data);
  console.log('Ganador:', data.winnerItem);
});

socket.on('draws:generated', (data) => {
  console.log('📅 Sorteos generados:', data);
});
```

---

## ⏰ Sistema de Jobs

Los jobs se ejecutan automáticamente al iniciar el servidor:

### GenerateDailyDrawsJob
- **Frecuencia:** Diario a las 00:05 AM
- **Función:** Genera sorteos del día basándose en plantillas activas

### CloseDrawJob
- **Frecuencia:** Cada minuto
- **Función:** Cierra sorteos 5 minutos antes y preselecciona ganador

### ExecuteDrawJob
- **Frecuencia:** Cada minuto
- **Función:** Ejecuta sorteos en su hora programada

### Deshabilitar jobs temporalmente

En `.env`:
```env
ENABLE_JOBS=false
```

---

## 📊 Estructura de la API

```
/api
├── /public (sin autenticación)
│   ├── /games
│   ├── /draws/today
│   ├── /draws/next
│   ├── /draws/:id
│   ├── /draws/game/:slug/today
│   ├── /draws/game/:slug/history
│   └── /stats/game/:slug
│
├── /auth
│   ├── POST /login
│   ├── GET /me
│   ├── POST /change-password
│   ├── POST /register (ADMIN)
│   └── GET /users (ADMIN)
│
├── /games (autenticación requerida)
│   ├── GET /
│   ├── GET /:id
│   ├── POST / (ADMIN/OPERATOR)
│   ├── PATCH /:id (ADMIN/OPERATOR)
│   └── DELETE /:id (ADMIN)
│
├── /items (autenticación requerida)
│   ├── GET /
│   ├── GET /:id
│   ├── POST / (ADMIN/OPERATOR)
│   ├── PATCH /:id (ADMIN/OPERATOR)
│   └── DELETE /:id (ADMIN)
│
├── /draws (autenticación requerida)
│   ├── GET /
│   ├── GET /:id
│   ├── POST / (ADMIN/OPERATOR)
│   ├── PATCH /:id (ADMIN/OPERATOR)
│   ├── PATCH /:id/winner (ADMIN/OPERATOR)
│   └── DELETE /:id (ADMIN)
│
├── /templates (autenticación requerida)
│   ├── GET /
│   ├── GET /:id
│   ├── POST / (ADMIN/OPERATOR)
│   ├── PATCH /:id (ADMIN/OPERATOR)
│   └── DELETE /:id (ADMIN)
│
└── /pauses (autenticación requerida)
    ├── GET /
    ├── GET /:id
    ├── POST / (ADMIN/OPERATOR)
    ├── PATCH /:id (ADMIN/OPERATOR)
    └── DELETE /:id (ADMIN)
```

---

## 🔧 Comandos Útiles

```bash
# Ver base de datos en navegador
npm run db:studio

# Generar cliente Prisma después de cambios en schema
npm run db:generate

# Aplicar cambios de schema a BD
npm run db:push

# Crear migración (producción)
npm run db:migrate

# Formatear código
npm run format

# Linter
npm run lint
```

---

## 📚 Documentación Completa

- [BACKEND_COMPLETO.md](./backend/BACKEND_COMPLETO.md) - Guía completa del backend
- [RESUMEN_BACKEND.md](./RESUMEN_BACKEND.md) - Resumen ejecutivo
- [MODELO_DATOS.md](./MODELO_DATOS.md) - Esquema de base de datos
- [API_ENDPOINTS.md](./API_ENDPOINTS.md) - Documentación de APIs
- [JOBS_SYSTEM.md](./JOBS_SYSTEM.md) - Sistema de jobs
- [ESTADO_ACTUAL.md](./ESTADO_ACTUAL.md) - Estado del proyecto

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"
```bash
# Verificar que PostgreSQL esté corriendo
sudo systemctl status postgresql

# Verificar DATABASE_URL en .env
```

### Error: "JWT secret not configured"
```bash
# Configurar JWT_SECRET en .env
JWT_SECRET="tu-secreto-aqui"
```

### Jobs no se ejecutan
```bash
# Verificar en .env
ENABLE_JOBS=true

# Revisar logs del servidor
```

### Puerto 3001 ya en uso
```bash
# Cambiar puerto en .env
PORT=3002

# O matar proceso en puerto 3001
lsof -ti:3001 | xargs kill -9
```

---

## 🎯 Próximos Pasos

1. ✅ **Backend completado** - Listo para usar
2. ⏳ **Crear Frontend** - Next.js con landing page y dashboard
3. ⏳ **Generación de imágenes** - Sharp para crear imágenes de sorteos
4. ⏳ **Bot de Telegram** - Notificaciones y administración
5. ⏳ **Publishers** - Publicación en redes sociales

---

## 💡 Tips

- Usa Postman o Thunder Client para probar la API
- Revisa los logs del servidor para debugging
- El sistema de jobs se ejecuta automáticamente
- Los sorteos se generan diariamente a las 00:05 AM
- Los sorteos se cierran 5 minutos antes de su hora
- Los sorteos se ejecutan en su hora exacta

---

**¿Necesitas ayuda?** Revisa la documentación completa en los archivos MD del proyecto.
