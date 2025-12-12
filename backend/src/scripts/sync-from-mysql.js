import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración MySQL remoto (bot)
const MYSQL_CONFIG = {
    host: process.env.LEGACY_DB_HOST || '144.126.150.120',
    port: parseInt(process.env.LEGACY_DB_PORT || '3706'),
    user: process.env.LEGACY_DB_USER || 'diazhh',
    password: process.env.LEGACY_DB_PASSWORD || 'Telecom2025*',
    database: process.env.LEGACY_DB_NAME || 'bot'
};

const BACKUP_DIR = path.resolve(__dirname, '../../../backups');

async function syncFromMySQL() {
    console.log('=== Sincronización MySQL (bot) -> Local ===\n');
    console.log(`Conectando a MySQL: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
    
    let connection;
    
    try {
        connection = await mysql.createConnection(MYSQL_CONFIG);
        console.log('✓ Conexión MySQL establecida\n');
        
        // Crear directorio de backups
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
        
        // Obtener lista de tablas
        const [tables] = await connection.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        
        console.log(`Tablas encontradas (${tableNames.length}):`);
        tableNames.forEach(t => console.log(`  - ${t}`));
        console.log('');
        
        const exportData = {
            exportedAt: new Date().toISOString(),
            source: {
                host: MYSQL_CONFIG.host,
                port: MYSQL_CONFIG.port,
                database: MYSQL_CONFIG.database
            },
            tables: {}
        };
        
        let totalRecords = 0;
        
        for (const tableName of tableNames) {
            try {
                // Obtener estructura de la tabla
                const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);
                
                // Obtener datos
                const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
                
                exportData.tables[tableName] = {
                    columns: columns.map(c => ({
                        name: c.Field,
                        type: c.Type,
                        nullable: c.Null === 'YES',
                        key: c.Key,
                        default: c.Default
                    })),
                    data: rows,
                    count: rows.length
                };
                
                totalRecords += rows.length;
                console.log(`✓ ${tableName}: ${rows.length} registros`);
            } catch (err) {
                console.error(`✗ Error en tabla ${tableName}: ${err.message}`);
            }
        }
        
        // Guardar como JSON
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const jsonFile = path.join(BACKUP_DIR, `mysql_bot_export_${timestamp}.json`);
        
        fs.writeFileSync(jsonFile, JSON.stringify(exportData, null, 2));
        
        console.log('\n=== Resumen ===');
        console.log(`Total tablas: ${tableNames.length}`);
        console.log(`Total registros: ${totalRecords}`);
        console.log(`Archivo exportado: ${jsonFile}`);
        console.log(`Tamaño: ${(fs.statSync(jsonFile).size / 1024).toFixed(2)} KB`);
        
        console.log('\n✓ Exportación completada');
        console.log('\nPróximos pasos:');
        console.log('  1. Revisar el archivo JSON exportado');
        console.log('  2. Ejecutar: yarn db:push (para crear tablas en PostgreSQL)');
        console.log('  3. Ejecutar: yarn migrate:legacy (para importar datos)');
        
        return exportData;
        
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('  No se puede conectar al servidor MySQL.');
            console.error('  Verifica que el servidor esté accesible y las credenciales sean correctas.');
        }
        
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Ejecutar si es el módulo principal
syncFromMySQL();
