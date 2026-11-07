// Moved verbatim from the original server.js (lines 88-99): the only place that talks to kv_store.
// Every other file reads and writes collections through kvGet / kvSet.

const { pool } = require('../config/db');

// ---------- kv_store helpers ----------
async function kvGet(key) {
  const r = await pool.query('SELECT value FROM kv_store WHERE key=$1', [key]);
  return r.rows.length ? r.rows[0].value : null;
}
async function kvSet(key, value) {
  await pool.query(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
    [key, JSON.stringify(value)]
  );
}

module.exports = { kvGet, kvSet };
