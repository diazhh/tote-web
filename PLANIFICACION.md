# Planificación del Sistema Totalizador de Loterías

## 1. Visión General del Proyecto

Sistema integral para gestión de juegos de lotería con sorteos automatizados, publicación multi-canal y administración en tiempo real.

### 1.1 Tipos de Juegos
- **Triple**: Números del 000 al 999 (1000 opciones)
- **Ruleta**: Números del 0, 00 al 36 (cantidad variable, generalmente 38 pero puede ser más)
- Cada número tiene asociado un nombre/descriptor

### 1.2 Características Principales
- ✅ **Landing page pública**: Página principal con resultados del día e históricos por juego
- ✅ Creación automática de planificación diaria basada en plantillas
- ✅ Sorteos programados a horas específicas
- ✅ Selección automática de números ganadores
- ✅ Generación de imágenes personalizadas por sorteo
- ✅ Publicación multi-canal (Telegram, WhatsApp, Facebook, Instagram, TikTok)
- ✅ Bot de Telegram para administración
- ✅ Dashboard administrativo para gestión completa
- ✅ Control manual de números ganadores (5 minutos antes del sorteo)
- ✅ Histórico de sorteos con búsqueda y filtros
- ✅ Pausar sorteos para fechas específicas

---

## 2. Arquitectura del Sistema

### 2.1 Stack Tecnológico

#### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React 18+
- **Styling**: TailwindCSS + shadcn/ui
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Real-time**: Socket.io-client
- **Icons**: Lucide React

#### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: JavaScript (ES6+)
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.io
- **Task Scheduling**: node-cron
- **Image Processing**: Sharp
- **File Storage**: Local storage

#### Integraciones
- **Telegram**: node-telegram-bot-api
- **WhatsApp**: whatsapp-web.js
- **Facebook**: Facebook Graph API
- **Instagram**: Instagram Graph API
- **TikTok**: TikTok API

---

## 3. Estructura de Directorios

```
tote/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middlewares/
│   │   ├── jobs/
│   │   ├── bots/
│   │   ├── publishers/
│   │   ├── image-generators/
│   │   ├── utils/
│   │   └── server.ts
│   ├── prisma/
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── hooks/
│   │   └── services/
│   ├── public/
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## 4. Modelo de Datos (ver MODELO_DATOS.md)

Ver archivo MODELO_DATOS.md para detalles completos del esquema de base de datos.

---

## 5. APIs y Endpoints (ver API_ENDPOINTS.md)

Ver archivo API_ENDPOINTS.md para documentación completa de APIs.

---

## 6. Sistema de Jobs (ver JOBS_SYSTEM.md)

Ver archivo JOBS_SYSTEM.md para detalles de tareas programadas.

---

## 7. Roadmap de Desarrollo

### Fase 1: Fundamentos (Semanas 1-2)
- Setup del proyecto (backend + frontend)
- Configuración de PostgreSQL + Prisma
- Modelo de datos completo
- Autenticación JWT
- CRUD básico de Games y GameItems
- CRUD básico de DrawTemplates
- UI base con Next.js + shadcn/ui

### Fase 2: Sistema de Sorteos (Semanas 3-4)
- Job de generación diaria de sorteos
- Job de cierre de sorteos (5 min antes)
- Job de ejecución de sorteos
- Sistema de preselección y cambio de ganador
- API de sorteos completa
- UI de gestión de sorteos
- Dashboard con próximos sorteos
- WebSocket para updates en tiempo real

### Fase 3: Generación de Imágenes (Semana 5)
- Sistema de templates de imagen
- Generación de imágenes con Sharp
- Configuración por juego
- Storage de imágenes
- Preview en UI

### Fase 4: Bot de Telegram (Semana 6)
- Bot para administradores
- Comandos básicos
- Notificaciones de cierre de sorteo
- Cambio de ganador desde bot
- Integración con sistema de usuarios

### Fase 5: Publicación Multi-Canal (Semanas 7-8)
- Publisher para Telegram
- Publisher para WhatsApp
- Publisher para Facebook
- Publisher para Instagram
- Job de publicación
- Sistema de reintentos
- UI de estado de publicaciones
- Forzar republicación desde UI

### Fase 6: Funcionalidades Avanzadas (Semana 9)
- Sistema de pausas de sorteos
- Histórico de sorteos
- Estadísticas avanzadas
- Logs de auditoría
- Gestión de canales

### Fase 7: Testing y Deployment (Semanas 10-11)
- Tests unitarios e integración
- Configuración de Docker
- Setup de producción
- Documentación completa
