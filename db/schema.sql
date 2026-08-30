-- ============================================
-- ALTECH CRM - Schema PostgreSQL
-- ============================================

-- Contactos / Leads
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200),
  phone       VARCHAR(30),
  whatsapp_id VARCHAR(100),
  city        VARCHAR(100) DEFAULT 'Bahía Blanca',
  source      VARCHAR(50) DEFAULT 'whatsapp', -- whatsapp, instagram, referido, local
  is_first_iphone BOOLEAN DEFAULT NULL,
  current_device  VARCHAR(100),              -- iPhone que tiene actualmente
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Etapas del pipeline
-- nuevo → contactado → interesado → propuesta → turno_agendado → ganado | perdido
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL,
  order_index INT NOT NULL
);

INSERT INTO pipeline_stages (name, label, color, order_index) VALUES
  ('nuevo',          'Nuevo',            '#6B7280', 1),
  ('contactado',     'Contactado',       '#3B82F6', 2),
  ('interesado',     'Interesado',       '#8B5CF6', 3),
  ('propuesta',      'Propuesta Enviada','#F59E0B', 4),
  ('turno_agendado', 'Turno Agendado',   '#10B981', 5),
  ('ganado',         'Ganado',           '#059669', 6),
  ('perdido',        'Perdido',          '#EF4444', 7)
ON CONFLICT (name) DO NOTHING;

-- Conversaciones / Leads activos
CREATE TABLE IF NOT EXISTS conversations (
  id              SERIAL PRIMARY KEY,
  contact_id      INT REFERENCES contacts(id) ON DELETE CASCADE,
  stage           VARCHAR(50) DEFAULT 'nuevo',
  product_interest VARCHAR(200),          -- qué modelo le interesa
  budget_usd      DECIMAL(10,2),
  payment_method  VARCHAR(100),
  has_trade_in    BOOLEAN DEFAULT FALSE,
  agent_notes     TEXT,
  lost_reason     TEXT,
  first_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at  TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Turnos / Citas
CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  contact_id      INT REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          VARCHAR(30) DEFAULT 'pendiente', -- pendiente, confirmado, completado, cancelado, no_vino
  product_interested VARCHAR(200),
  has_trade_in    BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  seña_paid       BOOLEAN DEFAULT FALSE,
  seña_amount     DECIMAL(10,2) DEFAULT 30000,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Canjes (trade-ins)
CREATE TABLE IF NOT EXISTS trade_ins (
  id                  SERIAL PRIMARY KEY,
  contact_id          INT REFERENCES contacts(id) ON DELETE CASCADE,
  model               VARCHAR(100) NOT NULL,
  storage_gb          INT,
  battery_pct         INT,
  condition_notes     TEXT,
  has_broken_screen   BOOLEAN DEFAULT FALSE,
  has_broken_back     BOOLEAN DEFAULT FALSE,
  has_no_face_id      BOOLEAN DEFAULT FALSE,
  has_incell_screen   BOOLEAN DEFAULT FALSE,
  estimated_value_usd DECIMAL(10,2),
  actual_value_usd    DECIMAL(10,2),
  status              VARCHAR(30) DEFAULT 'pendiente', -- pendiente, aceptado, rechazado
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Ventas cerradas
CREATE TABLE IF NOT EXISTS sales (
  id              SERIAL PRIMARY KEY,
  contact_id      INT REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
  appointment_id  INT REFERENCES appointments(id) ON DELETE SET NULL,
  trade_in_id     INT REFERENCES trade_ins(id) ON DELETE SET NULL,
  product_name    VARCHAR(200) NOT NULL,
  product_gb      INT,
  price_usd       DECIMAL(10,2) NOT NULL,
  cotizacion      DECIMAL(10,2),           -- cotización del día
  price_ars       DECIMAL(12,2),           -- precio en pesos
  payment_method  VARCHAR(50),             -- efectivo_pesos, efectivo_usd, transferencia, tarjeta, credito_personal
  cuotas          INT DEFAULT 1,
  cuota_amount    DECIMAL(12,2),
  trade_in_value  DECIMAL(10,2) DEFAULT 0, -- valor del canje aplicado
  accessories     BOOLEAN DEFAULT FALSE,
  accessories_amount DECIMAL(10,2) DEFAULT 0,
  total_paid_usd  DECIMAL(10,2),
  notes           TEXT,
  sold_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios del CRM (equipo Altech)
CREATE TABLE IF NOT EXISTS crm_users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(200) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(30) DEFAULT 'agent', -- admin, agent
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_stage ON conversations(stage);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sold_at);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS appointments_updated_at ON appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- EXPANSIÓN CRM — Nuevos módulos
-- ============================================

-- Permisos por usuario y sección
CREATE TABLE IF NOT EXISTS role_permissions (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES crm_users(id) ON DELETE CASCADE,
  section     VARCHAR(50) NOT NULL,  -- dashboard, leads, clientes, productos, cobros, caja, proveedores, tareas, cotizaciones, automatizaciones, reportes, configuracion, calendario
  can_view    BOOLEAN DEFAULT TRUE,
  can_create  BOOLEAN DEFAULT TRUE,
  can_edit    BOOLEAN DEFAULT TRUE,
  can_delete  BOOLEAN DEFAULT FALSE,
  can_export  BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, section)
);

-- Configuración global del sistema
CREATE TABLE IF NOT EXISTS system_config (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);
INSERT INTO system_config (key, value) VALUES
  ('company_name', 'Altech Store'),
  ('company_phone', ''),
  ('company_address', 'Estomba 546 entrepiso B, Bahía Blanca'),
  ('ai_enabled', 'true'),
  ('cotizacion_dolar', '1540'),
  ('seña_default', '30000'),
  ('cable_cargador', '30000')
ON CONFLICT (key) DO NOTHING;

-- Categorías de productos
CREATE TABLE IF NOT EXISTS product_categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO product_categories (name) VALUES ('iPhone'),('Accesorio'),('Repuesto') ON CONFLICT DO NOTHING;

-- Clientes (conversión desde lead)
CREATE TABLE IF NOT EXISTS clients (
  id             SERIAL PRIMARY KEY,
  contact_id     INT REFERENCES contacts(id) ON DELETE SET NULL,
  name           VARCHAR(100),
  last_name      VARCHAR(100),
  dni            VARCHAR(20),
  phone          VARCHAR(30),
  email          VARCHAR(200),
  instagram      VARCHAR(100),
  address        VARCHAR(200),
  city           VARCHAR(100),
  birthday       DATE,
  notes          TEXT,
  ai_enabled     BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_dni ON clients(dni);

-- Productos / Stock
CREATE TABLE IF NOT EXISTS productos (
  id              SERIAL PRIMARY KEY,
  category_id     INT REFERENCES product_categories(id) ON DELETE SET NULL,
  model           VARCHAR(100) NOT NULL,
  color           VARCHAR(50),
  storage_gb      INT,
  imei            VARCHAR(30),
  serial_number   VARCHAR(50),
  battery_pct     INT,
  has_face_id     BOOLEAN DEFAULT TRUE,
  has_true_tone   BOOLEAN DEFAULT TRUE,
  has_original_box BOOLEAN DEFAULT FALSE,
  accessories     TEXT,
  warranty_months INT DEFAULT 6,
  status          VARCHAR(20) DEFAULT 'en_stock', -- en_stock, señado, vendido
  price           DECIMAL(10,2),
  cost            DECIMAL(10,2),
  profit          DECIMAL(10,2) GENERATED ALWAYS AS (price - cost) STORED,
  condition_notes TEXT,   -- pantalla rota, tapa, face id, incell, etc.
  general_notes   TEXT,
  supplier_id     INT,
  client_id       INT REFERENCES clients(id) ON DELETE SET NULL,  -- cliente que compró
  reserved_at     TIMESTAMPTZ,
  sold_at         TIMESTAMPTZ,
  entry_date      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_productos_status ON productos(status);
CREATE INDEX IF NOT EXISTS idx_productos_imei ON productos(imei);

-- Historial de productos
CREATE TABLE IF NOT EXISTS product_history (
  id          SERIAL PRIMARY KEY,
  producto_id INT REFERENCES productos(id) ON DELETE CASCADE,
  action      VARCHAR(100) NOT NULL,
  detail      TEXT,
  user_id     INT REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Cobros / Pagos
CREATE TABLE IF NOT EXISTS cobros (
  id           SERIAL PRIMARY KEY,
  client_id    INT REFERENCES clients(id) ON DELETE SET NULL,
  producto_id  INT REFERENCES productos(id) ON DELETE SET NULL,
  seller_id    INT REFERENCES crm_users(id) ON DELETE SET NULL,
  type         VARCHAR(30) NOT NULL, -- seña, cobro_total, cobro_parcial
  total_amount DECIMAL(12,2) NOT NULL,
  notes        TEXT,
  receipt_num  VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Medios de pago de un cobro (múltiples por cobro)
CREATE TABLE IF NOT EXISTS cobro_payments (
  id        SERIAL PRIMARY KEY,
  cobro_id  INT REFERENCES cobros(id) ON DELETE CASCADE,
  method    VARCHAR(50) NOT NULL, -- efectivo_pesos, efectivo_usd, transferencia, tarjeta, credito_personal
  amount    DECIMAL(12,2) NOT NULL,
  notes     VARCHAR(200)
);

-- Caja — registro de capital
CREATE TABLE IF NOT EXISTS caja_entries (
  id                 SERIAL PRIMARY KEY,
  cobro_id           INT REFERENCES cobros(id) ON DELETE SET NULL,
  producto_id        INT REFERENCES productos(id) ON DELETE SET NULL,
  price              DECIMAL(12,2),
  cost               DECIMAL(12,2),
  profit             DECIMAL(12,2),
  capital_pendiente  DECIMAL(12,2),
  ganancia_pendiente DECIMAL(12,2),
  capital_reintegrado BOOLEAN DEFAULT FALSE,
  ganancia_retirada   BOOLEAN DEFAULT FALSE,
  capital_reintegrado_at TIMESTAMPTZ,
  ganancia_retirada_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Calendario
CREATE TABLE IF NOT EXISTS calendar_events (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ,
  all_day       BOOLEAN DEFAULT FALSE,
  type          VARCHAR(30) DEFAULT 'visita', -- visita, seña, entrega, tarea, otro
  contact_id    INT REFERENCES contacts(id) ON DELETE SET NULL,
  client_id     INT REFERENCES clients(id) ON DELETE SET NULL,
  producto_id   INT REFERENCES productos(id) ON DELETE SET NULL,
  seña_amount   DECIMAL(12,2),
  notes         TEXT,
  created_by    INT REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_at);

-- Tareas
CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  status       VARCHAR(20) DEFAULT 'pendiente', -- pendiente, en_progreso, completada
  priority     VARCHAR(20) DEFAULT 'normal',    -- baja, normal, alta
  type         VARCHAR(50) DEFAULT 'manual',    -- manual, cumpleaños, aniversario, seguimiento, etc.
  due_date     TIMESTAMPTZ,
  assigned_to  INT REFERENCES crm_users(id) ON DELETE SET NULL,
  contact_id   INT REFERENCES contacts(id) ON DELETE SET NULL,
  client_id    INT REFERENCES clients(id) ON DELETE SET NULL,
  producto_id  INT REFERENCES productos(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  contact    VARCHAR(100),
  phone      VARCHAR(30),
  email      VARCHAR(200),
  categories TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos a proveedores
CREATE TABLE IF NOT EXISTS supplier_orders (
  id               SERIAL PRIMARY KEY,
  supplier_id      INT REFERENCES suppliers(id) ON DELETE CASCADE,
  status           VARCHAR(30) DEFAULT 'pendiente', -- pendiente, en_camino, llegado, cancelado
  total_amount     DECIMAL(12,2),
  estimated_arrival DATE,
  actual_arrival   DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Items de pedido
CREATE TABLE IF NOT EXISTS supplier_order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT REFERENCES supplier_orders(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  quantity   INT DEFAULT 1,
  unit_price DECIMAL(10,2),
  total      DECIMAL(12,2)
);

-- Pagos a proveedores
CREATE TABLE IF NOT EXISTS supplier_payments (
  id          SERIAL PRIMARY KEY,
  supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
  order_id    INT REFERENCES supplier_orders(id) ON DELETE SET NULL,
  amount      DECIMAL(12,2) NOT NULL,
  method      VARCHAR(50),
  paid_at     DATE DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tablas de cotizaciones (trade-in)
CREATE TABLE IF NOT EXISTS cotizacion_models (
  id          SERIAL PRIMARY KEY,
  model_name  VARCHAR(100) NOT NULL,
  line        VARCHAR(20) NOT NULL, -- base, plus, pro, pro_max, se
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cotizacion_entries (
  id           SERIAL PRIMARY KEY,
  model_id     INT REFERENCES cotizacion_models(id) ON DELETE CASCADE,
  storage_gb   INT NOT NULL,
  battery_min  INT NOT NULL,
  battery_max  INT NOT NULL,
  base_price   DECIMAL(10,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, storage_gb, battery_min, battery_max)
);

CREATE TABLE IF NOT EXISTS cotizacion_discounts (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL,
  applies_to VARCHAR(50) DEFAULT 'all', -- all, iphone11, etc.
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO cotizacion_discounts (name, amount_usd) VALUES
  ('Pantalla rota', 50),
  ('Tapa trasera rota', 100),
  ('Sin Face ID', 100),
  ('Módulo inCell', 100),
  ('iPhone 11 - Sin Face ID o tapa', 50)
ON CONFLICT DO NOTHING;

-- Automatizaciones
CREATE TABLE IF NOT EXISTS automatizaciones (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(50) NOT NULL, -- cumpleaños, aniversario, seguimiento_3m, seguimiento_6m, seguimiento_anual, vencimiento, etc.
  days_offset INT DEFAULT 0,        -- días antes/después del evento
  message     TEXT,
  status      VARCHAR(20) DEFAULT 'activa', -- activa, desactivada, revision
  ai_enabled  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO automatizaciones (name, type, days_offset, status) VALUES
  ('Cumpleaños', 'cumpleaños', 0, 'activa'),
  ('5 días antes vencimiento', 'vencimiento', -5, 'activa'),
  ('3 días antes vencimiento', 'vencimiento', -3, 'activa'),
  ('1 día antes vencimiento', 'vencimiento', -1, 'activa'),
  ('Seguimiento 3 meses', 'seguimiento_3m', 90, 'activa'),
  ('Seguimiento 6 meses', 'seguimiento_6m', 180, 'activa'),
  ('Seguimiento anual', 'seguimiento_anual', 365, 'activa'),
  ('Aniversario de compra', 'aniversario', 365, 'activa')
ON CONFLICT DO NOTHING;

-- Cargar cotizaciones iniciales
INSERT INTO cotizacion_models (model_name, line) VALUES
  ('iPhone 11', 'base'), ('iPhone 11 Pro', 'pro'), ('iPhone 11 Pro Max', 'pro_max'),
  ('iPhone 12', 'base'), ('iPhone 12 Pro', 'pro'), ('iPhone 12 Pro Max', 'pro_max'),
  ('iPhone 13', 'base'), ('iPhone 13 Pro', 'pro'), ('iPhone 13 Pro Max', 'pro_max'),
  ('iPhone 14', 'base'), ('iPhone 14 Pro', 'pro'), ('iPhone 14 Pro Max', 'pro_max'),
  ('iPhone 15', 'base'), ('iPhone 15 Pro', 'pro'), ('iPhone 15 Pro Max', 'pro_max'),
  ('iPhone 16', 'base'), ('iPhone 16 Pro', 'pro'), ('iPhone 16 Pro Max', 'pro_max'),
  ('iPhone 17', 'base'), ('iPhone 17 Pro', 'pro')
ON CONFLICT DO NOTHING;

-- Triggers nuevas tablas
DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS productos_updated_at ON productos;
CREATE TRIGGER productos_updated_at BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS supplier_orders_updated_at ON supplier_orders;
CREATE TRIGGER supplier_orders_updated_at BEFORE UPDATE ON supplier_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PLANTILLAS DE MENSAJES DEL AGENTE IA
-- ============================================
CREATE TABLE IF NOT EXISTS message_templates (
  id              SERIAL PRIMARY KEY,
  section         VARCHAR(50) NOT NULL,
  section_label   VARCHAR(100) NOT NULL,
  section_order   INT NOT NULL DEFAULT 0,
  item_order      INT NOT NULL DEFAULT 0,
  title           VARCHAR(200) NOT NULL,
  context         TEXT NOT NULL,
  message         TEXT NOT NULL,
  default_message TEXT NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_by      INT REFERENCES crm_users(id) ON DELETE SET NULL,
  UNIQUE(section, title, item_order)
);
CREATE INDEX IF NOT EXISTS idx_templates_section ON message_templates(section, section_order, item_order);

-- ============================================
-- PROVEEDORES — Notas, pedidos y alertas
-- ============================================

-- Notas de proveedores (timeline)
CREATE TABLE IF NOT EXISTS supplier_notes (
  id          SERIAL PRIMARY KEY,
  supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  user_id     INT REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Notas de pedidos (timeline)
CREATE TABLE IF NOT EXISTS order_notes (
  id         SERIAL PRIMARY KEY,
  order_id   INT REFERENCES supplier_orders(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  user_id    INT REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extender items de pedido con datos para carga a stock
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS storage_gb INT;
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS color VARCHAR(50);
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS battery_pct INT;
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10,2);
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS condition_notes TEXT;
ALTER TABLE supplier_order_items ADD COLUMN IF NOT EXISTS loaded_to_stock BOOLEAN DEFAULT FALSE;

-- Extender pedidos
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS loaded_to_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ;
ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(30);

-- Vincular producto con el pedido de origen
ALTER TABLE productos ADD COLUMN IF NOT EXISTS supplier_order_id INT REFERENCES supplier_orders(id) ON DELETE SET NULL;

-- Configuración de alertas de stock
CREATE TABLE IF NOT EXISTS stock_alerts (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  alert_type    VARCHAR(50) NOT NULL,  -- modelo_bajo, linea_baja, sin_stock, capital_alto, antiguedad
  model_pattern VARCHAR(100),          -- ej: "iPhone 15%" o "%Pro Max"
  threshold     INT DEFAULT 2,         -- umbral de unidades
  days_threshold INT,                  -- para alertas de antigüedad
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO stock_alerts (name, alert_type, model_pattern, threshold) VALUES
  ('Stock bajo general', 'modelo_bajo', '%', 2),
  ('Sin stock de Pro Max', 'sin_stock', '%Pro Max%', 0)
ON CONFLICT DO NOTHING;

-- ============================================
-- CALENDARIO — Productos asociados a eventos
-- ============================================
CREATE TABLE IF NOT EXISTS calendar_event_products (
  id          SERIAL PRIMARY KEY,
  event_id    INT REFERENCES calendar_events(id) ON DELETE CASCADE,
  producto_id INT REFERENCES productos(id) ON DELETE CASCADE,
  reserved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_event_products_event ON calendar_event_products(event_id);
CREATE INDEX IF NOT EXISTS idx_event_products_producto ON calendar_event_products(producto_id);

-- Guardar de qué evento vino la reserva del producto
ALTER TABLE productos ADD COLUMN IF NOT EXISTS reserved_event_id INT REFERENCES calendar_events(id) ON DELETE SET NULL;

-- ============================================
-- CONTROL DE IA Y SEGUIMIENTOS POR LEAD/CLIENTE
-- ============================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS followups_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_disabled_reason VARCHAR(200);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS followups_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_disabled_reason VARCHAR(200);

-- Clientes convertidos: IA apagada por defecto
ALTER TABLE clients ALTER COLUMN ai_enabled SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_contacts_ai ON contacts(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_clients_ai ON clients(ai_enabled);

-- ============================================
-- LEADS — Instagram, origen y orden por columna
-- ============================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ DEFAULT NOW();

-- Inicializar stage_changed_at con updated_at para registros existentes
UPDATE conversations SET stage_changed_at = COALESCE(updated_at, created_at)
WHERE stage_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_stage_changed ON conversations(stage_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);

-- Columnas del kanban editables
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Marcar las de cierre como del sistema (no borrables)
UPDATE pipeline_stages SET is_system = TRUE WHERE name IN ('ganado','perdido','nuevo');

-- ============================================
-- COTIZACIONES v2 — Modificadores configurables
-- ============================================
CREATE TABLE IF NOT EXISTS cotizacion_modifiers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  mod_type    VARCHAR(30) NOT NULL,   -- storage, line
  condition   VARCHAR(50) NOT NULL,   -- '256', '512', 'pro_max'
  amount_usd  DECIMAL(10,2) NOT NULL,
  model_id    INT REFERENCES cotizacion_models(id) ON DELETE CASCADE,  -- NULL = aplica a todos
  is_active   BOOLEAN DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cotizacion_discounts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE cotizacion_entries ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- MIGRACIÓN — El teléfono deja de ser obligatorio
-- y único: un mismo número puede repetirse en
-- varios contactos/clientes (ej: familiares que
-- comparten línea, o datos cargados a mano sin tel).
-- Si una base anterior ya tenía la constraint UNIQUE
-- aplicada, se remueve acá.
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'contacts'::regclass AND contype = 'u'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                    WHERE attrelid = 'contacts'::regclass AND attname = 'phone')
  ) THEN
    ALTER TABLE contacts DROP CONSTRAINT contacts_phone_unique;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clients'::regclass AND contype = 'u'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                    WHERE attrelid = 'clients'::regclass AND attname = 'phone')
  ) THEN
    ALTER TABLE clients DROP CONSTRAINT clients_phone_unique;
  END IF;
END $$;

ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

-- ============================================
-- PRODUCTOS — Tipo de batería (original / cambiada)
-- ============================================
ALTER TABLE productos ADD COLUMN IF NOT EXISTS battery_type VARCHAR(20) DEFAULT 'original';
-- battery_type: 'original' (de fábrica) o 'reemplazada' (cambiada por nosotros)
-- Garantía por defecto según tipo: original = 3 meses, reemplazada = 12 meses
-- (el valor se calcula en el backend al crear el producto, este default es solo
-- un fallback por si se inserta directo por SQL sin pasar por la API)

-- ============================================
-- CAMBIOS DE INTEGRACIÓN — Pipeline, turnos, ventas
-- ============================================

-- Vincular turnos y conversaciones a un producto real de stock (además del texto libre existente)
ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS producto_id INT REFERENCES productos(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS producto_id INT REFERENCES productos(id) ON DELETE SET NULL;

-- Vincular turnos a un canje (trade_in) concreto
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS trade_in_id INT REFERENCES trade_ins(id) ON DELETE SET NULL;

-- Vincular ventas a un producto real de stock (para poder marcarlo vendido)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS producto_id INT REFERENCES productos(id) ON DELETE SET NULL;

-- Vincular cobros a un turno de origen (para que aparezcan agrupados)
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS appointment_id INT REFERENCES appointments(id) ON DELETE SET NULL;

-- Vincular cobros a un evento de calendario de origen
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS calendar_event_id INT REFERENCES calendar_events(id) ON DELETE SET NULL;

-- Vincular el evento de calendario con el turno que lo generó (para verlos juntos)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS appointment_id INT REFERENCES appointments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_appointment ON calendar_events(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointments_producto ON appointments(producto_id);
CREATE INDEX IF NOT EXISTS idx_sales_producto ON sales(producto_id);
CREATE INDEX IF NOT EXISTS idx_cobros_appointment ON cobros(appointment_id);
CREATE INDEX IF NOT EXISTS idx_cobros_calendar_event ON cobros(calendar_event_id);

-- ============================================
-- COBROS — Moneda y cotización por cobro
-- ============================================
-- Los cobros se registran en la moneda real en que se cobraron.
-- Si es en pesos, se guarda la cotización usada para poder mostrar
-- el equivalente en USD (que es la moneda de facturación).
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ARS';  -- ARS | USD
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS cotizacion DECIMAL(10,2);
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(12,2);  -- equivalente calculado
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS sale_id INT REFERENCES sales(id) ON DELETE SET NULL;

-- Cada medio de pago también lleva su moneda y cotización
ALTER TABLE cobro_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ARS';
ALTER TABLE cobro_payments ADD COLUMN IF NOT EXISTS cotizacion DECIMAL(10,2);
ALTER TABLE cobro_payments ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS idx_cobros_sale ON cobros(sale_id);
CREATE INDEX IF NOT EXISTS idx_cobros_created ON cobros(created_at DESC);

-- ============================================
-- CAJA — Cierres diarios
-- ============================================
CREATE TABLE IF NOT EXISTS caja_cierres (
  id                 SERIAL PRIMARY KEY,
  fecha              DATE NOT NULL,
  opened_at          TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ DEFAULT NOW(),
  closed_by          INT REFERENCES crm_users(id) ON DELETE SET NULL,
  total_ars          DECIMAL(14,2) DEFAULT 0,
  total_usd          DECIMAL(14,2) DEFAULT 0,
  cantidad_cobros    INT DEFAULT 0,
  cantidad_ventas    INT DEFAULT 0,
  ganancia_usd       DECIMAL(14,2) DEFAULT 0,
  desglose           JSONB,   -- detalle por medio de pago
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caja_cierres_fecha ON caja_cierres(fecha DESC);

-- Marcar qué cobros ya fueron incluidos en un cierre
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS cierre_id INT REFERENCES caja_cierres(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cobros_cierre ON cobros(cierre_id);

-- ============================================
-- AUTO-REPARACIÓN — Contactos sin conversación
-- ============================================
-- Si un contacto se creó por fuera de la API (ej: un INSERT directo por SQL
-- desde n8n u otra herramienta, en vez de pasar por POST /api/contacts o
-- /webhook/lead), puede quedar sin ninguna fila en `conversations`. Sin eso,
-- el lead no tiene etapa asignada y no aparece en el Pipeline aunque el
-- contacto exista perfectamente en la base. Esto lo corrige automáticamente
-- en cada arranque del servidor, sin duplicar si ya tiene alguna.
INSERT INTO conversations (contact_id, stage)
SELECT ct.id, 'nuevo'
FROM contacts ct
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c WHERE c.contact_id = ct.id
);
