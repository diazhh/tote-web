#!/bin/bash
# ============================================
# SCRIPT OFICIAL DE SINCRONIZACIÓN
# MySQL (Producción) -> PostgreSQL (Local)
# ============================================
#
# Este es el ÚNICO script oficial para sincronizar datos.
# Reemplaza todos los scripts anteriores.
#
# Uso:
#   ./scripts/sync-production.sh [opciones]
#
# Opciones:
#   --full          Sincronización completa
#   --draws-only    Solo sorteos
#   --tickets-only  Solo tickets
#   --date=YYYY-MM-DD  Desde fecha específica
#   --dry-run       Ver qué haría sin ejecutar

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     SINCRONIZACIÓN MySQL → PostgreSQL                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar que estamos en el directorio correcto
if [ ! -f "$BACKEND_DIR/package.json" ]; then
    echo -e "${RED}Error: No se encontró el backend en $BACKEND_DIR${NC}"
    exit 1
fi

# Cargar variables de entorno
if [ -f "$BACKEND_DIR/.env" ]; then
    export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

# Verificar conexión a MySQL
echo -e "${YELLOW}Verificando conexión a MySQL...${NC}"
MYSQL_HOST="${LEGACY_DB_HOST:-144.126.150.120}"
MYSQL_PORT="${LEGACY_DB_PORT:-3706}"

if ! nc -z -w5 "$MYSQL_HOST" "$MYSQL_PORT" 2>/dev/null; then
    echo -e "${RED}Error: No se puede conectar a MySQL ($MYSQL_HOST:$MYSQL_PORT)${NC}"
    echo "Verifica que el servidor esté accesible."
    exit 1
fi
echo -e "${GREEN}✓ MySQL accesible${NC}"

# Verificar conexión a PostgreSQL
echo -e "${YELLOW}Verificando conexión a PostgreSQL...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}Error: No se puede conectar a PostgreSQL${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL accesible${NC}"

# Crear backup de PostgreSQL antes de sincronizar
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pg_backup_before_sync_$TIMESTAMP.sql"

echo -e "\n${YELLOW}Creando backup de PostgreSQL...${NC}"
pg_dump "$DATABASE_URL" -t '"Draw"' -t '"ApiDrawMapping"' -t '"ExternalTicket"' > "$BACKUP_FILE" 2>/dev/null || true
echo -e "${GREEN}✓ Backup creado: $BACKUP_FILE${NC}"

# Ejecutar sincronización
echo -e "\n${YELLOW}Ejecutando sincronización...${NC}\n"
cd "$BACKEND_DIR"
node src/scripts/sync-mysql-production.js "$@"

echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Sincronización completada exitosamente${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Backup disponible en: ${BLUE}$BACKUP_FILE${NC}"
echo ""
echo -e "Para restaurar en caso de problemas:"
echo -e "  ${YELLOW}psql \$DATABASE_URL < $BACKUP_FILE${NC}"
echo ""
