-- ============================================
-- ALTECH CRM - Schema PostgreSQL
-- ============================================

-- Contactos / Leads
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200),
  phone       VARCHAR(30) UNIQUE NOT NULL,
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

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
