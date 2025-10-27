# Backend - Sistema Totalizador de Loterías

API REST y servicios backend para el sistema de gestión de loterías.

## Tecnologías

- **Node.js** 20+
- **Express.js** - Framework web
- **Prisma** - ORM para PostgreSQL
- **PostgreSQL** - Base de datos
- **Socket.io** - WebSocket para tiempo real
- **node-cron** - Jobs programados
- **Winston** - Sistema de logging
- **Sharp** - Procesamiento de imágenes

## Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Generar cliente Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:push

# Migrar datos legacy (opcional)
npm run migrate:legacy
```

## Desarrollo

```bash
# Iniciar servidor en modo desarrollo
npm run dev

# El servidor estará disponible en http://localhost:3000
```

## Scripts Disponibles

```bash
npm run dev              # Desarrollo con nodemon
npm start                # Producción
npm run db:generate      # Generar cliente Prisma
npm run db:push          # Push schema a BD
npm run db:migrate       # Crear migración
npm run db:studio        # Abrir Prisma Studio
npm run migrate:legacy   # Migrar datos desde MySQL legacy
```

## Estructura

```
backend/
├── src/
│   ├── controllers/     # Controladores de rutas
│   ├── services/        # Lógica de negocio
│   ├── routes/          # Definición de rutas
│   ├── middlewares/     # Middlewares personalizados
│   ├── jobs/            # Jobs programados
│   ├── bots/            # Bots (Telegram, etc)
│   ├── publishers/      # Publicadores multi-canal
│   ├── lib/             # Utilidades y configuración
│   ├── scripts/         # Scripts de migración y seeds
│   └── index.js         # Punto de entrada
├── prisma/
│   └── schema.prisma    # Esquema de base de datos
└── package.json
```

## API Endpoints

### Juegos
- `GET /api/games` - Listar juegos
- `GET /api/games/:id` - Obtener juego
- `POST /api/games` - Crear juego
- `PUT /api/games/:id` - Actualizar juego
- `DELETE /api/games/:id` - Eliminar juego

### Items
- `GET /api/games/:gameId/items` - Listar items de un juego
- `GET /api/items/:id` - Obtener item
- `POST /api/items` - Crear item
- `PUT /api/items/:id` - Actualizar item
- `DELETE /api/items/:id` - Eliminar item

### Sorteos
- `GET /api/draws` - Listar sorteos
- `GET /api/draws/today` - Sorteos de hoy
- `GET /api/draws/next` - Próximo sorteo
- `GET /api/draws/:id` - Obtener sorteo
- `POST /api/draws` - Crear sorteo
- `POST /api/draws/:id/close` - Cerrar sorteo
- `POST /api/draws/:id/execute` - Ejecutar sorteo
- `POST /api/draws/:id/change-winner` - Cambiar ganador
- `POST /api/draws/:id/cancel` - Cancelar sorteo

Ver documentación completa en `/docs/API_ENDPOINTS.md`

## Variables de Entorno

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tote_db"

# Legacy MySQL (para migración)
LEGACY_DB_HOST="localhost"
LEGACY_DB_PORT="3306"
LEGACY_DB_USER="root"
LEGACY_DB_PASSWORD=""
LEGACY_DB_NAME="bot"

# Server
PORT=3000
NODE_ENV="development"

# Storage
STORAGE_PATH="./storage"
IMAGES_OUTPUT_PATH="./storage/output"
```

## Base de Datos

### Migración desde Legacy

El sistema incluye un script para migrar datos desde la base de datos MySQL legacy:

```bash
npm run migrate:legacy
```

Este script migra:
- Juegos (games)
- Items de juegos (game_items)
- Plantillas de sorteos (game_draws)
- Histórico de sorteos (distribution_logs)

### Prisma Studio

Para explorar la base de datos visualmente:

```bash
npm run db:studio
```

## Testing

```bash
npm test
```

## Licencia

[Especificar licencia]
