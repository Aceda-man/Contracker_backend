// Moved verbatim from the original server.js (lines 53-62): the Postgres pool and initSchema().
// Only change: schema.sql is now looked up at the project root (two folders up from here).

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { DATABASE_URL } = require('./env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema ready.');
}

module.exports = { pool, initSchema };
