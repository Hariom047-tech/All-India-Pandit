const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL
  || 'postgresql://panditconnect_app:panditconnect_app_dev@localhost:5433/panditconnect';

const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  // a broken idle client shouldn't crash the whole API process
  console.error('[panditconnect-backend] unexpected Postgres pool error:', err);
});

/**
 * Runs `fn(query)` inside a transaction with a Postgres setting set via
 * SET LOCAL (through set_config's third arg), so Row-Level Security policies
 * (see 01-schema.sql) that read it via current_setting(..., true) can see
 * who's asking. SET LOCAL only lives for the current transaction, so this
 * needs one checked-out client + an explicit BEGIN/COMMIT rather than
 * pool.query() (which hands back a random client per call).
 */
async function withSetting(name, value, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [name, value || '']);
    const result = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Sets app.current_user_id, which current_app_user_id() (01-schema.sql)
 *  reads for "is this my own row" RLS policies. Pass userId = null for "no
 *  identity" (RLS then treats the request as anonymous). */
function withUserContext(userId, fn) {
  return withSetting('app.current_user_id', userId, fn);
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withSetting,
  withUserContext,
};
