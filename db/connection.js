const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('db:5432')
    ? false
    : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err.message);
});

// Normaliza un datetime "naive" (sin offset, típico de un <input type="datetime-local">
// del navegador, ej: "2026-09-29T14:00") a hora de Argentina explícita, agregándole
// el offset -03:00. Así Postgres lo interpreta siempre como ART, sin importar el
// timezone que tenga configurado el servidor donde corre Node.
// Si el valor YA trae offset explícito (Z, +HH:MM, -HH:MM) se deja intacto —
// nunca se pisa una zona horaria que alguien puso a propósito.
function toArgentinaTimestamp(value) {
  if (!value) return value;
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return value + '-03:00';
}

module.exports = {
  toArgentinaTimestamp,
  query: (text, params) => pool.query(text, params),
  pool,
};
