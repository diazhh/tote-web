#!/bin/bash

# Script para migrar datos de producción a local preservando cambios de Tripleta
# IMPORTANTE: Este script NO borra nada en producción, solo lee

set -e

echo "🔄 Migración de Producción a Local - Preservando Tripleta"
echo "=========================================================="
echo ""

# Configuración
PROD_HOST="144.126.150.120"
PROD_PORT="5433"
PROD_USER="tote_user"
PROD_PASS="tote_password_2025"
PROD_DB="tote_db"

LOCAL_HOST="localhost"
LOCAL_PORT="5433"
LOCAL_USER="erp_user"
LOCAL_PASS="erp_password_dev_2024"
LOCAL_DB="tote_db"

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROD_BACKUP="$BACKUP_DIR/prod_backup_$TIMESTAMP.sql"
LOCAL_BACKUP="$BACKUP_DIR/local_backup_$TIMESTAMP.sql"

# Crear directorio de backups
mkdir -p "$BACKUP_DIR"

echo "📦 Paso 1: Backup de base de datos LOCAL (por seguridad)"
echo "--------------------------------------------------------"
PGPASSWORD="$LOCAL_PASS" pg_dump \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  -F c \
  -f "$LOCAL_BACKUP"

if [ $? -eq 0 ]; then
  echo "✅ Backup local guardado en: $LOCAL_BACKUP"
else
  echo "❌ Error creando backup local"
  exit 1
fi

echo ""
echo "📥 Paso 2: Backup de base de datos de PRODUCCIÓN (solo lectura)"
echo "----------------------------------------------------------------"
PGPASSWORD="$PROD_PASS" pg_dump \
  -h "$PROD_HOST" \
  -p "$PROD_PORT" \
  -U "$PROD_USER" \
  -d "$PROD_DB" \
  -F c \
  -f "$PROD_BACKUP"

if [ $? -eq 0 ]; then
  echo "✅ Backup de producción guardado en: $PROD_BACKUP"
else
  echo "❌ Error creando backup de producción"
  exit 1
fi

echo ""
echo "🗑️  Paso 3: Limpiar base de datos local"
echo "----------------------------------------"
PGPASSWORD="$LOCAL_PASS" psql \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

if [ $? -eq 0 ]; then
  echo "✅ Base de datos local limpiada"
else
  echo "❌ Error limpiando base de datos local"
  exit 1
fi

echo ""
echo "📤 Paso 4: Restaurar datos de producción en local"
echo "--------------------------------------------------"
PGPASSWORD="$LOCAL_PASS" pg_restore \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --no-owner \
  --no-acl \
  "$PROD_BACKUP"

if [ $? -eq 0 ]; then
  echo "✅ Datos de producción restaurados en local"
else
  echo "⚠️  Advertencia: Algunos errores durante la restauración (pueden ser normales)"
fi

echo ""
echo "🔧 Paso 5: Aplicar migraciones de Tripleta"
echo "-------------------------------------------"
cd "$(dirname "$0")/../backend"

# Aplicar migraciones pendientes (incluye Tripleta)
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✅ Migraciones de Tripleta aplicadas"
else
  echo "❌ Error aplicando migraciones"
  exit 1
fi

echo ""
echo "✅ MIGRACIÓN COMPLETADA EXITOSAMENTE"
echo "===================================="
echo ""
echo "📊 Resumen:"
echo "  - Backup local: $LOCAL_BACKUP"
echo "  - Backup producción: $PROD_BACKUP"
echo "  - Datos de producción restaurados en local"
echo "  - Tablas de Tripleta creadas (TripleBet)"
echo ""
echo "⚠️  IMPORTANTE:"
echo "  - La base de datos de PRODUCCIÓN NO fue modificada"
echo "  - Si algo salió mal, puedes restaurar el backup local con:"
echo "    pg_restore -h localhost -p 5433 -U erp_user -d tote_db --clean $LOCAL_BACKUP"
echo ""
