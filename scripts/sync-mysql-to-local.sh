#!/bin/bash
# Script para sincronizar planificaciones y resultados de MySQL (producción) a PostgreSQL local
# Fuente: MySQL remoto (144.126.150.120:3706/bot)
# Destino: PostgreSQL local (localhost:5433/tote_db)
# 
# Este script:
# 1. Exporta planned_draws y api_draw_mappings desde MySQL (solo lectura)
# 2. Limpia Draw y ApiDrawMapping en PostgreSQL local
# 3. Inserta los datos de MySQL en PostgreSQL

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuración MySQL remoto (SOLO LECTURA - NO MODIFICAR)
MYSQL_HOST="144.126.150.120"
MYSQL_PORT="3706"
MYSQL_USER="diazhh"
MYSQL_PASSWORD="Telecom2025*"
MYSQL_DB="bot"

# Configuración PostgreSQL local
PG_HOST="localhost"
PG_PORT="5433"
PG_USER="tote_user"
PG_PASSWORD="tote_password_2025"
PG_DB="tote_db"
PG_CONTAINER="tote_postgres"

# Directorio de backups
BACKUP_DIR="/var/proyectos/tote-web/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${YELLOW}=== Sincronización Planificaciones MySQL -> PostgreSQL ===${NC}"
echo -e "Fuente: ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB} (SOLO LECTURA)"
echo -e "Destino: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo ""

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Paso 1: Verificar conexión a ambas bases de datos
echo -e "${YELLOW}[1/5] Verificando conexiones...${NC}"

# Verificar MySQL
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1;" "$MYSQL_DB" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ MySQL remoto accesible${NC}"
else
    echo -e "${RED}✗ No se puede conectar a MySQL remoto${NC}"
    exit 1
fi

# Verificar PostgreSQL
docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PostgreSQL local accesible${NC}"
else
    echo -e "${RED}✗ No se puede conectar a PostgreSQL local${NC}"
    exit 1
fi

# Paso 2: Backup de PostgreSQL local antes de modificar
echo -e "${YELLOW}[2/5] Creando backup de PostgreSQL local...${NC}"
PG_BACKUP_FILE="$BACKUP_DIR/pg_backup_draws_${TIMESTAMP}.sql"
docker exec $PG_CONTAINER pg_dump -U $PG_USER -d $PG_DB -t '"Draw"' -t '"ApiDrawMapping"' -t '"DrawPublication"' > "$PG_BACKUP_FILE" 2>/dev/null
echo -e "${GREEN}✓ Backup PostgreSQL creado: $PG_BACKUP_FILE${NC}"

# Paso 3: Ejecutar script Node.js para migrar datos
echo -e "${YELLOW}[3/5] Exportando datos de MySQL...${NC}"

cd /var/proyectos/tote-web/backend

node << 'NODEJS_SCRIPT'
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Mapeo de game_id MySQL -> gameId PostgreSQL
const GAME_ID_MAP = {
    1: 'adc88027-5426-46c1-bb0b-9de7264241b2', // LOTOANIMALITO
    2: '950e986b-6bc3-44dd-ad9a-e39ff35dcd30', // LOTTOPANTERA
    3: '66424b03-b98d-4b96-8ae0-e92f0b91a740'  // TRIPLE PANTERA
};

// Mapeo de api_id MySQL -> apiConfigId PostgreSQL (solo planificación)
const API_CONFIG_MAP = {
    8: '8',   // SRQ Planificación Juego 2 (LOTTOPANTERA)
    10: '10', // SRQ Planificación Juego 3 (TRIPLE PANTERA)
    12: '12'  // SRQ Planificación Juego 1 (LOTOANIMALITO)
};

// Mapeo de status MySQL -> DrawStatus PostgreSQL
const STATUS_MAP = {
    'abierto': 'SCHEDULED',
    'cerrado': 'CLOSED',
    'totalizado': 'PUBLISHED'
};

async function syncPlanificaciones() {
    const mysqlConn = await mysql.createConnection({
        host: '144.126.150.120',
        port: 3706,
        user: 'diazhh',
        password: 'Telecom2025*',
        database: 'bot'
    });

    const pgClient = new Client({
        host: 'localhost',
        port: 5433,
        user: 'tote_user',
        password: 'tote_password_2025',
        database: 'tote_db'
    });

    try {
        await pgClient.connect();
        console.log('Conectado a ambas bases de datos');

        // 1. Obtener game_draws (horarios) de MySQL
        const [gameDraws] = await mysqlConn.query('SELECT * FROM game_draws');
        console.log(`Horarios de sorteos: ${gameDraws.length}`);

        // 2. Obtener game_items de MySQL para mapear winner_item_id
        const [gameItems] = await mysqlConn.query('SELECT id, game_id, number, name FROM game_items');
        const gameItemsMap = {};
        gameItems.forEach(item => {
            gameItemsMap[item.id] = item;
        });
        console.log(`Items de juego: ${gameItems.length}`);

        // 3. Obtener GameItems de PostgreSQL para mapear por número
        const pgItemsResult = await pgClient.query('SELECT id, "gameId", number FROM "GameItem"');
        const pgItemsMap = {};
        pgItemsResult.rows.forEach(item => {
            const key = `${item.gameId}_${item.number}`;
            pgItemsMap[key] = item.id;
        });
        console.log(`Items PostgreSQL: ${pgItemsResult.rows.length}`);

        // 4. Obtener planned_draws de MySQL (desde inicio hasta hoy)
        const today = new Date().toISOString().split('T')[0];
        const [plannedDraws] = await mysqlConn.query(
            'SELECT * FROM planned_draws WHERE date <= ? ORDER BY date, game_draw_id',
            [today]
        );
        console.log(`Planificaciones a migrar: ${plannedDraws.length}`);

        // 5. Obtener api_draw_mappings de MySQL
        const [apiMappings] = await mysqlConn.query('SELECT * FROM api_draw_mappings');
        const apiMappingsMap = {};
        apiMappings.forEach(m => {
            apiMappingsMap[m.planned_draw_id] = m;
        });
        console.log(`Mappings API: ${apiMappings.length}`);

        // 6. Limpiar tablas en PostgreSQL (en orden por FK)
        console.log('\nLimpiando tablas en PostgreSQL...');
        await pgClient.query('DELETE FROM "DrawPublication"');
        await pgClient.query('DELETE FROM "ApiDrawMapping"');
        await pgClient.query('DELETE FROM "Draw"');
        console.log('Tablas limpiadas');

        // 7. Insertar draws en PostgreSQL
        console.log('\nInsertando draws...');
        let insertedDraws = 0;
        let insertedMappings = 0;
        const drawIdMap = {}; // planned_draw.id -> new Draw.id

        for (const pd of plannedDraws) {
            const gameId = GAME_ID_MAP[pd.game_id];
            if (!gameId) {
                console.warn(`Game ID ${pd.game_id} no mapeado, saltando...`);
                continue;
            }

            // Obtener hora del sorteo desde game_draws
            const gameDraw = gameDraws.find(gd => gd.id === pd.game_draw_id);
            if (!gameDraw) {
                console.warn(`game_draw_id ${pd.game_draw_id} no encontrado, saltando...`);
                continue;
            }

            // Construir scheduledAt combinando date + time
            // La hora en MySQL está en hora de Caracas, y PostgreSQL usa timestamp without time zone
            // Por lo tanto, guardamos la hora directamente como string ISO para que se almacene tal cual
            const dateStr = pd.date instanceof Date 
                ? pd.date.toISOString().split('T')[0] 
                : pd.date;
            const timeStr = gameDraw.time;
            // Crear fecha como string ISO sin conversión de zona horaria
            const scheduledAt = `${dateStr}T${timeStr}`;

            // Mapear winner_item_id
            let winnerItemId = null;
            const effectiveWinnerId = pd.override_winner_item_id || pd.winner_item_id;
            if (effectiveWinnerId && gameItemsMap[effectiveWinnerId]) {
                const mysqlItem = gameItemsMap[effectiveWinnerId];
                const pgKey = `${gameId}_${mysqlItem.number}`;
                winnerItemId = pgItemsMap[pgKey] || null;
            }

            // Mapear status
            const status = STATUS_MAP[pd.status] || 'SCHEDULED';

            // Generar nuevo UUID para el draw
            const newDrawId = uuidv4();
            drawIdMap[pd.id] = newDrawId;

            // Insertar Draw
            await pgClient.query(`
                INSERT INTO "Draw" (
                    id, "gameId", "templateId", "scheduledAt", status,
                    "preselectedItemId", "winnerItemId", "imageUrl", "imageGenerated",
                    "closedAt", "drawnAt", "publishedAt", notes, "createdAt", "updatedAt"
                ) VALUES (
                    $1, $2, NULL, $3, $4::"DrawStatus",
                    NULL, $5, NULL, false,
                    $6, $7, $8, NULL, $9, $10
                )
            `, [
                newDrawId,
                gameId,
                scheduledAt,
                status,
                winnerItemId,
                status !== 'SCHEDULED' ? scheduledAt : null, // closedAt
                winnerItemId ? scheduledAt : null, // drawnAt
                status === 'PUBLISHED' ? scheduledAt : null, // publishedAt
                pd.created_at || new Date(),
                pd.updated_at || new Date()
            ]);
            insertedDraws++;

            // Insertar ApiDrawMapping si existe
            const mapping = apiMappingsMap[pd.id];
            if (mapping) {
                // Determinar apiConfigId basado en el juego (solo planificación)
                let apiConfigId = null;
                if (pd.game_id === 1) apiConfigId = '12';
                else if (pd.game_id === 2) apiConfigId = '8';
                else if (pd.game_id === 3) apiConfigId = '10';

                if (apiConfigId) {
                    const mappingId = uuidv4();
                    await pgClient.query(`
                        INSERT INTO "ApiDrawMapping" (
                            id, "apiConfigId", "drawId", "externalDrawId", "createdAt", "updatedAt"
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        mappingId,
                        apiConfigId,
                        newDrawId,
                        mapping.external_draw_id.toString(),
                        mapping.created_at || new Date(),
                        mapping.updated_at || new Date()
                    ]);
                    insertedMappings++;
                }
            }

            if (insertedDraws % 500 === 0) {
                console.log(`  Progreso: ${insertedDraws} draws insertados...`);
            }
        }

        console.log(`\n✓ Draws insertados: ${insertedDraws}`);
        console.log(`✓ ApiDrawMappings insertados: ${insertedMappings}`);

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await mysqlConn.end();
        await pgClient.end();
    }
}

syncPlanificaciones()
    .then(() => {
        console.log('\nSincronización completada exitosamente');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error fatal:', err.message);
        process.exit(1);
    });
NODEJS_SCRIPT

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Error durante la migración${NC}"
    echo -e "${YELLOW}Puedes restaurar el backup con:${NC}"
    echo -e "  docker exec -i $PG_CONTAINER psql -U $PG_USER -d $PG_DB < $PG_BACKUP_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Datos migrados${NC}"

# Paso 4: Verificar resultados
echo -e "${YELLOW}[4/5] Verificando resultados...${NC}"
DRAW_COUNT=$(docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -t -c "SELECT COUNT(*) FROM \"Draw\";" | tr -d ' ')
MAPPING_COUNT=$(docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -t -c "SELECT COUNT(*) FROM \"ApiDrawMapping\";" | tr -d ' ')

echo -e "  Draws en PostgreSQL: ${GREEN}$DRAW_COUNT${NC}"
echo -e "  ApiDrawMappings en PostgreSQL: ${GREEN}$MAPPING_COUNT${NC}"

# Paso 5: Resumen
echo -e "${YELLOW}[5/5] Resumen${NC}"
echo ""
echo -e "${GREEN}=== Sincronización completada ===${NC}"
echo -e "Backup PostgreSQL: $PG_BACKUP_FILE"
echo -e ""
echo -e "Para restaurar el backup en caso de problemas:"
echo -e "  docker exec -i $PG_CONTAINER psql -U $PG_USER -d $PG_DB < $PG_BACKUP_FILE"
