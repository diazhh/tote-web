import mysql from 'mysql2/promise';
import pg from 'pg';

const { Client } = pg;

const mysqlConfig = {
  host: '144.126.150.120',
  port: 3706,
  user: 'diazhh',
  password: 'Telecom2025*',
  database: 'bot'
};

const pgConfig = {
  host: 'localhost',
  port: 5433,
  user: 'erp_user',
  password: 'erp_password_dev_2024',
  database: 'tote_db'
};

async function migrateMySQLToPostgres() {
  let mysqlConnection;
  let pgClient;

  try {
    console.log('Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(mysqlConfig);
    
    console.log('Connecting to PostgreSQL...');
    pgClient = new Client(pgConfig);
    await pgClient.connect();

    console.log('Getting table list from MySQL...');
    const [tables] = await mysqlConnection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'bot'"
    );

    console.log(`Found ${tables.length} tables to migrate`);

    for (const tableRow of tables) {
      const table_name = tableRow.table_name || tableRow.TABLE_NAME;
      console.log(`\nMigrating table: ${table_name}`);
      
      const [rows] = await mysqlConnection.query(`SELECT * FROM \`${table_name}\``);
      
      if (rows.length === 0) {
        console.log(`  - Table ${table_name} is empty, skipping data migration`);
        continue;
      }

      console.log(`  - Found ${rows.length} rows`);

      const columns = Object.keys(rows[0]);
      const columnNames = columns.map(col => `"${col}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      let successCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        try {
          const values = columns.map(col => {
            let value = row[col];
            
            if (value instanceof Date) {
              return value.toISOString();
            }
            if (Buffer.isBuffer(value)) {
              return value;
            }
            if (typeof value === 'boolean') {
              return value;
            }
            
            return value;
          });

          const insertQuery = `
            INSERT INTO "${table_name}" (${columnNames})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `;

          await pgClient.query(insertQuery, values);
          successCount++;
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            console.log(`  - Error inserting row: ${error.message}`);
          }
        }
      }

      console.log(`  - Successfully migrated: ${successCount} rows`);
      if (errorCount > 0) {
        console.log(`  - Errors: ${errorCount} rows`);
      }
    }

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('MySQL connection closed');
    }
    if (pgClient) {
      await pgClient.end();
      console.log('PostgreSQL connection closed');
    }
  }
}

migrateMySQLToPostgres().catch(console.error);
