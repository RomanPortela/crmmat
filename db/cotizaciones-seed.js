// ═══════════════════════════════════════════════
// COTIZACIONES ALTECH — Fuente: PDF "ALTECH PERMUTA"
// ═══════════════════════════════════════════════

// Modelos: [nombre, línea]
const MODELS = [
  ['iPhone 11',         'base'],
  ['iPhone 11 Pro',     'pro'],
  ['iPhone 11 Pro Max', 'pro_max'],
  ['iPhone 12',         'base'],
  ['iPhone 12 Pro',     'pro'],
  ['iPhone 12 Pro Max', 'pro_max'],
  ['iPhone 13',         'base'],
  ['iPhone 13 Pro',     'pro'],
  ['iPhone 13 Pro Max', 'pro_max'],
  ['iPhone 14',         'base'],
  ['iPhone 14 Pro',     'pro'],
  ['iPhone 14 Pro Max', 'pro_max'],
  ['iPhone 15',         'base'],
  ['iPhone 15 Pro',     'pro'],
  ['iPhone 15 Pro Max', 'pro_max'],
  ['iPhone 16',         'base'],
  ['iPhone 16 Pro',     'pro'],
  ['iPhone 16 Pro Max', 'pro_max'],
  ['iPhone 17',         'base'],
  ['iPhone 17 Pro',     'pro'],
  ['iPhone 17 Pro Max', 'pro_max'],
];

// Entradas: [modelo, GB, bateríaMin, bateríaMax, precio, nota]
const ENTRIES = [
  // ── iPhone 11 ──
  // 64GB a 70 usd tenga la batería que tenga
  ['iPhone 11', 64, 0, 100, 70, 'Cualquier batería'],
  // 128GB a 100 usd si la batería está entre 75% y 100%
  ['iPhone 11', 128, 75, 100, 100, ''],
  ['iPhone 11', 128, 0, 74, 70, 'Batería baja'],

  // ── iPhone 11 Pro ──
  // 64GB: si es inferior a 90% → 150usd
  ['iPhone 11 Pro', 64, 0, 100, 150, 'Cualquier batería'],
  // 128GB a 150usd tenga la batería que tenga
  ['iPhone 11 Pro', 128, 0, 100, 150, 'Cualquier batería'],
  ['iPhone 11 Pro', 256, 0, 100, 150, ''],

  // ── iPhone 11 Pro Max ──
  // Cualquier capacidad a 150 usd
  ['iPhone 11 Pro Max', 64,  0, 100, 150, 'Cualquier capacidad y batería'],
  ['iPhone 11 Pro Max', 128, 0, 100, 150, 'Cualquier capacidad y batería'],
  ['iPhone 11 Pro Max', 256, 0, 100, 150, 'Cualquier capacidad y batería'],

  // ── iPhone 12 ──
  // 64GB a 100 usd sin importar la batería
  ['iPhone 12', 64, 0, 100, 100, 'Sin importar batería'],
  // 128GB hasta 150usd
  ['iPhone 12', 128, 0, 100, 150, 'Hasta $150 — ajustar por estado'],

  // ── iPhone 12 Pro / Pro Max ──
  // 128GB a todos en 150usd, no importa la batería
  ['iPhone 12 Pro', 128, 0, 100, 150, 'No importa la batería'],
  ['iPhone 12 Pro', 256, 0, 100, 150, ''],
  ['iPhone 12 Pro Max', 128, 0, 100, 150, 'No importa la batería'],
  ['iPhone 12 Pro Max', 256, 0, 100, 150, ''],

  // ── iPhone 13 / 14 (base) ──
  // 128GB: 78-85% → 200 | 86-94% → 250 | 95-100% → 300
  ['iPhone 13', 128, 0,  85,  200, 'Batería 85% o menos'],
  ['iPhone 13', 128, 86, 94,  250, ''],
  ['iPhone 13', 128, 95, 100, 300, ''],
  ['iPhone 14', 128, 0,  85,  200, 'Batería 85% o menos'],
  ['iPhone 14', 128, 86, 94,  250, ''],
  ['iPhone 14', 128, 95, 100, 300, ''],

  // ── iPhone 13 Pro / Pro Max ──
  // 128GB: ≤86% → 360 | ≥90% → 400
  ['iPhone 13 Pro', 128, 0,  89,  360, 'Batería 89% o menos'],
  ['iPhone 13 Pro', 128, 90, 100, 400, 'Batería 90% o más'],
  ['iPhone 13 Pro Max', 128, 0,  89,  410, 'Base $360 + $50 Pro Max'],
  ['iPhone 13 Pro Max', 128, 90, 100, 450, 'Base $400 + $50 Pro Max'],

  // ── iPhone 14 Pro / Pro Max ──
  // 128GB: ≥91% → 450 | ≤90% → 400
  ['iPhone 14 Pro', 128, 0,  90,  400, 'Batería 90% o menos'],
  ['iPhone 14 Pro', 128, 91, 100, 450, 'Batería 91% o más'],
  ['iPhone 14 Pro Max', 128, 0,  90,  450, 'Base $400 + $50 Pro Max'],
  ['iPhone 14 Pro Max', 128, 91, 100, 500, 'Base $450 + $50 Pro Max'],

  // ── iPhone 15 ──
  // 128GB: ≤88% → 400 | 89-100% → 450
  ['iPhone 15', 128, 0,  88,  400, 'Batería 88% o menos'],
  ['iPhone 15', 128, 89, 100, 450, ''],

  // ── iPhone 15 Pro / Pro Max ──
  // 128GB: 90-100% → 580 | <90% → 550
  ['iPhone 15 Pro', 128, 0,  89,  550, 'Batería menos de 90%'],
  ['iPhone 15 Pro', 128, 90, 100, 580, ''],
  ['iPhone 15 Pro Max', 128, 0,  89,  600, 'Base $550 + $50 Pro Max'],
  ['iPhone 15 Pro Max', 128, 90, 100, 630, 'Base $580 + $50 Pro Max'],

  // ── iPhone 16 ──
  // 128GB: ≤94% → 550 | 95-96% → 600 | 97-100% → 650
  ['iPhone 16', 128, 0,  94,  550, 'Batería 94% para abajo'],
  ['iPhone 16', 128, 95, 96,  600, ''],
  ['iPhone 16', 128, 97, 100, 650, ''],

  // ── iPhone 16 Pro ──
  // 128GB: 88-94% → 700 | 95-100% → 750
  ['iPhone 16 Pro', 128, 0,  94,  700, 'Batería 94% o menos'],
  ['iPhone 16 Pro', 128, 95, 100, 750, ''],

  // ── iPhone 16 Pro Max ──
  // 256GB: ≤94% → 850 | 95-100% → 900 | 512GB → 1050
  ['iPhone 16 Pro Max', 256, 0,  94,  850, 'Batería 94% para abajo'],
  ['iPhone 16 Pro Max', 256, 95, 100, 900, ''],
  ['iPhone 16 Pro Max', 512, 0,  100, 1050, 'Ver batería'],

  // ── iPhone 17 ──
  ['iPhone 17', 128, 0, 100, 750, 'Base'],
  ['iPhone 17', 256, 0, 100, 750, 'Base'],
  ['iPhone 17 Pro', 128, 0, 100, 1150, ''],
  ['iPhone 17 Pro', 256, 0, 100, 1150, ''],
];

// Descuentos por daño: [nombre, monto, aplica_a, nota]
const DISCOUNTS = [
  ['Sin Face ID',              100, 'all',      'Aplica a todos los modelos'],
  ['Tapa trasera rota',        100, 'all',      'Aplica a todos los modelos'],
  ['Pantalla rota',             50, 'all',      ''],
  ['Módulo de pantalla inCell', 100, 'all',     'Pantalla no original'],
  ['iPhone 11 — Sin Face ID',   50, 'iphone11', 'Excepción: solo -$50 en iPhone 11'],
  ['iPhone 11 — Tapa rota',     50, 'iphone11', 'Excepción: solo -$50 en iPhone 11'],
  ['Cámara con fallas / vibra', 50, 'all',      'Verificar que no vibre ni falle'],
  ['Parlante con fallas',       50, 'all',      'Testear frontal e inferior'],
  ['Piezas cambiadas',          50, 'all',      'Ajustes > General > Información'],
];

// Modificadores: [nombre, tipo, condición, monto, modelo (null = todos), nota]
const MODIFIERS = [
  ['256GB — General',      'storage', '256',     50, null, 'Sumar $50 al valor del modelo'],
  ['256GB — iPhone 13 Pro','storage', '256',     30, 'iPhone 13 Pro', 'Excepción: solo +$30'],
  ['256GB — 13 Pro Max',   'storage', '256',     30, 'iPhone 13 Pro Max', 'Excepción: solo +$30'],
  ['512GB / 1TB',          'storage', '512',      0, null, 'Se cotiza igual que 256GB — no se paga el espacio extra'],
  ['Pro Max',              'line',    'pro_max', 50, null, 'Sumar $50 sobre el valor del Pro'],
];

// Checklist de revisión física (del PDF)
const CHECKLIST = [
  'Cámaras: que no vibren ni fallen',
  'Sonido: parlante frontal (Ajustes > Sonidos, mover la barra)',
  'Sonido: parlante inferior derecho (el izquierdo es solo rejilla)',
  'Ajustes > General > Información: verificar que no aparezcan carteles de piezas cambiadas',
  'Face ID funcionando',
  'Tapa trasera sin roturas',
  'Pantalla sin roturas ni módulo no original',
];

module.exports = { MODELS, ENTRIES, DISCOUNTS, MODIFIERS, CHECKLIST };
