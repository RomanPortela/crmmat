const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setup() {
  try {
    console.log('Inicializando base de datos...');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✓ Schema creado');

    // Crear usuario admin por defecto
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'altech2025', 10);
    await pool.query(`
      INSERT INTO crm_users (name, email, password, role)
      VALUES ($1, $2, $3, 'admin')
      ON CONFLICT (email) DO NOTHING
    `, ['Matías Ganzero', process.env.ADMIN_EMAIL || 'mati@altech.com.ar', hash]);
    console.log('✓ Usuario admin creado');

    console.log('\n✅ Setup completo. Podés iniciar el servidor con: npm start');
  } catch (err) {
    console.error('Error en setup:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
