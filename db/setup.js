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

    // Usuarios por defecto
    const hashMati  = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'altech2025', 10);
    const hashRoman = await bcrypt.hash('admin123', 10);

    await pool.query(`
      INSERT INTO crm_users (name, email, password, role)
      VALUES
        ($1, $2, $3, 'admin'),
        ($4, $5, $6, 'admin')
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        role     = EXCLUDED.role
    `, [
      'Matías Ganzero', process.env.ADMIN_EMAIL || 'mati@altech.com.ar', hashMati,
      'Roman Portela',  'portelaroman21@gmail.com',                       hashRoman,
    ]);

    console.log('✓ Usuarios creados:');
    console.log('   mati@altech.com.ar       → contraseña del .env');
    console.log('   portelaroman21@gmail.com → admin123');
    console.log('\n✅ Setup completo. Iniciá el servidor con: npm start');
  } catch (err) {
    console.error('Error en setup:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
