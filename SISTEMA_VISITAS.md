# Sistema de Rastreo de Visitas

Sistema completo para registrar y analizar visitas a todos los módulos de administración, landing page y secciones de jugadores.

## 📋 Características

- ✅ Rastreo automático de visitas a páginas
- ✅ Identificación de usuarios autenticados y anónimos
- ✅ Seguimiento de duración de visitas
- ✅ Análisis de sesiones
- ✅ Estadísticas y reportes
- ✅ Soporte para todos los módulos del sistema

## 🗄️ Base de Datos

### Modelo PageVisit

```prisma
model PageVisit {
  id          String    @id @default(uuid())
  userId      String?   // Opcional, puede ser anónimo
  pageType    PageType
  pagePath    String    // Ruta completa de la página
  userAgent   String?   // User agent del navegador
  ipAddress   String?   // IP del visitante
  referrer    String?   // De dónde viene
  sessionId   String?   // ID de sesión para agrupar visitas
  duration    Int?      // Duración en segundos
  createdAt   DateTime  @default(now())
  
  user        User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
}
```

### Tipos de Páginas (PageType)

**Administración:**
- `ADMIN_DASHBOARD` - Dashboard principal
- `ADMIN_SORTEOS` - Módulo de sorteos
- `ADMIN_JUEGOS` - Módulo de juegos
- `ADMIN_USUARIOS` - Módulo de usuarios
- `ADMIN_JUGADORES` - Módulo de jugadores
- `ADMIN_DEPOSITOS` - Módulo de depósitos
- `ADMIN_RETIROS` - Módulo de retiros
- `ADMIN_TICKETS` - Módulo de tickets
- `ADMIN_REPORTES` - Módulo de reportes
- `ADMIN_TELEGRAM` - Módulo de Telegram
- `ADMIN_WHATSAPP` - Módulo de WhatsApp
- `ADMIN_FACEBOOK` - Módulo de Facebook
- `ADMIN_INSTAGRAM` - Módulo de Instagram
- `ADMIN_TIKTOK` - Módulo de TikTok
- `ADMIN_BOTS` - Módulo de bots admin
- `ADMIN_PAUSAS` - Módulo de pausas
- `ADMIN_CONFIG` - Módulo de configuración
- `ADMIN_PERFIL` - Perfil de usuario
- `ADMIN_CUENTAS` - Cuentas del sistema
- `ADMIN_PAGO_MOVIL` - Pago móvil

**Jugadores:**
- `PLAYER_DASHBOARD` - Dashboard de jugador
- `PLAYER_JUGAR` - Página de jugar
- `PLAYER_BALANCE` - Balance histórico
- `PLAYER_CUENTAS` - Cuentas de pago móvil
- `PLAYER_DEPOSITOS` - Depósitos del jugador
- `PLAYER_RETIROS` - Retiros del jugador

**Público:**
- `LANDING` - Página de inicio

## 🔧 Migración de Base de Datos

Ejecutar la migración de Prisma:

```bash
cd backend
npx prisma migrate dev --name add_page_visits
npx prisma generate
```

## 🎣 Hook de Frontend

### usePageVisit

Hook personalizado para rastrear visitas automáticamente.

**Uso básico:**

```javascript
import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';

export default function MiPagina() {
  // Rastrear visita automáticamente
  usePageVisit(PAGE_TYPES.ADMIN_SORTEOS, '/admin/sorteos');
  
  return (
    <div>Mi contenido</div>
  );
}
```

**Características:**
- ✅ Rastreo automático al montar el componente
- ✅ Registro de duración al desmontar
- ✅ Soporte para usuarios autenticados y anónimos
- ✅ Generación automática de session ID
- ✅ Captura de referrer

## 📡 API Endpoints

### POST /api/page-visits/track

Registra una nueva visita.

**Body:**
```json
{
  "pageType": "ADMIN_DASHBOARD",
  "pagePath": "/admin",
  "sessionId": "optional-session-id",
  "referrer": "https://example.com"
}
```

**Headers (opcional):**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "visitId": "uuid"
}
```

### PATCH /api/page-visits/:visitId/duration

Actualiza la duración de una visita.

**Body:**
```json
{
  "duration": 120
}
```

### GET /api/page-visits/stats

Obtiene estadísticas de visitas (requiere autenticación).

**Query params:**
- `startDate` - Fecha de inicio (ISO 8601)
- `endDate` - Fecha de fin (ISO 8601)
- `pageType` - Filtrar por tipo de página
- `userId` - Filtrar por usuario

**Response:**
```json
{
  "totalVisits": 1500,
  "visitsByPage": [
    { "pageType": "LANDING", "count": 500 },
    { "pageType": "ADMIN_DASHBOARD", "count": 300 }
  ],
  "visitsByUser": [
    { "userId": "uuid", "count": 50 }
  ],
  "avgDuration": 180,
  "recentVisits": [...]
}
```

### GET /api/page-visits/date-range

Obtiene visitas agrupadas por fecha (requiere autenticación).

**Query params:**
- `startDate` - Fecha de inicio (requerido)
- `endDate` - Fecha de fin (requerido)
- `groupBy` - `hour`, `day`, o `month` (default: `day`)

**Response:**
```json
[
  {
    "date": "2024-12-20",
    "total": 150,
    "byPage": {
      "LANDING": 80,
      "ADMIN_DASHBOARD": 40,
      "PLAYER_JUGAR": 30
    }
  }
]
```

## 💻 Ejemplos de Integración

### Landing Page

```javascript
'use client';

import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';

export default function HomePage() {
  usePageVisit(PAGE_TYPES.LANDING, '/');
  
  return (
    <div>
      {/* Contenido de la página */}
    </div>
  );
}
```

### Admin Dashboard

```javascript
'use client';

import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';

export default function AdminDashboard() {
  usePageVisit(PAGE_TYPES.ADMIN_DASHBOARD, '/admin');
  
  return (
    <div>
      {/* Contenido del dashboard */}
    </div>
  );
}
```

### Módulo de Sorteos

```javascript
'use client';

import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';

export default function SorteosPage() {
  usePageVisit(PAGE_TYPES.ADMIN_SORTEOS, '/admin/sorteos');
  
  return (
    <div>
      {/* Contenido de sorteos */}
    </div>
  );
}
```

### Página de Jugar (Jugadores)

```javascript
'use client';

import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';

export default function JugarPage() {
  usePageVisit(PAGE_TYPES.PLAYER_JUGAR, '/jugar');
  
  return (
    <div>
      {/* Contenido de jugar */}
    </div>
  );
}
```

## 📊 Consultas Útiles

### Visitas por página en los últimos 7 días

```sql
SELECT 
  "pageType",
  COUNT(*) as visits,
  COUNT(DISTINCT "userId") as unique_users,
  AVG(duration) as avg_duration_seconds
FROM "PageVisit"
WHERE "createdAt" >= NOW() - INTERVAL '7 days'
GROUP BY "pageType"
ORDER BY visits DESC;
```

### Usuarios más activos

```sql
SELECT 
  u.username,
  u.email,
  COUNT(pv.id) as total_visits,
  AVG(pv.duration) as avg_duration
FROM "PageVisit" pv
JOIN "User" u ON pv."userId" = u.id
WHERE pv."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.username, u.email
ORDER BY total_visits DESC
LIMIT 10;
```

### Visitas por hora del día

```sql
SELECT 
  EXTRACT(HOUR FROM "createdAt") as hour,
  COUNT(*) as visits
FROM "PageVisit"
WHERE "createdAt" >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;
```

## 🔐 Seguridad

- ✅ Endpoint de tracking permite usuarios anónimos (optionalAuth)
- ✅ Endpoints de estadísticas requieren autenticación
- ✅ IPs y user agents se registran para análisis
- ✅ No se expone información sensible en respuestas

## 🚀 Próximos Pasos

1. Integrar el hook en todas las páginas del sistema
2. Crear dashboard de analytics en el admin
3. Implementar alertas para patrones inusuales
4. Agregar filtros avanzados en reportes
5. Exportación de datos a CSV/Excel

## 📝 Notas

- El hook usa `sessionStorage` para mantener el session ID durante la sesión del navegador
- La duración se envía usando `navigator.sendBeacon` para garantizar el envío incluso al cerrar la página
- Las visitas anónimas se registran sin `userId`
- El sistema es compatible con usuarios autenticados y no autenticados
