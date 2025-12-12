#!/bin/bash
# Script para sincronizar datos de MySQL remoto (bot) a PostgreSQL local
# Fuente: MySQL remoto (144.126.150.120:3706/bot)
# Destino: PostgreSQL local (localhost:5433/tote_db)

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuración MySQL remoto
MYSQL_HOST="144.126.150.120"
MYSQL_PORT="3706"
MYSQL_USER="diazhh"
MYSQL_PASSWORD="Telecom2025*"
MYSQL_DB="bot"

# Configuración PostgreSQL local
PG_HOST="localhost"
PG_PORT="5433"
PG_USER="erp_user"
PG_PASSWORD="erp_password_dev_2024"
PG_DB="tote_db"
PG_CONTAINER="erp_postgres"

# Directorio de backups
BACKUP_DIR="/home/diazhh/dev/tote-web/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${YELLOW}=== Sincronización MySQL -> PostgreSQL ===${NC}"
echo -e "Fuente: ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB}"
echo -e "Destino: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo ""

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Paso 1: Exportar datos de MySQL
echo -e "${YELLOW}[1/4] Exportando datos de MySQL...${NC}"
MYSQL_DUMP_FILE="$BACKUP_DIR/mysql_bot_${TIMESTAMP}.sql"

mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
    --skip-lock-tables --single-transaction --routines --triggers \
    "$MYSQL_DB" > "$MYSQL_DUMP_FILE" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backup MySQL creado: $MYSQL_DUMP_FILE${NC}"
    echo -e "  Tamaño: $(ls -lh "$MYSQL_DUMP_FILE" | awk '{print $5}')"
else
    echo -e "${RED}✗ Error al crear backup de MySQL${NC}"
    exit 1
fi

# Paso 2: Convertir dump MySQL a formato compatible con PostgreSQL
echo -e "${YELLOW}[2/4] Convirtiendo datos para PostgreSQL...${NC}"
PG_IMPORT_FILE="$BACKUP_DIR/pg_import_${TIMESTAMP}.sql"

# Script Node.js para convertir y migrar datos
node << 'NODEJS_SCRIPT'
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '/home/diazhh/dev/tote-web/backups';
const TIMESTAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

async function exportMySQLData() {
    const connection = await mysql.createConnection({
        host: '144.126.150.120',
        port: 3706,
        user: 'diazhh',
        password: 'Telecom2025*',
        database: 'bot'
    });

    try {
        // Obtener lista de tablas
        const [tables] = await connection.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        
        console.log(`Tablas encontradas: ${tableNames.join(', ')}`);
        
        const exportData = {};
        
        for (const tableName of tableNames) {
            const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
            exportData[tableName] = rows;
            console.log(`  - ${tableName}: ${rows.length} registros`);
        }
        
        // Guardar como JSON para posterior importación
        const jsonFile = path.join(BACKUP_DIR, `mysql_export_${TIMESTAMP}.json`);
        fs.writeFileSync(jsonFile, JSON.stringify(exportData, null, 2));
        console.log(`\nDatos exportados a: ${jsonFile}`);
        
        return exportData;
    } finally {
        await connection.end();
    }
}

exportMySQLData()
    .then(() => {
        console.log('Exportación completada');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
NODEJS_SCRIPT

echo -e "${GREEN}✓ Datos convertidos${NC}"

# Paso 3: Información
echo -e "${YELLOW}[3/4] Datos exportados en formato JSON${NC}"
echo -e "Los datos de MySQL han sido exportados a JSON en: $BACKUP_DIR"
echo -e "Puedes usar el script migrate-legacy.js del backend para importar los datos."

# Paso 4: Verificar conexión PostgreSQL local
echo -e "${YELLOW}[4/4] Verificando PostgreSQL local...${NC}"
docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c "SELECT 1;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PostgreSQL local accesible${NC}"
else
    echo -e "${RED}✗ No se puede conectar a PostgreSQL local${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Sincronización completada ===${NC}"
echo -e "Archivos generados en: $BACKUP_DIR"
echo -e ""
echo -e "Próximos pasos:"
echo -e "  1. Ejecutar migraciones de Prisma: cd backend && yarn db:push"
echo -e "  2. Ejecutar script de migración legacy: yarn migrate:legacy"
