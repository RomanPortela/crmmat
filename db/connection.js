const { Pool } = require('pg');
require('dotenv').config();

// Habilita SSL solo si la variable DB_SSL está en 'true'
const useSSL = process.env.DB_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
