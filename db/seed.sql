-- Usuarios del CRM
INSERT INTO crm_users (name, email, password, role)
VALUES 
  ('Matías Ganzero',  'mati@altech.com.ar',        '$2a$10$PLACEHOLDER_MATI',  'admin'),
  ('Roman Portela',   'portelaroman21@gmail.com',   '$2a$10$8chH.HXqaQ1GCcQjlOymUOIyPGZ.WReWOcXUZoQ//HcJYwsegOh/O', 'admin')
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = EXCLUDED.role;
