# Arquitectura del Sistema - Diagrama y Flujos

## Diagrama de Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIOS                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Administrador│  │   Telegram   │  │   Clientes   │          │
│  │     Web      │  │     Bot      │  │   Públicos   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
└─────────┼──────────────────┼──────────────────────────────────┘
          │                  │
          │                  │
┌─────────▼──────────────────▼──────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Next.js Frontend (React)                    │  │
│  │  - Dashboard  - Sorteos  - Juegos  - Histórico          │  │
│  │  - shadcn/ui  - TailwindCSS  - Zustand  - Socket.io     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────┬──────────────────────────────────────────────────────┘
          │ HTTPS/WSS
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                    CAPA DE APLICACIÓN                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Express.js API Server (TypeScript)               │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │Controllers │  │  Services  │  │Middlewares │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │   JWT      │  │  Validation│  │   CORS     │         │  │
│  │  │   Auth     │  │   Errors   │  │  Logger    │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Sistema de Jobs (node-cron)                 │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │  Generate    │  │ Close Draw   │  │Execute Draw  │   │  │
│  │  │ Daily Draws  │  │    Job       │  │    Job       │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │  Publish     │  │    Retry     │  │   Cleanup    │   │  │
│  │  │  Draw Job    │  │ Failed Pubs  │  │   Old Data   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Generador de Imágenes (Sharp)                  │  │
│  │  - Templates  - Composición de Capas  - Optimización    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Bot de Telegram (node-telegram-bot-api)     │  │
│  │  - Comandos  - Notificaciones  - Administración         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────┬───────────────────┬───────────────────┬──────────────┘
          │                   │                   │
          │                   │                   │
┌─────────▼──────────┐ ┌──────▼─────────┐ ┌──────▼──────────────┐
│   CAPA DE DATOS    │ │ ALMACENAMIENTO │ │ INTEGRACIONES       │
│  ┌──────────────┐  │ │ ┌────────────┐ │ │ ┌─────────────────┐ │
│  │  PostgreSQL  │  │ │ │ Filesystem │ │ │ │    Telegram     │ │
│  │              │  │ │ │  /storage  │ │ │ │    (Channels)   │ │
│  │  - Games     │  │ │ │            │ │ │ └─────────────────┘ │
│  │  - Draws     │  │ │ │ - images/  │ │ │ ┌─────────────────┐ │
│  │  - Items     │  │ │ │ - templates│ │ │ │    WhatsApp     │ │
│  │  - Users     │  │ │ └────────────┘ │ │ │ (whatsapp-web)  │ │
│  │  - Logs      │  │ │                │ │ └─────────────────┘ │
│  └──────────────┘  │ │                │ │ ┌─────────────────┐ │
│  (Prisma ORM)      │ │                │ │ │    Facebook     │ │
└────────────────────┘ └────────────────┘ │ │   (Graph API)   │ │
                                          │ └─────────────────┘ │
                                          │ ┌─────────────────┐ │
                                          │ │    Instagram    │ │
                                          │ │   (Graph API)   │ │
                                          │ └─────────────────┘ │
                                          │ ┌─────────────────┐ │
                                          │ │     TikTok      │ │
                                          │ │  (Content API)  │ │
                                          │ └─────────────────┘ │
                                          └─────────────────────┘
```

---

## Flujo de Datos Principal

### 1. Generación Diaria de Sorteos

```
┌──────────────┐
│  00:05 AM    │
│  Cron Job    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│ GenerateDailyDrawsJob       │
│ 1. Obtener fecha actual     │
│ 2. Buscar plantillas activas│
│ 3. Verificar pausas         │
│ 4. Crear sorteos SCHEDULED  │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────┐
│   PostgreSQL    │
│   Tabla: Draw   │
│   Status:       │
│   SCHEDULED     │
└─────────────────┘
```

---

### 2. Cierre de Sorteo (5 minutos antes)

```
┌──────────────┐
│ Cada minuto  │
│  Cron Job    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│    CloseDrawJob             │
│ 1. Buscar draws próximos    │
│    (en 5 minutos)           │
│ 2. Seleccionar número       │
│    aleatorio                │
│ 3. Actualizar status:CLOSED │
│ 4. Preseleccionar ganador   │
└──────┬──────────────────────┘
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌────────────────┐
│ PostgreSQL  │  │ Telegram Bot   │
│ Update Draw │  │ Notificar      │
│             │  │ Admins         │
└─────────────┘  └────────────────┘
       │
       ▼
┌─────────────────┐
│  WebSocket      │
│  Emit:          │
│  'draw:closed'  │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  Frontend       │
│  Update UI      │
└─────────────────┘
```

---

### 3. Ejecución de Sorteo (Hora exacta)

```
┌──────────────┐
│ Cada minuto  │
│  Cron Job    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│    ExecuteDrawJob           │
│ 1. Buscar draws CLOSED      │
│    en hora actual           │
│ 2. Confirmar ganador        │
│ 3. Generar imagen           │
│ 4. Crear publicaciones      │
│ 5. Status: PUBLISHED        │
└──────┬──────────────────────┘
       │
       ├────────────┐
       │            │
       ▼            ▼
┌──────────────┐  ┌────────────────────┐
│Image Generator│  │   PostgreSQL       │
│              │  │ - Update Draw      │
│ 1. Load      │  │ - Create           │
│    template  │  │   DrawPublications │
│ 2. Compose   │  └────────────────────┘
│    layers    │
│ 3. Generate  │
│    PNG       │
│ 4. Save      │
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│  /storage/      │
│  images/draws/  │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  WebSocket      │
│  Emit:          │
│'draw:executed'  │
└─────────────────┘
```

---

### 4. Publicación en Canales

```
┌──────────────┐
│ Cada 30 seg  │
│  Cron Job    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│    PublishDrawJob           │
│ 1. Buscar DrawPublications  │
│    status: PENDING          │
│ 2. Cargar imagen            │
│ 3. Preparar mensaje         │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   PublisherManager          │
│   Seleccionar publisher     │
│   según canal               │
└──────┬──────────────────────┘
       │
       ├────────┬──────────┬──────────┬──────────┐
       │        │          │          │          │
       ▼        ▼          ▼          ▼          ▼
┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│Telegram  ││WhatsApp  ││Facebook  ││Instagram ││TikTok    │
│Publisher ││Publisher ││Publisher ││Publisher ││Publisher │
└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘
     │           │           │           │           │
     ▼           ▼           ▼           ▼           ▼
┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│Telegram  ││WhatsApp  ││Facebook  ││Instagram ││TikTok    │
│API       ││Web.js    ││Graph API ││Graph API ││API       │
└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘
     │           │           │           │           │
     └───────────┴───────────┴───────────┴───────────┘
                          │
                          ▼
                ┌─────────────────┐
                │   PostgreSQL    │
                │ Update status:  │
                │ SENT / FAILED   │
                └─────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │   WebSocket     │
                │ Emit: 'pub:sent'│
                └─────────────────┘
```

---

## Flujo de Interacción del Administrador

### 1. Cambio de Ganador desde Web

```
┌─────────────┐
│  Frontend   │
│  Admin UI   │
└──────┬──────┘
       │ POST /api/draws/:id/change-winner
       ▼
┌────────────────────┐
│  Backend API       │
│  DrawController    │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│  DrawService       │
│  1. Validar draw   │
│  2. Validar número │
│  3. Actualizar     │
│  4. Audit log      │
└──────┬─────────────┘
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌────────────────┐
│ PostgreSQL  │  │  WebSocket     │
│ Update      │  │  Broadcast     │
│ Draw        │  │  'draw:updated'│
└─────────────┘  └────────────────┘
       │              │
       │              ▼
       │         ┌─────────────┐
       │         │  Frontend   │
       │         │  Update UI  │
       │         └─────────────┘
       │
       ▼
┌─────────────┐
│Telegram Bot │
│Notify admins│
└─────────────┘
```

---

### 2. Cambio de Ganador desde Telegram

```
┌─────────────┐
│  Telegram   │
│  Admin      │
└──────┬──────┘
       │ /cambiar <drawId> <numero>
       ▼
┌────────────────────┐
│  Telegram Bot      │
│  Command Handler   │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│  Backend Service   │
│  (mismo flujo que  │
│   cambio por web)  │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│  Telegram Bot      │
│  Reply: Confirmado │
└────────────────────┘
```

---

## Diagrama de Estados de Sorteo

```
                    ┌────────────┐
                    │  TEMPLATE  │
                    │   ACTIVA   │
                    └──────┬─────┘
                           │
                           │ GenerateDailyDrawsJob
                           │ (00:05 AM)
                           ▼
                    ┌──────────────┐
             ┌─────►│  SCHEDULED   │
             │      └──────┬───────┘
             │             │
             │             │ CloseDrawJob
             │             │ (5 min antes)
             │             ▼
             │      ┌──────────────┐
             │      │    CLOSED    │◄────┐
             │      │ (preselected)│     │
             │      └──────┬───────┘     │
             │             │             │
             │             │ ExecuteDrawJob  │ Cambio Manual
             │             │ (hora exacta)   │ (Admin)
             │             ▼             │
             │      ┌──────────────┐     │
             │      │    DRAWN     │     │
             │      │  (winner)    │     │
             │      └──────┬───────┘     │
             │             │             │
             │             │ PublishDrawJob
             │             │ (inmediato)
             │             ▼
             │      ┌──────────────┐
             │      │  PUBLISHED   │
             │      └──────────────┘
             │
             │      ┌──────────────┐
             └──────│  CANCELLED   │
                    └──────────────┘
                    (Cancelación manual)
```

---

## Diagrama de Seguridad

```
┌─────────────────────────────────────────────────┐
│              CAPA DE SEGURIDAD                   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         JWT Authentication               │   │
│  │  - Access Token (15 min)                 │   │
│  │  - Refresh Token (7 días)                │   │
│  │  - httpOnly Cookies                      │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │       Authorization (RBAC)               │   │
│  │  - ADMIN: Acceso completo                │   │
│  │  - OPERATOR: Gestión sorteos             │   │
│  │  - VIEWER: Solo lectura                  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │       Telegram Bot Security              │   │
│  │  - Verificación por telegramUserId       │   │
│  │  - Rate limiting                         │   │
│  │  - Whitelist de usuarios                 │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │       API Security                       │   │
│  │  - CORS configurado                      │   │
│  │  - Helmet.js (headers)                   │   │
│  │  - Rate limiting                         │   │
│  │  - Input validation (Zod)                │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │       Audit Logging                      │   │
│  │  - Todas las acciones críticas           │   │
│  │  - IP address + User agent               │   │
│  │  - Cambios registrados                   │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

---

## Escalabilidad

### Puntos de Escalabilidad Futura

1. **Cache Layer (Redis)**
   - Cache de sorteos activos
   - Cache de configuraciones
   - Session storage

2. **Message Queue (Bull/BullMQ)**
   - Jobs distribuidos
   - Procesamiento paralelo
   - Reintentos mejorados

3. **CDN para Imágenes**
   - Cloudflare / CloudFront
   - Reducir carga del servidor
   - Mejor performance global

4. **Load Balancer**
   - Múltiples instancias de API
   - PM2 cluster mode
   - Nginx reverse proxy

5. **Database Replication**
   - Master-Slave setup
   - Read replicas
   - Mejor performance de consultas

---

## Monitoreo y Observabilidad

```
┌─────────────────────────────────────┐
│         MONITORING STACK            │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Application Logs (Winston)  │  │
│  │  - API requests              │  │
│  │  - Job executions            │  │
│  │  - Errors                    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Metrics                     │  │
│  │  - Request latency           │  │
│  │  - Job success rate          │  │
│  │  - Publication success rate  │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Alerting                    │  │
│  │  - Telegram notifications    │  │
│  │  - Email alerts              │  │
│  │  - Critical failures         │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Consideraciones de Diseño

### 1. Separación de Responsabilidades
- Controllers: Manejo de requests
- Services: Lógica de negocio
- Jobs: Tareas automatizadas
- Publishers: Publicación en canales

### 2. Principios SOLID
- Single Responsibility
- Open/Closed
- Interface segregation
- Dependency injection

### 3. Error Handling
- Try-catch en todos los puntos críticos
- Logging detallado
- Respuestas consistentes
- Reintentos automáticos

### 4. Performance
- Índices en BD
- Paginación en listados
- Lazy loading de imágenes
- WebSocket para real-time

### 5. Mantenibilidad
- Código TypeScript tipado
- Documentación inline
- Tests unitarios e integración
- Git workflow estructurado
