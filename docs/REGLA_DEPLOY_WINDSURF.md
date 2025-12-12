---
trigger: always
---

# Instrucciones de Deploy para Windsurf AI - TOTE-WEB

## Cuándo Aplicar Esta Regla

Cuando el usuario diga cualquiera de estas palabras:
- "deploy", "desplegar", "subir", "publicar", "actualizar producción"

---

## DEPLOY UNIVERSAL - Proceso Completo

Este proceso despliega TODO: código y base de datos (si hay cambios).

### Configuración

```bash
# Producción
PROD_HOST="144.126.150.120"
PROD_DB_PORT="5433"  # Puerto PostgreSQL en producción (a configurar)
PROD_DB_USER="tote_user"
PROD_DB_PASS="<CONFIGURAR_EN_SERVIDOR>"
PROD_DB_NAME="tote_db"
SSH_HOST="144"
REMOTE_PATH="/var/proyectos/tote-web"

# Local
LOCAL_PATH="/home/diazhh/dev/tote-web"
BACKUP_DIR="/home/diazhh/dev/tote-web/backups"

# Puertos de aplicación
BACKEND_PORT="3001"
FRONTEND_PORT="3000"
```

---

### Paso 1: Verificaciones Previas

```bash
# Verificar SSH
ssh -q 144 exit && echo "✓ SSH OK" || echo "✗ SSH FAILED"

# Verificar rama
cd /home/diazhh/dev/tote-web && git branch --show-current
```

**IMPORTANTE**: Debe estar en rama `main`. Si no, abortar.

---

### Paso 2: Commit y Push de Cambios Locales

```bash
cd /home/diazhh/dev/tote-web && git status --porcelain
```

**Si hay cambios**, ejecutar:
```bash
git add .
git commit -m "Deploy $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
```

---

### Paso 3: Pull en el Servidor

```bash
ssh 144 "cd /var/proyectos/tote-web && git fetch origin main && git pull origin main"
```

Verificar sincronización:
```bash
cd /home/diazhh/dev/tote-web && git rev-parse --short HEAD
ssh 144 "cd /var/proyectos/tote-web && git rev-parse --short HEAD"
```

**Si no coinciden**, forzar:
```bash
ssh 144 "cd /var/proyectos/tote-web && git fetch origin && git reset --hard origin/main"
```

---

### Paso 4: Verificar Migraciones Pendientes (Prisma)

**DESPUÉS del pull**, verificar si hay migraciones nuevas:

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma migrate status"
```

- Si hay migraciones pendientes → HAY CAMBIOS DE BD, continuar con Paso 5
- Si todas están aplicadas → NO hay cambios de BD, saltar al Paso 7

---

### Paso 5: Backup de BD de Producción (SOLO si hay migraciones)

```bash
mkdir -p /home/diazhh/dev/tote-web/backups
PGPASSWORD=<PROD_PASSWORD> pg_dump -h 144.126.150.120 -p 5433 -U tote_user -d tote_db --no-owner --no-acl -F c -f /home/diazhh/dev/tote-web/backups/pre_deploy_$(date +%Y%m%d_%H%M%S).sql
```

Verificar:
```bash
ls -lh /home/diazhh/dev/tote-web/backups/*.sql | tail -1
```

---

### Paso 6: Ejecutar Migraciones en Producción (SOLO si hay pendientes)

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && NODE_ENV=production npx prisma migrate deploy"
```

Verificar que todas quedaron aplicadas:
```bash
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma migrate status"
```

---

### Paso 7: Dependencias del Backend

```bash
ssh 144 "cd /var/proyectos/tote-web/backend && yarn install --production 2>/dev/null || npm install --omit=dev"
```

Generar cliente Prisma:
```bash
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma generate"
```

---

### Paso 8: Build del Frontend

```bash
ssh 144 "cd /var/proyectos/tote-web/frontend && yarn install && yarn build 2>/dev/null || (npm install && npm run build)"
```

---

### Paso 9: Reiniciar Servicios PM2

```bash
ssh 144 "pm2 restart tote-backend tote-frontend"
```

Esperar 3 segundos y verificar:
```bash
ssh 144 "pm2 list | grep tote"
```

Health check:
```bash
ssh 144 "curl -s http://localhost:3001/health"
```

---

### Paso 10: Sincronizar BD de Producción a Local

**SIEMPRE** al final del deploy, traer la BD actualizada a local:

```bash
# Descargar BD de producción
PGPASSWORD=<PROD_PASSWORD> pg_dump -h 144.126.150.120 -p 5433 -U tote_user -d tote_db --no-owner --no-acl -F c -f /home/diazhh/dev/tote-web/backups/post_deploy_$(date +%Y%m%d_%H%M%S).sql

# Restaurar en local (terminar conexiones primero)
BACKUP_FILE=$(ls -t /home/diazhh/dev/tote-web/backups/post_deploy_*.sql | head -1)
docker cp $BACKUP_FILE erp_postgres:/tmp/restore.sql
docker exec erp_postgres psql -U erp_user -d postgres -c "UPDATE pg_database SET datallowconn = false WHERE datname = 'tote_db';"
docker exec erp_postgres psql -U erp_user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'tote_db';"
docker exec erp_postgres psql -U erp_user -d postgres -c "DROP DATABASE IF EXISTS tote_db;"
docker exec erp_postgres psql -U erp_user -d postgres -c "CREATE DATABASE tote_db OWNER erp_user;"
docker exec erp_postgres pg_restore -U erp_user -d tote_db --no-owner --no-acl /tmp/restore.sql
docker exec erp_postgres rm /tmp/restore.sql
```

Verificar:
```bash
docker exec erp_postgres psql -U erp_user -d tote_db -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

---

## Información del Servidor

| Parámetro | Valor |
|-----------|-------|
| **SSH Alias** | `144` |
| **IP** | 144.126.150.120 |
| **BD Producción** | 144.126.150.120:5433 (a configurar) |
| **BD Local** | localhost:5433 (Docker: erp_postgres) |
| **BD Usuario Local** | erp_user |
| **BD Password Local** | erp_password_dev_2024 |
| **BD Nombre** | tote_db |
| **PM2 Backend** | tote-backend (puerto 3001) |
| **PM2 Frontend** | tote-frontend (puerto 3000) |

---

## Al Finalizar Deploy

Informar al usuario:

1. ✅ o ❌ Estado de cada paso
2. 📦 Backup creado (si hubo migraciones)
3. 🔄 Migraciones ejecutadas (cantidad)
4. 📝 Hash del commit desplegado
5. 🟢 Estado de servicios PM2
6. 🔄 BD local sincronizada
7. 🔗 URLs:
   - **Backend**: http://144.126.150.120:3001
   - **Frontend**: http://144.126.150.120:3000

---

## SINCRONIZAR BD (sin deploy)

Cuando el usuario diga: "sincronizar", "sync", "bajar bd", "actualizar local"

```bash
# Descargar
mkdir -p /home/diazhh/dev/tote-web/backups
PGPASSWORD=<PROD_PASSWORD> pg_dump -h 144.126.150.120 -p 5433 -U tote_user -d tote_db --no-owner --no-acl -F c -f /home/diazhh/dev/tote-web/backups/prod_sync_$(date +%Y%m%d_%H%M%S).sql

# Restaurar
BACKUP_FILE=$(ls -t /home/diazhh/dev/tote-web/backups/prod_sync_*.sql | head -1)
docker cp $BACKUP_FILE erp_postgres:/tmp/restore.sql
docker exec erp_postgres psql -U erp_user -d postgres -c "DROP DATABASE IF EXISTS tote_db;"
docker exec erp_postgres psql -U erp_user -d postgres -c "CREATE DATABASE tote_db OWNER erp_user;"
docker exec erp_postgres pg_restore -U erp_user -d tote_db --no-owner --no-acl /tmp/restore.sql
docker exec erp_postgres rm /tmp/restore.sql

# Verificar
docker exec erp_postgres psql -U erp_user -d tote_db -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

---

## Rollback de Emergencia

Si algo sale mal:

### Listar backups
```bash
ls -lh /home/diazhh/dev/tote-web/backups/*.sql
```

### Restaurar backup en producción
```bash
# Seleccionar archivo de backup (reemplazar ARCHIVO)
BACKUP="/home/diazhh/dev/tote-web/backups/ARCHIVO.sql"

# Detener backend
ssh 144 "pm2 stop tote-backend"

# Restaurar
PGPASSWORD=<PROD_PASSWORD> pg_restore -h 144.126.150.120 -p 5433 -U tote_user -d tote_db --clean --no-owner --no-acl $BACKUP

# Reiniciar
ssh 144 "pm2 start tote-backend"
```

---

## Comandos Útiles

```bash
# Ver logs
ssh 144 "pm2 logs tote-backend --lines 50"

# Estado PM2
ssh 144 "pm2 list"

# Verificar commits
git log -1 --oneline
ssh 144 "cd /var/proyectos/tote-web && git log -1 --oneline"

# Forzar sync git
ssh 144 "cd /var/proyectos/tote-web && git fetch origin && git reset --hard origin/main"

# Estado migraciones local
cd /home/diazhh/dev/tote-web/backend && npx prisma migrate status

# Estado migraciones producción
ssh 144 "cd /var/proyectos/tote-web/backend && npx prisma migrate status"
```

---

## MySQL Legacy (bot) - Solo Referencia

La base de datos MySQL remota `bot` es solo para migración inicial de datos legacy.

```bash
# Conexión MySQL legacy (solo lectura para migración)
MYSQL_HOST="144.126.150.120"
MYSQL_PORT="3706"
MYSQL_USER="diazhh"
MYSQL_PASSWORD="Telecom2025*"
MYSQL_DB="bot"
```

Para sincronizar datos legacy, usar:
```bash
cd /home/diazhh/dev/tote-web && ./scripts/sync-mysql-to-local.sh
```
