# Sistema Totalizador de Loterías 🎰

Sistema web completo para gestión automatizada de juegos de lotería con sorteos programados, publicación multi-canal y administración en tiempo real.

---

## 📋 Características Principales

- ✅ **Múltiples tipos de juegos**: Triple (000-999) y Ruleta (números variables)
- ✅ **Cara Pública:**
  - **Landing page**: Página web pública con resultados en tiempo real
  - **Histórico**: Consulta de resultados pasados por juego
  - **Actualizaciones en vivo**: WebSocket para resultados instantáneos
- ✅ **Sistema Automatizado:**
  1. **Generación automática diaria** (00:05 AM)
  2. **Cierre 5 minutos antes** con preselección
  3. **Ejecución a la hora exacta** con generación de imagen
  4. **Publicación multi-canal** automática
  5. **Control manual** vía dashboard o Telegram, WhatsApp, Facebook, Instagram, TikTok
- ✅ **Bot de Telegram**: Administración y notificaciones en tiempo real
- ✅ **Interfaz web moderna**: Dashboard completo con Next.js
- ✅ **Histórico y estadísticas**: Seguimiento completo de resultados
- ✅ **Sistema de pausas**: Control de sorteos por fechas

{{ ... }}
---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

#### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT + bcrypt
- **Jobs**: node-cron
- **Images**: Sharp
- **Real-time**: Socket.io

#### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18+ con TailwindCSS
- **Components**: shadcn/ui
- **State**: Zustand
- **Icons**: Lucide React

#### Integraciones
- Telegram: node-telegram-bot-api
- WhatsApp: whatsapp-web.js
- Facebook/Instagram: Graph API
- TikTok: Content Posting API

---

## 📁 Estructura del Proyecto

```
tote/
├── backend/                    # ✅ API y servicios backend
│   ├── src/
│   │   ├── controllers/        # ✅ Controladores HTTP
│   │   ├── services/           # ✅ Lógica de negocio
│   │   ├── routes/             # ✅ Rutas API
│   │   ├── middlewares/        # ⏳ Middlewares
│   │   ├── jobs/               # ⏳ Jobs programados
│   │   ├── bots/               # ⏳ Bot de Telegram
│   │   ├── publishers/         # ⏳ Publicadores multi-canal
│   │   ├── lib/                # ✅ Utilidades
│   │   ├── scripts/            # ✅ Scripts de migración
│   │   └── index.js            # ✅ Servidor Express
│   ├── prisma/                 # ✅ ORM y esquema de BD
│   └── package.json
│
├── frontend/                   # ⏳ Interfaz web (Next.js)
│   ├── src/
│   │   ├── app/                # App Router
│   │   ├── components/         # Componentes React
│   │   ├── lib/                # Utilidades
│   │   └── hooks/              # Custom hooks
│   └── package.json
│
├── storage/                    # ⏳ Archivos y recursos
│   ├── bases/                  # Recursos para imágenes
│   ├── fonts/                  # Fuentes tipográficas
│   └── output/                 # Imágenes generadas
│
└── docs/                       # ✅ Documentación
    ├── PLANIFICACION.md
    ├── MODELO_DATOS.md
    ├── API_ENDPOINTS.md
    └── ESTRUCTURA_PROYECTO.md
```

---

## 📚 Documentación

### Documentos de Planificación

1. **[PLANIFICACION.md](./PLANIFICACION.md)** - Visión general y roadmap
2. **[MODELO_DATOS.md](./MODELO_DATOS.md)** - Esquema de base de datos
3. **[API_ENDPOINTS.md](./API_ENDPOINTS.md)** - Documentación de APIs
4. **[JOBS_SYSTEM.md](./JOBS_SYSTEM.md)** - Sistema de tareas programadas
5. **[IMAGE_GENERATION.md](./IMAGE_GENERATION.md)** - Generación de imágenes
6. **[TELEGRAM_BOT.md](./TELEGRAM_BOT.md)** - Bot de administración
7. **[PUBLISHERS.md](./PUBLISHERS.md)** - Sistema de publicación
8. **[FRONTEND_STRUCTURE.md](./FRONTEND_STRUCTURE.md)** - Estructura del frontend

---

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 20+
- PostgreSQL 14+
- npm
- MySQL (para migración de datos legacy - opcional)

### Instalación

```bash
# 1. Instalar dependencias del backend
cd backend
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones (DATABASE_URL, etc)

# 3. Configurar base de datos PostgreSQL
# Crear base de datos: createdb tote_db

# 4. Ejecutar migraciones de Prisma
npm run db:push

# 5. (Opcional) Migrar datos desde MySQL legacy
npm run migrate:legacy

# 6. Iniciar backend
npm run dev
```

### Frontend (Próximamente)

```bash
# El frontend se creará en la siguiente fase
cd frontend
npm install
npm run dev
```

### Acceso

- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Prisma Studio**: `npm run db:studio` (en carpeta backend)
- **Frontend**: http://localhost:3001 (cuando esté creado)

---

## 🔧 Configuración

### Variables de Entorno

#### Backend (.env)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tote"

# JWT
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"

# Telegram
TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
TELEGRAM_ADMIN_CHAT_ID="123456789"

# WhatsApp
WHATSAPP_SESSION_PATH="./whatsapp-session"

# Facebook
FACEBOOK_ACCESS_TOKEN="EAABsbCS..."
FACEBOOK_PAGE_ID="1234567890"

# Instagram
INSTAGRAM_ACCESS_TOKEN="EAABsbCS..."
INSTAGRAM_BUSINESS_ID="1234567890"

# App
NODE_ENV="development"
PORT=3001
FRONTEND_URL="http://localhost:3000"
```

#### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
```

---

## 🎯 Flujo del Sistema

### 1. Generación de Sorteos
- **00:05 AM**: Job genera sorteos del día según plantillas
- Verifica pausas configuradas
- Crea registros con status `SCHEDULED`

### 2. Cierre de Sorteos
- **5 minutos antes**: Job cierra sorteo
- Preselecciona número ganador aleatoriamente
- Notifica a administradores vía Telegram
- Cambia status a `CLOSED`

### 3. Ejecución de Sorteos
- **Hora exacta**: Job ejecuta sorteo
- Confirma número ganador
- Genera imagen personalizada
- Cambia status a `DRAWN`

### 4. Publicación
- Job publica en canales configurados
- Maneja reintentos en caso de fallo
- Registra estado por canal

---

## 📊 Modelo de Datos

### Entidades Principales

- **Game**: Juegos (Triple, Ruleta)
- **GameItem**: Números del juego con nombres
- **DrawTemplate**: Plantillas de generación
- **Draw**: Sorteos individuales
- **DrawPublication**: Estado de publicaciones
- **DrawPause**: Pausas de sorteos
- **ChannelConfig**: Configuración de canales
- **User**: Usuarios administradores
- **AuditLog**: Registro de auditoría

Ver [MODELO_DATOS.md](./MODELO_DATOS.md) para detalles completos.

---

## 🤖 Bot de Telegram

### Comandos Disponibles

- `/sorteos` - Ver sorteos de hoy
- `/proximo` - Próximo sorteo
- `/cambiar <drawId> <numero>` - Cambiar ganador
- `/info <drawId>` - Info de sorteo
- `/pausar <juego> <fecha_inicio> <fecha_fin>` - Pausar sorteos
- `/estadisticas [juego] [dias]` - Ver estadísticas
- `/help` - Ayuda

### Notificaciones Automáticas

- Cierre de sorteo (5 min antes)
- Sorteo ejecutado
- Publicación fallida
- Alertas de sistema

Ver [TELEGRAM_BOT.md](./TELEGRAM_BOT.md) para detalles.

---

## 🖼️ Generación de Imágenes

Sistema de composición por capas:

1. **Capa Base**: Fondo del juego
2. **Capa de Marca**: Logo/watermark
3. **Capa de Info**: Nombre, fecha, hora
4. **Capa de Ganador**: Número y nombre
5. **Capa QR**: (opcional) Link al sitio

Configuración flexible por juego mediante templates JSON.

Ver [IMAGE_GENERATION.md](./IMAGE_GENERATION.md) para detalles.

---

## 📡 Canales de Publicación

### Telegram
- Publicación instantánea
- Soporte de grupos/canales

### WhatsApp
- Via whatsapp-web.js
- Grupos y listas de difusión

### Facebook
- Graph API
- Publicación en páginas

### Instagram
- Graph API
- Cuenta business requerida

### TikTok
- Content Posting API
- Conversión imagen → video

Ver [PUBLISHERS.md](./PUBLISHERS.md) para implementación.

---

## 🧪 Testing

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test

# E2E tests
npm run test:e2e
```

---

## 🚢 Deployment

### Docker

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Manual

```bash
# Backend
cd backend
npm run build
npm run start

# Frontend
cd frontend
npm run build
npm run start
```

Ver documentación de deployment para más detalles.

---

## 📈 Roadmap de Desarrollo

### Fase 1: Fundamentos ✅
- Setup proyecto
- Modelo de datos
- Autenticación
- CRUD básico

### Fase 2: Sistema de Sorteos ⏳
- Jobs programados
- Generación diaria
- Cierre y ejecución
- WebSocket

### Fase 3: Imágenes ⏳
- Templates
- Generación
- Storage

### Fase 4: Bot Telegram ⏳
- Comandos
- Notificaciones

### Fase 5: Publicación ⏳
- Publishers
- Multi-canal
- Reintentos

### Fase 6: Avanzado ⏳
- Pausas
- Histórico
- Estadísticas

### Fase 7: Testing y Deploy ⏳
- Tests
- Docker
- CI/CD

---

## 🤝 Contribución

1. Fork del proyecto
2. Crear branch (`git checkout -b feature/amazing`)
3. Commit cambios (`git commit -m 'Add amazing feature'`)
4. Push a branch (`git push origin feature/amazing`)
5. Abrir Pull Request

---

## 📝 Licencia

[Especificar licencia]

---

## 👥 Equipo

[Información del equipo]

---

## 📞 Soporte

Para preguntas o soporte:
- Email: [email]
- Telegram: [link]
- Issues: [GitHub issues]

---

## 🙏 Agradecimientos

- shadcn/ui por componentes
- Vercel por Next.js
- Prisma por ORM
- Y todas las librerías open source utilizadas

---

**Desarrollado con ❤️ para gestión de loterías**
