const router = require('express').Router();
const db = require('../db/connection');

// GET /api/productos — lista con filtros
router.get('/', async (req, res) => {
  try {
    const {
      search, status, category_id, limit = 20, offset = 0,
      model, gb, battery_min, battery_max, price_min, price_max, color, battery_type,
    } = req.query;
    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (search) {
      where.push(`(p.model ILIKE $${i} OR p.imei ILIKE $${i} OR p.serial_number ILIKE $${i} OR p.color ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (status)      { where.push(`p.status = $${i}`);      params.push(status); i++; }
    if (category_id) { where.push(`p.category_id = $${i}`); params.push(category_id); i++; }
    if (model)        { where.push(`p.model ILIKE $${i}`);        params.push(`%${model}%`); i++; }
    if (gb)           { where.push(`p.storage_gb = $${i}`);       params.push(parseInt(gb)); i++; }
    if (battery_min)  { where.push(`p.battery_pct >= $${i}`);     params.push(parseInt(battery_min)); i++; }
    if (battery_max)  { where.push(`p.battery_pct <= $${i}`);     params.push(parseInt(battery_max)); i++; }
    if (price_min)    { where.push(`p.price >= $${i}`);           params.push(parseFloat(price_min)); i++; }
    if (price_max)    { where.push(`p.price <= $${i}`);           params.push(parseFloat(price_max)); i++; }
    if (color)         { where.push(`p.color ILIKE $${i}`);         params.push(`%${color}%`); i++; }
    if (battery_type)  { where.push(`p.battery_type = $${i}`);      params.push(battery_type); i++; }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(`
      SELECT p.*, pc.name AS category_name,
             s.name AS supplier_name,
             c.name AS client_name, c.last_name AS client_last_name
      FROM productos p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.entry_date DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, params);

    const count = await db.query(
      `SELECT COUNT(*) FROM productos p WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ productos: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/stats
router.get('/stats', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='en_stock') AS en_stock,
        COUNT(*) FILTER (WHERE status='señado')   AS senados,
        COUNT(*) FILTER (WHERE status='vendido' AND DATE_TRUNC('month', sold_at)=DATE_TRUNC('month',NOW())) AS vendidos_mes,
        COALESCE(SUM(cost) FILTER (WHERE status='en_stock'),0)   AS capital_stock,
        COALESCE(SUM(price) FILTER (WHERE status='en_stock'),0)  AS valor_stock
      FROM productos
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/filtros — valores reales existentes, para autocompletar el filtro avanzado
router.get('/filtros', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        (SELECT COALESCE(array_agg(DISTINCT model ORDER BY model), '{}') FROM productos WHERE model IS NOT NULL) AS modelos,
        (SELECT COALESCE(array_agg(DISTINCT color ORDER BY color), '{}') FROM productos WHERE color IS NOT NULL) AS colores,
        (SELECT COALESCE(array_agg(DISTINCT storage_gb ORDER BY storage_gb), '{}') FROM productos WHERE storage_gb IS NOT NULL) AS gb_disponibles,
        (SELECT MIN(price) FROM productos) AS precio_min,
        (SELECT MAX(price) FROM productos) AS precio_max,
        (SELECT MIN(battery_pct) FROM productos WHERE battery_pct IS NOT NULL) AS bateria_min,
        (SELECT MAX(battery_pct) FROM productos WHERE battery_pct IS NOT NULL) AS bateria_max
    `);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/:id — detalle + historial
router.get('/:id', async (req, res) => {
  try {
    const [producto, historial] = await Promise.all([
      db.query(`
        SELECT p.*, pc.name AS category_name, s.name AS supplier_name,
               c.name AS client_name, c.last_name AS client_last_name, c.phone AS client_phone
        FROM productos p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = $1
      `, [req.params.id]),
      db.query(`
        SELECT h.*, u.name AS user_name
        FROM product_history h
        LEFT JOIN crm_users u ON u.id = h.user_id
        WHERE h.producto_id = $1 ORDER BY h.created_at DESC
      `, [req.params.id]),
    ]);
    if (!producto.rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ producto: producto.rows[0], historial: historial.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    if (!f.model) return res.status(400).json({ error: 'El modelo es requerido' });

    // Garantía automática según tipo de batería, salvo que el usuario la haya
    // modificado explícitamente en el formulario (warranty_months viene definido).
    let warrantyMonths = f.warranty_months;
    if (warrantyMonths === undefined || warrantyMonths === null || warrantyMonths === '') {
      warrantyMonths = f.battery_type === 'reemplazada' ? 12 : 3;
    }

    // Garantía de equipo (sellado/usado) — 3 meses por defecto en ambos casos, salvo modificación manual.
    let equipmentWarrantyMonths = f.equipment_warranty_months;
    if (equipmentWarrantyMonths === undefined || equipmentWarrantyMonths === null || equipmentWarrantyMonths === '') {
      equipmentWarrantyMonths = 3;
    }

    const r = await db.query(`
      INSERT INTO productos (
        category_id, model, color, storage_gb, imei, serial_number, battery_pct,
        battery_type, has_face_id, has_true_tone, has_original_box, accessories, warranty_months,
        equipment_type, equipment_warranty_months,
        status, price, cost, condition_notes, general_notes, supplier_id, entry_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,COALESCE($22,NOW()))
      RETURNING *
    `, [
      f.category_id || null, f.model, f.color, f.storage_gb || null, f.imei, f.serial_number,
      f.battery_pct || null, f.battery_type || 'original', f.has_face_id !== false, f.has_true_tone !== false,
      f.has_original_box === true, f.accessories, warrantyMonths,
      f.equipment_type || 'usado', equipmentWarrantyMonths,
      f.status || 'en_stock', f.price || null, f.cost || null,
      f.condition_notes, f.general_notes, f.supplier_id || null, f.entry_date || null,
    ]);

    await db.query(
      `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
      [r.rows[0].id, 'Alta de producto', `Ingresó a stock — ${f.model}`, req.session.user.id]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/productos/:id
router.patch('/:id', async (req, res) => {
  try {
    const f = req.body;
    const prev = await db.query('SELECT status, model FROM productos WHERE id=$1', [req.params.id]);
    if (!prev.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const r = await db.query(`
      UPDATE productos SET
        category_id = COALESCE($1, category_id),
        model = COALESCE($2, model),
        color = COALESCE($3, color),
        storage_gb = COALESCE($4, storage_gb),
        imei = COALESCE($5, imei),
        serial_number = COALESCE($6, serial_number),
        battery_pct = COALESCE($7, battery_pct),
        battery_type = COALESCE($8, battery_type),
        has_face_id = COALESCE($9, has_face_id),
        has_true_tone = COALESCE($10, has_true_tone),
        has_original_box = COALESCE($11, has_original_box),
        accessories = COALESCE($12, accessories),
        warranty_months = COALESCE($13, warranty_months),
        equipment_type = COALESCE($14, equipment_type),
        equipment_warranty_months = COALESCE($15, equipment_warranty_months),
        status = COALESCE($16, status),
        price = COALESCE($17, price),
        cost = COALESCE($18, cost),
        condition_notes = COALESCE($19, condition_notes),
        general_notes = COALESCE($20, general_notes),
        supplier_id = COALESCE($21, supplier_id),
        client_id = COALESCE($22, client_id),
        reserved_at = CASE WHEN $16 = 'señado'  THEN NOW() ELSE reserved_at END,
        sold_at     = CASE WHEN $16 = 'vendido' THEN NOW() ELSE sold_at END,
        updated_at = NOW()
      WHERE id = $23 RETURNING *
    `, [
      f.category_id, f.model, f.color, f.storage_gb, f.imei, f.serial_number, f.battery_pct,
      f.battery_type, f.has_face_id, f.has_true_tone, f.has_original_box, f.accessories, f.warranty_months,
      f.equipment_type, f.equipment_warranty_months,
      f.status, f.price, f.cost, f.condition_notes, f.general_notes,
      f.supplier_id, f.client_id, req.params.id,
    ]);

    if (f.status && f.status !== prev.rows[0].status) {
      await db.query(
        `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
        [req.params.id, 'Cambio de estado', `${prev.rows[0].status} → ${f.status}`, req.session.user.id]
      );
    }

    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/productos/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM productos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// EXPORTAR / IMPORTAR STOCK
// ═══════════════════════════════════════════════

// GET /api/productos/export/csv — descargar stock completo
router.get('/export/csv', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? `WHERE p.status = '${status.replace(/'/g,"")}'` : '';
    const r = await db.query(`
      SELECT p.id, p.model, p.storage_gb, p.color, p.battery_pct,
             p.imei, p.serial_number, p.status, p.price, p.cost,
             p.has_face_id, p.has_true_tone, p.has_original_box,
             p.battery_type, p.warranty_months, p.equipment_type, p.equipment_warranty_months,
             p.condition_notes, p.general_notes,
             pc.name AS categoria, s.name AS proveedor,
             TO_CHAR(p.entry_date, 'YYYY-MM-DD') AS fecha_ingreso
      FROM productos p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      ${where}
      ORDER BY p.model, p.storage_gb
    `);

    const headers = [
      'id','modelo','gb','color','bateria_pct','imei','serie','estado',
      'precio_usd','costo_usd','face_id','true_tone','caja_original',
      'tipo_bateria','garantia_bateria_meses','tipo_equipo','garantia_equipo_meses',
      'notas_estado','notas_generales','categoria','proveedor','fecha_ingreso'
    ];

    const rows = r.rows.map(x => [
      x.id, x.model, x.storage_gb || '', x.color || '', x.battery_pct || '',
      x.imei || '', x.serial_number || '', x.status,
      x.price || '', x.cost || '',
      x.has_face_id ? 'SI' : 'NO', x.has_true_tone ? 'SI' : 'NO',
      x.has_original_box ? 'SI' : 'NO',
      x.battery_type || '', x.warranty_months || '', x.equipment_type || '', x.equipment_warranty_months || '',
      (x.condition_notes || '').replace(/\n/g, ' '),
      (x.general_notes || '').replace(/\n/g, ' '),
      x.categoria || '', x.proveedor || '', x.fecha_ingreso || '',
    ]);

    const csv = [headers, ...rows]
      .map(rr => rr.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stock_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/export/plantilla — CSV vacío con headers
router.get('/export/plantilla', async (req, res) => {
  const headers = [
    'id','modelo','gb','color','bateria_pct','imei','serie','estado',
    'precio_usd','costo_usd','face_id','true_tone','caja_original',
    'tipo_bateria','garantia_bateria_meses','tipo_equipo','garantia_equipo_meses',
    'notas_estado','notas_generales','categoria','proveedor','fecha_ingreso'
  ];
  const ejemplo = [
    '','iPhone 15 Pro','128','Natural Titanium','100','','','en_stock',
    '900','650','SI','SI','NO','original','3','usado','3','','','iPhone','',''
  ];
  const csv = [headers, ejemplo]
    .map(rr => rr.map(v => `"${v}"`).join(','))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_stock.csv"');
  res.send('\uFEFF' + csv);
});

// POST /api/productos/import — cargar stock desde CSV
router.post('/import', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows, mode } = req.body;  // mode: 'update' | 'replace' | 'append'
    if (!Array.isArray(rows) || !rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay filas para importar' });
    }

    // Cache de categorías y proveedores
    const cats = await client.query('SELECT id, name FROM product_categories');
    const catMap = {};
    cats.rows.forEach(c => { catMap[c.name.toLowerCase()] = c.id; });

    const provs = await client.query('SELECT id, name FROM suppliers');
    const provMap = {};
    provs.rows.forEach(p => { provMap[p.name.toLowerCase()] = p.id; });

    let creados = 0, actualizados = 0, errores = [];

    for (const [idx, row] of rows.entries()) {
      try {
        if (!row.modelo) { errores.push(`Fila ${idx+2}: falta el modelo`); continue; }

        // Resolver categoría
        let catId = null;
        if (row.categoria) {
          catId = catMap[row.categoria.toLowerCase()];
          if (!catId) {
            const nc = await client.query(
              'INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
              [row.categoria]
            );
            catId = nc.rows[0].id;
            catMap[row.categoria.toLowerCase()] = catId;
          }
        }

        const provId = row.proveedor ? provMap[row.proveedor.toLowerCase()] || null : null;
        const toBool = v => String(v).toUpperCase() === 'SI' || v === true || String(v) === 'true';
        const toNum = v => (v === '' || v == null) ? null : parseFloat(v);
        const toInt = v => (v === '' || v == null) ? null : parseInt(v);

        const batteryType = row.tipo_bateria || 'original';
        // Compatibilidad: acepta el header viejo 'garantia_meses' o el nuevo 'garantia_bateria_meses'.
        let batteryWarranty = toInt(row.garantia_bateria_meses ?? row.garantia_meses);
        if (batteryWarranty === null) batteryWarranty = batteryType === 'reemplazada' ? 12 : 3;

        const equipmentType = row.tipo_equipo || 'usado';
        let equipmentWarranty = toInt(row.garantia_equipo_meses);
        if (equipmentWarranty === null) equipmentWarranty = 3;

        const vals = [
          catId, row.modelo, row.color || null, toInt(row.gb), toInt(row.bateria_pct),
          row.imei || null, row.serie || null, row.estado || 'en_stock',
          toNum(row.precio_usd), toNum(row.costo_usd),
          row.face_id !== undefined ? toBool(row.face_id) : true,
          row.true_tone !== undefined ? toBool(row.true_tone) : true,
          row.caja_original !== undefined ? toBool(row.caja_original) : false,
          batteryType, batteryWarranty, equipmentType, equipmentWarranty,
          row.notas_estado || null, row.notas_generales || null, provId,
        ];

        if (row.id && mode !== 'append') {
          // Actualizar existente
          const upd = await client.query(`
            UPDATE productos SET
              category_id=$1, model=$2, color=$3, storage_gb=$4, battery_pct=$5,
              imei=$6, serial_number=$7, status=$8, price=$9, cost=$10,
              has_face_id=$11, has_true_tone=$12, has_original_box=$13,
              battery_type=$14, warranty_months=$15, equipment_type=$16, equipment_warranty_months=$17,
              condition_notes=$18, general_notes=$19,
              supplier_id=$20, updated_at=NOW()
            WHERE id=$21 RETURNING id
          `, [...vals, row.id]);
          if (upd.rows[0]) { actualizados++; continue; }
        }

        // Crear nuevo
        const nuevo = await client.query(`
          INSERT INTO productos (
            category_id, model, color, storage_gb, battery_pct, imei, serial_number,
            status, price, cost, has_face_id, has_true_tone, has_original_box,
            battery_type, warranty_months, equipment_type, equipment_warranty_months,
            condition_notes, general_notes, supplier_id, entry_date
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                    COALESCE($21::timestamptz, NOW()))
          RETURNING id
        `, [...vals, row.fecha_ingreso || null]);

        await client.query(
          `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
          [nuevo.rows[0].id, 'Importado desde CSV', row.modelo, req.session.user.id]
        );
        creados++;
      } catch (e) {
        errores.push(`Fila ${idx+2}: ${e.message}`);
      }
    }

    await client.query('COMMIT');
    res.json({ creados, actualizados, errores, total: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST /api/productos/seed — cargar stock inicial
router.post('/seed', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const SEED = require('../db/products-seed.json');

    const cats = {};
    for (const name of ['iPhone','iPad','Mac','Accesorio']) {
      const c = await client.query(
        'INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [name]
      );
      cats[name] = c.rows[0].id;
    }

    let creados = 0;
    for (const p of SEED) {
      // Evitar duplicados exactos
      const exists = await client.query(`
        SELECT id FROM productos
        WHERE model=$1 AND COALESCE(storage_gb,0)=COALESCE($2,0)
          AND COALESCE(color,'')=COALESCE($3,'')
          AND COALESCE(battery_pct,0)=COALESCE($4,0)
          AND price=$5
        LIMIT 1
      `, [p.model, p.storage_gb, p.color, p.battery_pct, p.price]);
      if (exists.rows[0]) continue;

      const r = await client.query(`
        INSERT INTO productos (category_id, model, color, storage_gb, battery_pct,
          status, price, cost, condition_notes, general_notes, entry_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
      `, [cats[p.category] || cats['iPhone'], p.model, p.color, p.storage_gb,
          p.battery_pct, p.status, p.price, p.cost,
          p.condition_notes, p.general_notes, p.entry_date]);

      await client.query(
        `INSERT INTO product_history (producto_id, action, detail, user_id) VALUES ($1,$2,$3,$4)`,
        [r.rows[0].id, 'Carga inicial', p.model, req.session.user.id]
      );
      creados++;
    }

    await client.query('COMMIT');
    res.json({ creados, message: `${creados} productos cargados` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Categorías ────────────────────────────────
router.get('/categorias/list', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM product_categories ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const r = await db.query(
      'INSERT INTO product_categories (name) VALUES ($1) RETURNING *',
      [req.body.name]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM product_categories WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/productos/ventas/recientes — últimas ventas con contacto, día y hora
router.get('/ventas/recientes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const r = await db.query(`
      SELECT p.id, p.model, p.storage_gb, p.color, p.price, p.sold_at,
             cl.name AS client_name, cl.last_name AS client_last_name, cl.phone AS client_phone,
             ct.name AS contact_name, ct.phone AS contact_phone
      FROM productos p
      LEFT JOIN clients cl ON cl.id = p.client_id
      LEFT JOIN contacts ct ON ct.id = cl.contact_id
      WHERE p.status = 'vendido'
      ORDER BY p.sold_at DESC
      LIMIT $1
    `, [limit]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/productos/:id/reservar — reserva puntual, pensada para ser
// llamada de forma aislada (ej: por un sub-agente de IA), sin depender
// de que exista un turno o evento de calendario asociado.
router.post('/:id/reservar', async (req, res) => {
  try {
    const prev = await db.query('SELECT id, model, storage_gb, color, status FROM productos WHERE id=$1', [req.params.id]);
    if (!prev.rows[0]) {
      return res.status(404).json({ ok: false, error: 'No existe ningún producto con ese id' });
    }
    if (prev.rows[0].status !== 'en_stock') {
      return res.status(409).json({
        ok: false,
        error: `No se puede reservar: el producto está en estado "${prev.rows[0].status}", no "en_stock"`,
        producto: prev.rows[0],
      });
    }

    const r = await db.query(`
      UPDATE productos SET status='señado', reserved_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND status='en_stock'
      RETURNING id, model, storage_gb, color, status, reserved_at
    `, [req.params.id]);

    if (!r.rows[0]) {
      // Otra operación lo reservó/vendió justo antes (condición de carrera)
      return res.status(409).json({ ok: false, error: 'El producto ya no estaba disponible al confirmar la reserva' });
    }

    await db.query(
      `INSERT INTO product_history (producto_id, action, detail) VALUES ($1,'Reservado','Reservado por agente de IA')`,
      [req.params.id]
    );

    res.json({ ok: true, producto: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
