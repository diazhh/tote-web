# Guía de Instalación y Setup

## 🚀 Setup Rápido

### 1. Backend

```bash
# Ir a carpeta backend
cd backend

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env (IMPORTANTE: configurar DATABASE_URL)
nano .env  # o usar tu editor preferido
```

### 2. Configurar PostgreSQL

```bash
# Opción A: Instalar PostgreSQL localmente
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql
brew services start postgresql

# Crear base de datos
createdb tote_db

# Opción B: Usar Docker
docker run --name tote-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=tote_db \
  -p 5432:5432 \
  -d postgres:14
```

### 3. Configurar .env

```env
# backend/.env
DATABASE_URL="postgresql://postgres:password@localhost:5432/tote_db?schema=public"

# Si tienes MySQL legacy para migrar
LEGACY_DB_HOST="localhost"
LEGACY_DB_PORT="3306"
LEGACY_DB_USER="root"
LEGACY_DB_PASSWORD="tu_password"
LEGACY_DB_NAME="bot"

PORT=3000
NODE_ENV="development"
STORAGE_PATH="./storage"
IMAGES_OUTPUT_PATH="./storage/output"
```

### 4. Ejecutar Migraciones

```bash
# Desde carpeta backend/

# Generar cliente Prisma
npm run db:generate

# Crear tablas en PostgreSQL
npm run db:push

# Ver resultado en Prisma Studio (opcional)
npm run db:studio
```

### 5. Migrar Datos Legacy (Opcional)

```bash
# Solo si tienes acceso a la BD MySQL legacy
npm run migrate:legacy
```

### 6. Iniciar Backend

```bash
npm run dev

# Deberías ver:
# 🚀 Servidor iniciado en puerto 3000
# ✅ Conectado a PostgreSQL
```

### 7. Probar API

```bash
# Health check
curl http://localhost:3000/health

# Test endpoint
curl http://localhost:3000/api/test

# Listar juegos
curl http://localhost:3000/api/games

# Sorteos de hoy
curl http://localhost:3000/api/draws/today
```

---

## 🎨 Frontend (Próximo Paso)

### Crear Proyecto Next.js

```bash
# Desde la raíz del proyecto
npx create-next-app@latest frontend

# Opciones recomendadas:
# ✅ TypeScript? No (usamos JavaScript)
# ✅ ESLint? Yes
# ✅ Tailwind CSS? Yes
# ✅ src/ directory? Yes
# ✅ App Router? Yes
# ✅ Import alias? Yes (@/*)
```

### Instalar Dependencias Frontend

```bash
cd frontend

# Dependencias principales
npm install axios socket.io-client zustand date-fns

# shadcn/ui
npx shadcn-ui@latest init

# Componentes shadcn/ui básicos
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add form
npx shadcn-ui@latest add input
npx shadcn-ui@latest add select
npx shadcn-ui@latest add toast
```

### Configurar Variables de Entorno Frontend

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### Iniciar Frontend

```bash
npm run dev

# Disponible en http://localhost:3001
```

---

## 🐳 Docker (Alternativa)

### Docker Compose

Crear `docker-compose.yml` en la raíz:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: tote_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/tote_db
      NODE_ENV: development
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build: ./frontend
    ports:
      - "3001:3001"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

### Ejecutar con Docker

```bash
# Iniciar todo
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

---

## ✅ Verificación

### Backend Funcionando

- [ ] `curl http://localhost:3000/health` responde OK
- [ ] `npm run db:studio` abre Prisma Studio
- [ ] `curl http://localhost:3000/api/games` responde (aunque sea array vacío)

### Frontend Funcionando (cuando esté creado)

- [ ] http://localhost:3001 carga
- [ ] Puede hacer requests a backend
- [ ] TailwindCSS funciona

---

## 🐛 Troubleshooting

### Error: Cannot connect to PostgreSQL

```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql  # Linux
brew services list  # macOS

# Verificar puerto
sudo lsof -i :5432

# Probar conexión
psql -U postgres -d tote_db
```

### Error: Prisma Client not generated

```bash
cd backend
npm run db:generate
```

### Error: Port 3000 already in use

```bash
# Cambiar puerto en backend/.env
PORT=3001

# O matar proceso en puerto 3000
lsof -ti:3000 | xargs kill -9
```

### Error: Module not found

```bash
# Reinstalar dependencias
cd backend
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 Recursos

- [Prisma Docs](https://www.prisma.io/docs)
- [Express.js Docs](https://expressjs.com/)
- [Next.js Docs](https://nextjs.org/docs)
- [shadcn/ui Docs](https://ui.shadcn.com/)

---

## 🆘 Ayuda

Si algo no funciona:

1. Verificar que PostgreSQL está corriendo
2. Verificar que el .env está configurado correctamente
3. Verificar que las migraciones se ejecutaron
4. Ver logs del servidor para errores específicos
5. Consultar ESTADO_ACTUAL.md para ver qué está implementado
