'use strict';
const { AppError, now, today, addDays, round2, money, int, text, modelKey } = require('../util');
const { audit, changeStock, isAdmin, getSetting } = require('./common');

const MOVEMENT_LABELS = {
  inicial: 'Inventario inicial',
  compra: 'Compra',
  venta: 'Venta',
  devolucion: 'Devolución de cliente',
  ajuste: 'Ajuste manual',
  entrada: 'Entrada',
  salida: 'Salida',
  anulacion_venta: 'Anulación de venta',
  anulacion_compra: 'Anulación de compra',
  conteo: 'Conteo de inventario',
};

const missing = (field) => { throw new AppError(`${field} es obligatorio.`); };
const orZero = (v) => (v === undefined || v === null || v === '' ? 0 : v);
const cost4 = (v) => {
  money(orZero(v), 'Costo'); // valida
  return Math.round(Number(orZero(v)) * 10000) / 10000;
};

function stripCosts(ctx, p) {
  if (!p || isAdmin(ctx)) return p;
  const { cost, ...rest } = p;
  return rest;
}

// El estado se mide con lo disponible: una gorra con todas sus unidades apartadas ya no se puede vender.
function stockStatus(p) {
  const available = p.stock - (p.reserved || 0);
  if (available <= 0) return 'agotado';
  if (available <= p.min_stock) return 'bajo';
  return 'ok';
}

// Unidades apartadas por producto (1.5): apartados activos que todavía no vencen. Vencen al terminar
// el día de expires_on; desde el día siguiente esas unidades se pueden vender otra vez.
const RESERVED_SQL = `(SELECT ri.product_id, SUM(ri.qty) AS qty FROM reservation_items ri JOIN reservations r ON r.id = ri.reservation_id
  WHERE r.status = 'activo' AND r.expires_on >= ? AND r.id <> ? GROUP BY ri.product_id)`;

function reservedQty(db, productId, { exclude = 0 } = {}) {
  return db.value(`SELECT COALESCE(SUM(qty), 0) FROM ${RESERVED_SQL} WHERE product_id = ?`, [today(), exclude, productId]);
}

function withStock(ctx, p) {
  const reserved = p.reserved || 0;
  return stripCosts(ctx, { ...p, reserved, available: p.stock - reserved, status: stockStatus(p) });
}

function list(ctx, { search = '', status = 'todos', includeInactive = false, model_id } = {}) {
  const where = [];
  const params = [today(), 0];
  if (!includeInactive) where.push('active = 1');
  if (model_id) { where.push('model_id = ?'); params.push(model_id); }
  if (search) {
    const q = `%${search.trim()}%`;
    where.push('(name LIKE ? OR brand LIKE ? OR model LIKE ? OR category LIKE ? OR color LIKE ? OR size LIKE ? OR sku LIKE ? OR barcode LIKE ?)');
    params.push(q, q, q, q, q, q, q, q);
  }
  const avail = '(stock - COALESCE(rv.qty, 0))';
  if (status === 'agotado') where.push(`${avail} <= 0`);
  if (status === 'bajo') where.push(`${avail} > 0 AND ${avail} <= min_stock`);
  if (status === 'reponer') where.push(`${avail} <= min_stock`);
  if (status === 'apartado') where.push('COALESCE(rv.qty, 0) > 0');
  const rows = ctx.db.all(
    `SELECT p.*, COALESCE(rv.qty, 0) AS reserved FROM products p LEFT JOIN ${RESERVED_SQL} rv ON rv.product_id = p.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name, color, size`,
    params
  );
  return rows.map((p) => withStock(ctx, p));
}

function get(ctx, { id }) {
  const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!p) throw new AppError('Producto no encontrado.');
  const variants = p.model_id ? ctx.db.value('SELECT COUNT(*) FROM products WHERE model_id = ?', [p.model_id]) : 1;
  return withStock(ctx, { ...p, reserved: reservedQty(ctx.db, p.id), variants });
}

// Búsqueda exacta por código de barras o SKU (lector de código de barras).
function findByCode(ctx, { code }) {
  const c = String(code || '').trim();
  if (!c) return null;
  const p = ctx.db.get('SELECT * FROM products WHERE active = 1 AND (barcode = ? OR sku = ?)', [c, c]);
  return p ? withStock(ctx, { ...p, reserved: reservedQty(ctx.db, p.id) }) : null;
}

function nextSku(db) {
  const n = db.value("SELECT COALESCE(MAX(id), 0) + 1 FROM products");
  let sku = `CS-${String(n).padStart(5, '0')}`;
  let i = n;
  while (db.get('SELECT id FROM products WHERE sku = ?', [sku])) sku = `CS-${String(++i).padStart(5, '0')}`;
  return sku;
}

function save(ctx, data) {
  const fields = {
    name: text(data.name, 'Nombre', { required: true, max: 120 }),
    brand: text(data.brand, 'Marca', { max: 80 }),
    model: text(data.model, 'Modelo', { max: 80 }),
    category: text(data.category, 'Categoría', { max: 60 }),
    color: text(data.color, 'Color', { max: 60 }),
    size: text(data.size, 'Talla', { max: 30 }),
    sku: text(data.sku, 'SKU', { max: 60 }),
    barcode: text(data.barcode, 'Código de barras', { max: 60 }),
    // El costo promedio guarda 4 decimales para no acumular errores de redondeo.
    cost: cost4(data.cost),
    // Un producto sin precio al detalle se vendería en 0 (RF-NUE-07).
    price_retail: orZero(data.price_retail) === 0 && data.price_retail !== 0 ? missing('Precio al detalle') : money(data.price_retail, 'Precio al detalle', { allowZero: false }),
    price_wholesale: money(orZero(data.price_wholesale), 'Precio al por mayor'),
    min_stock: int(orZero(data.min_stock), 'Stock mínimo'),
    notes: text(data.notes, 'Notas', { max: 1000 }),
  };
  if (data.photo !== undefined) fields.photo = data.photo || null;
  if (data.active !== undefined) fields.active = data.active ? 1 : 0;

  return ctx.db.tx(() => {
    fields.model_id = ensureModel(ctx.db, fields);
    if (!fields.sku) fields.sku = nextSku(ctx.db);
    if (ctx.db.get('SELECT id FROM products WHERE sku = ? AND id <> ?', [fields.sku, data.id || 0])) throw new AppError('Ya existe un producto con ese SKU.');
    if (fields.barcode && ctx.db.get('SELECT id FROM products WHERE barcode = ? AND id <> ?', [fields.barcode, data.id || 0])) {
      throw new AppError('Ya existe un producto con ese código de barras.');
    }
    if (data.id) {
      const old = ctx.db.get('SELECT * FROM products WHERE id = ?', [data.id]);
      if (!old) throw new AppError('Producto no encontrado.');
      ctx.db.update('products', data.id, { ...fields, updated_at: now() });
      if (old.model_id && old.model_id !== fields.model_id) dropEmptyModel(ctx.db, old.model_id);
      const priceChanges = {};
      for (const k of ['cost', 'price_retail', 'price_wholesale']) {
        if (Math.abs(old[k] - fields[k]) > 0.00005) priceChanges[k] = { antes: old[k], despues: fields[k] };
      }
      if (Object.keys(priceChanges).length) audit(ctx, 'cambio_precio', 'producto', data.id, { producto: fields.name, ...priceChanges });
      audit(ctx, 'editar_producto', 'producto', data.id, { producto: fields.name });
      return data.id;
    }
    const t = now();
    const id = ctx.db.insert('products', { ...fields, stock: 0, created_at: t, updated_at: t });
    audit(ctx, 'crear_producto', 'producto', id, { producto: fields.name, sku: fields.sku });
    const initial = int(orZero(data.initial_stock), 'Existencia inicial');
    if (initial > 0) changeStock(ctx, id, initial, 'inicial', { refType: 'producto', refId: id, note: 'Existencia inicial', unitCost: fields.cost });
    return id;
  });
}

/* ---------- Modelos con variantes (1.5) ---------- */
// Un modelo reúne las variantes (color y talla) que tienen el mismo nombre, marca y modelo. Se arma solo
// al guardar: si se cambia el nombre de una variante, pasa al modelo que corresponde.

function ensureModel(db, f) {
  const key = modelKey(f);
  const found = db.get('SELECT id FROM product_models WHERE key = ?', [key]);
  if (found) {
    db.run('UPDATE product_models SET name = ?, brand = ?, model = ? WHERE id = ?', [f.name, f.brand || null, f.model || null, found.id]);
    return found.id;
  }
  return db.insert('product_models', { key, name: f.name, brand: f.brand || null, model: f.model || null, created_at: now() });
}

function dropEmptyModel(db, id) {
  db.run('DELETE FROM product_models WHERE id = ? AND NOT EXISTS (SELECT 1 FROM products WHERE model_id = ?)', [id, id]);
}

// Orden de tallas: numéricas de gorra (7, 7 1/8, 7 1/4…), luego XS…XXL, luego el resto (Ajustable, S/M…).
const LETTER_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
function sizeRank(size) {
  const s = String(size ?? '').trim().toLowerCase();
  const m = /^(\d+)(?:\s+(\d+)\/(\d+))?(?:["”]|\s*cm)?$/.exec(s);
  if (m) return [0, Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0), s];
  const i = LETTER_SIZES.indexOf(s);
  if (i >= 0) return [1, i, s];
  return [s ? 2 : 3, 0, s];
}
function compareSizes(a, b) {
  const x = sizeRank(a);
  const y = sizeRank(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'es');
}

const variantKey = (color, size) => `${String(color ?? '').trim().toLowerCase()}|${String(size ?? '').trim().toLowerCase()}`;

function cleanVariants(variants) {
  if (!Array.isArray(variants) || !variants.length) throw new AppError('Agregue al menos un color o una talla.');
  if (variants.length > 300) throw new AppError('Son demasiadas variantes para un modelo (máximo 300).');
  const seen = new Set();
  return variants.map((v) => {
    const color = text(v.color, 'Color', { max: 60 });
    const size = text(v.size, 'Talla', { max: 30 });
    const k = variantKey(color, size);
    if (seen.has(k)) throw new AppError(`La variante ${[color, size].filter(Boolean).join(' · ') || 'sin color ni talla'} está repetida.`);
    seen.add(k);
    return { color, size, initial_stock: v.initial_stock, barcode: v.barcode, sku: v.sku };
  });
}

// Crea un modelo con todas sus variantes de una vez (la cuadrícula color × talla del formulario).
function createModel(ctx, data) {
  const variants = cleanVariants(data.variants);
  return ctx.db.tx(() => {
    const existing = ctx.db.all('SELECT color, size FROM products WHERE model_id = (SELECT id FROM product_models WHERE key = ?)', [modelKey(data)]);
    const taken = new Set(existing.map((e) => variantKey(e.color, e.size)));
    const clash = variants.find((v) => taken.has(variantKey(v.color, v.size)));
    if (clash) throw new AppError(`Ya existe la variante ${[clash.color, clash.size].filter(Boolean).join(' · ')} de "${data.name}". Agregue solo las que faltan.`);
    const common = {};
    for (const k of ['name', 'brand', 'model', 'category', 'cost', 'price_retail', 'price_wholesale', 'min_stock', 'notes', 'photo']) if (data[k] !== undefined) common[k] = data[k];
    const ids = variants.map((v) => save(ctx, { ...common, ...v }));
    const modelId = ctx.db.value('SELECT model_id FROM products WHERE id = ?', [ids[0]]);
    audit(ctx, 'crear_modelo', 'producto', ids[0], { modelo: data.name, variantes: ids.length });
    return { model_id: modelId, ids };
  });
}

// Agrega colores o tallas a un modelo que ya existe: copian nombre, categoría, precios y costo.
function addVariants(ctx, { model_id, variants }) {
  const base = ctx.db.get('SELECT * FROM products WHERE model_id = ? ORDER BY active DESC, id LIMIT 1', [model_id]);
  if (!base) throw new AppError('Modelo no encontrado.');
  const { id, sku, barcode, color, size, stock, active, created_at, updated_at, model_id: m, last_counted_at, ...common } = base;
  return createModel(ctx, { ...common, variants });
}

// Cambia lo que comparten todas las variantes. Los precios solo si se pide (apply_prices): una talla
// grande puede costar distinto.
function updateModel(ctx, data) {
  const variants = ctx.db.all('SELECT * FROM products WHERE model_id = ? ORDER BY id', [data.id]);
  if (!variants.length) throw new AppError('Modelo no encontrado.');
  return ctx.db.tx(() => {
    for (const v of variants) {
      const next = { ...v, name: data.name, brand: data.brand, model: data.model, category: data.category };
      if (data.apply_prices) Object.assign(next, { price_retail: data.price_retail, price_wholesale: data.price_wholesale });
      if (data.min_stock !== undefined && data.min_stock !== '') next.min_stock = data.min_stock;
      delete next.photo;
      save(ctx, next);
    }
    const modelId = ctx.db.value('SELECT model_id FROM products WHERE id = ?', [variants[0].id]);
    audit(ctx, 'editar_modelo', 'producto', variants[0].id, { modelo: data.name, variantes: variants.length, precios_aplicados: !!data.apply_prices });
    return modelId;
  });
}

// Un modelo con sus variantes y la cuadrícula color × talla (existencia, apartadas y disponible).
function modelGet(ctx, { id }) {
  const m = ctx.db.get('SELECT * FROM product_models WHERE id = ?', [id]);
  if (!m) throw new AppError('Modelo no encontrado.');
  const variants = list(ctx, { model_id: id, includeInactive: true });
  const colors = [];
  for (const v of [...variants].sort((a, b) => a.id - b.id)) if (!colors.includes(v.color || '')) colors.push(v.color || '');
  const sizes = [...new Set(variants.map((v) => v.size || ''))].sort(compareSizes);
  const cells = {};
  for (const v of variants) cells[variantKey(v.color, v.size)] = v.id;
  const sum = (k) => variants.filter((v) => v.active).reduce((s, v) => s + v[k], 0);
  return {
    ...m,
    category: (variants.find((v) => v.category) || {}).category || null,
    photo: (variants.find((v) => v.photo) || {}).photo || null,
    variants,
    colors,
    sizes,
    cells,
    stock: sum('stock'),
    reserved: sum('reserved'),
    available: sum('available'),
  };
}

// Inventario agrupado por modelo.
function models(ctx, params = {}) {
  const map = new Map();
  for (const v of list(ctx, params)) {
    const key = v.model_id || -v.id;
    if (!map.has(key)) map.set(key, { id: v.model_id, name: v.name, brand: v.brand, model: v.model, category: v.category, photo: v.photo, variants: 0, stock: 0, reserved: 0, available: 0, colors: new Set(), sizes: new Set(), price_min: Infinity, price_max: 0, low: 0, out: 0, first_id: v.id });
    const g = map.get(key);
    g.variants++;
    g.stock += v.stock;
    g.reserved += v.reserved;
    g.available += v.available;
    if (v.color) g.colors.add(v.color);
    if (v.size) g.sizes.add(v.size);
    g.price_min = Math.min(g.price_min, v.price_retail);
    g.price_max = Math.max(g.price_max, v.price_retail);
    if (v.status === 'bajo') g.low++;
    if (v.status === 'agotado') g.out++;
    g.photo = g.photo || v.photo;
    g.category = g.category || v.category;
  }
  return [...map.values()].map((g) => ({ ...g, colors: [...g.colors], sizes: [...g.sizes].sort(compareSizes), price_min: g.price_min === Infinity ? 0 : g.price_min }));
}

/* ---------- Conteo cíclico (1.5) ---------- */
// En vez de contar todo de una vez, cada semana se cuenta una parte. Lo que más se vende se cuenta más
// seguido (clasificación ABC por lo vendido en 90 días): A (80 % de las ventas) cada 7 días, B (el 15 %
// siguiente) cada 30 y C (el resto, y lo que no se vende pero tiene existencia) cada 90.
const CYCLE_DAYS = { A: 7, B: 30, C: 90 };

function cycleCount(ctx, { limit } = {}) {
  const t = today();
  const from = addDays(t, -89);
  const size = Math.min(int(limit ?? (Number(getSetting(ctx.db, 'cycle_count_size')) || 20), 'Cantidad', { min: 1 }), 500);
  const sold = new Map(ctx.db.all(
    `SELECT si.product_id AS id, SUM(si.net_total) AS v FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status <> 'anulada' AND s.date BETWEEN ? AND ? GROUP BY si.product_id`, [from, t]).map((r) => [r.id, r.v]));
  const products = ctx.db.all('SELECT id, name, brand, color, size, sku, barcode, stock, last_counted_at FROM products WHERE active = 1 OR stock > 0');
  const total = [...sold.values()].reduce((s, v) => s + Math.max(v, 0), 0);
  let acc = 0;
  const cls = new Map();
  for (const p of [...products].sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0))) {
    const v = Math.max(sold.get(p.id) || 0, 0);
    const share = total > 0 ? acc / total : 1;
    cls.set(p.id, v > 0 && share < 0.8 ? 'A' : v > 0 && share < 0.95 ? 'B' : 'C');
    acc += v;
  }
  const dayDiff = (d) => Math.round((new Date(`${t}T12:00:00`) - new Date(`${d.slice(0, 10)}T12:00:00`)) / 86400000);
  const rows = products.map((p) => {
    const c = cls.get(p.id);
    const since = p.last_counted_at ? dayDiff(p.last_counted_at) : null;
    return { ...p, class: c, every_days: CYCLE_DAYS[c], days_since: since, overdue_days: since === null ? null : since - CYCLE_DAYS[c], sold_90: round2(sold.get(p.id) || 0) };
  }).filter((r) => r.days_since === null || r.overdue_days >= 0)
    // Lo que no se vende y no tiene existencia no hace falta contarlo.
    .filter((r) => r.stock > 0 || r.class !== 'C')
    .sort((a, b) => a.class.localeCompare(b.class) || (b.overdue_days ?? 9999) - (a.overdue_days ?? 9999) || b.sold_90 - a.sold_90);
  const byClass = { A: 0, B: 0, C: 0 };
  for (const r of rows) byClass[r.class]++;
  if (!isAdmin(ctx)) rows.forEach((r) => delete r.sold_90);
  return { date: t, size, due: rows.length, by_class: byClass, every_days: CYCLE_DAYS, rows: rows.slice(0, size) };
}

// Importación desde Excel o CSV (RF-NUE-05). Cada fila crea un producto o, si ya existe uno con ese
// SKU (o ese código de barras), actualiza sus datos y precios; la existencia de un producto que ya
// estaba no se toca (eso se hace con un ajuste, que deja motivo). Una fila con error no detiene las
// demás. Con dryRun se valida todo y no se guarda nada (vista previa).
const IMPORT_FIELDS = ['name', 'brand', 'model', 'category', 'color', 'size', 'sku', 'barcode', 'cost', 'price_retail', 'price_wholesale', 'min_stock', 'notes'];
const DRY_RUN = Symbol('vista previa');

function importRows(ctx, { rows, dryRun = false }) {
  if (!Array.isArray(rows) || !rows.length) throw new AppError('El archivo no tiene productos.');
  if (rows.length > 5000) throw new AppError('El archivo tiene más de 5000 filas. Divídalo en partes.');
  const results = [];
  const touched = new Map(); // producto → fila que ya lo creó o actualizó
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  try {
    ctx.db.tx(() => {
      rows.forEach((r, i) => {
        const line = Number(r._line) || i + 2;
        const label = [r.name, r.color, r.size].filter(has).join(' · ') || r.sku || '';
        try {
          const res = ctx.db.savepoint(() => {
            const sku = has(r.sku) ? String(r.sku).trim() : null;
            const barcode = has(r.barcode) ? String(r.barcode).trim() : null;
            const old = (sku && ctx.db.get('SELECT * FROM products WHERE sku = ?', [sku])) || (!sku && barcode && ctx.db.get('SELECT * FROM products WHERE barcode = ?', [barcode])) || null;
            if (old && touched.has(old.id)) throw new AppError(`El ${sku ? 'SKU' : 'código de barras'} se repite: ya está en la fila ${touched.get(old.id)}.`);
            if (old) {
              touched.set(old.id, line);
              const data = { id: old.id };
              for (const k of IMPORT_FIELDS) data[k] = has(r[k]) ? r[k] : old[k];
              save(ctx, data);
              return { action: 'actualizar', sku: old.sku, note: has(r.initial_stock) && Number(r.initial_stock) !== old.stock ? 'La existencia no cambia al actualizar: use Ajustar existencia.' : null };
            }
            const data = {};
            for (const k of [...IMPORT_FIELDS, 'initial_stock']) if (has(r[k])) data[k] = r[k];
            const id = save(ctx, data);
            touched.set(id, line);
            return { action: 'crear', sku: ctx.db.value('SELECT sku FROM products WHERE id = ?', [id]) };
          });
          results.push({ line, name: label, ...res });
        } catch (err) {
          if (!err.userFacing) throw err;
          results.push({ line, name: label, action: 'error', message: err.message });
        }
      });
      const count = (a) => results.filter((x) => x.action === a).length;
      if (dryRun) throw DRY_RUN;
      audit(ctx, 'importar_productos', 'producto', null, { creados: count('crear'), actualizados: count('actualizar'), con_error: count('error') });
    });
  } catch (err) {
    if (err !== DRY_RUN) throw err;
  }
  const count = (a) => results.filter((x) => x.action === a).length;
  return { dryRun: !!dryRun, created: count('crear'), updated: count('actualizar'), errors: count('error'), results };
}

// Ajustes manuales: entrada (+), salida (-) o conteo físico (fija la existencia).
function adjust(ctx, { product_id, type, qty, counted, note }) {
  const reason = text(note, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!p) throw new AppError('Producto no encontrado.');
    let delta;
    if (type === 'entrada') delta = int(qty, 'Cantidad', { min: 1 });
    else if (type === 'salida') delta = -int(qty, 'Cantidad', { min: 1 });
    else if (type === 'ajuste') delta = int(counted, 'Existencia contada') - p.stock;
    else throw new AppError('Tipo de ajuste inválido.');
    if (delta === 0) throw new AppError('La existencia no cambia con este ajuste.');
    const after = changeStock(ctx, p.id, delta, type, { refType: 'ajuste', note: reason, allowNegative: false });
    if (type === 'ajuste') ctx.db.run('UPDATE products SET last_counted_at = ? WHERE id = ?', [now(), p.id]);
    audit(ctx, 'ajuste_inventario', 'producto', p.id, { producto: p.name, tipo: type, cantidad: delta, existencia: after, motivo: reason });
    return after;
  });
}

// Conteo de inventario (O6): se cuentan muchos productos y se aplican todas las diferencias de una
// vez, con un solo motivo. Cada fila trae lo contado y la existencia que el sistema mostraba al
// empezar a contar (expected). Si se vendió o compró ese producto mientras se contaba, la existencia
// ya no coincide y esa fila no se aplica: hay que volver a contarlo. Con dryRun no se guarda nada.
const COUNT_DRY_RUN = Symbol('vista previa del conteo');

function count(ctx, { counts, note, dryRun = false }) {
  if (!Array.isArray(counts) || !counts.length) throw new AppError('No hay productos contados.');
  if (counts.length > 10000) throw new AppError('Demasiados productos en un solo conteo.');
  const reason = dryRun ? text(note, 'Motivo') : text(note, 'Motivo', { required: true });
  const results = [];
  try {
    ctx.db.tx(() => {
      const seen = new Set();
      for (const c of counts) {
        const p = ctx.db.get('SELECT id, name, color, size, sku, stock, cost FROM products WHERE id = ?', [c.product_id]);
        const row = { product_id: c.product_id, name: p ? [p.name, p.color, p.size].filter(Boolean).join(' · ') : '', sku: p ? p.sku : '' };
        try {
          if (!p) throw new AppError('Producto no encontrado.');
          if (seen.has(p.id)) throw new AppError('Este producto está dos veces en el conteo.');
          seen.add(p.id);
          const counted = int(c.counted, 'Cantidad contada');
          Object.assign(row, { stock: p.stock, counted, diff: counted - p.stock, cost: p.cost });
          if (c.expected !== undefined && c.expected !== null && Number(c.expected) !== p.stock) {
            throw new AppError(`La existencia cambió mientras se contaba (era ${c.expected}, ahora ${p.stock}). Vuelva a contarlo.`);
          }
          if (row.diff === 0) row.action = 'igual';
          else {
            changeStock(ctx, p.id, row.diff, 'conteo', { refType: 'conteo', note: `Conteo: ${reason || ''}`.trim(), allowNegative: false });
            row.action = 'ajustar';
          }
          // Contado aunque coincida: el conteo cíclico lo da por revisado.
          ctx.db.run('UPDATE products SET last_counted_at = ? WHERE id = ?', [now(), p.id]);
        } catch (err) {
          if (!err.userFacing) throw err;
          Object.assign(row, { action: 'error', message: err.message });
        }
        results.push(row);
      }
      if (dryRun) throw COUNT_DRY_RUN;
      const changed = results.filter((r) => r.action === 'ajustar');
      audit(ctx, 'conteo_inventario', 'producto', null, {
        motivo: reason,
        productos_contados: results.filter((r) => r.action !== 'error').length,
        con_diferencia: changed.length,
        unidades_faltantes: -changed.filter((r) => r.diff < 0).reduce((s, r) => s + r.diff, 0),
        unidades_sobrantes: changed.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0),
        cambios: changed.slice(0, 50).map((r) => `${r.name}: ${r.stock} → ${r.counted}`),
      });
    });
  } catch (err) {
    if (err !== COUNT_DRY_RUN) throw err;
  }
  const ok = results.filter((r) => r.action !== 'error');
  const diffs = ok.filter((r) => r.diff !== 0);
  return {
    dryRun: !!dryRun,
    counted: ok.length,
    same: ok.length - diffs.length,
    adjusted: diffs.length,
    errors: results.length - ok.length,
    missing_units: -diffs.filter((r) => r.diff < 0).reduce((s, r) => s + r.diff, 0),
    extra_units: diffs.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0),
    value: round2(diffs.reduce((s, r) => s + r.diff * r.cost, 0)),
    results,
  };
}

function movements(ctx, { product_id, from, to, type } = {}) {
  const where = [];
  const params = [];
  if (product_id) { where.push('m.product_id = ?'); params.push(product_id); }
  if (from) { where.push('date(m.created_at) >= ?'); params.push(from); }
  if (to) { where.push('date(m.created_at) <= ?'); params.push(to); }
  if (type) { where.push('m.type = ?'); params.push(type); }
  const rows = ctx.db.all(
    `SELECT m.*, p.name AS product_name, p.sku, p.color, p.size, u.name AS user_name
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.id DESC`,
    params
  );
  return rows.map((r) => {
    const out = { ...r, type_label: MOVEMENT_LABELS[r.type] || r.type };
    if (!isAdmin(ctx)) delete out.unit_cost;
    return out;
  });
}

// Resumen del inventario. Las unidades y el valor cuentan también los productos desactivados que
// todavía tienen existencia: la mercancía sigue en la tienda (auditoría 2.2).
function summary(ctx) {
  const s = ctx.db.get(`
    SELECT COALESCE(SUM(active), 0) AS products,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock ELSE 0 END), 0) AS units,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * cost ELSE 0 END), 0) AS value_cost,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price_retail ELSE 0 END), 0) AS value_retail,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price_wholesale ELSE 0 END), 0) AS value_wholesale,
           COALESCE(SUM(CASE WHEN active = 1 AND stock <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
           COALESCE(SUM(CASE WHEN active = 1 AND stock > 0 AND stock <= min_stock THEN 1 ELSE 0 END), 0) AS low_stock,
           COALESCE(SUM(CASE WHEN active = 0 AND stock > 0 THEN 1 ELSE 0 END), 0) AS inactive_with_stock,
           COALESCE(SUM(CASE WHEN active = 0 AND stock > 0 THEN stock ELSE 0 END), 0) AS inactive_units
      FROM products`);
  const reserved = ctx.db.value(`SELECT COALESCE(SUM(qty), 0) FROM ${RESERVED_SQL}`, [today(), 0]);
  const out = {
    ...s,
    reserved_units: reserved,
    value_cost: round2(s.value_cost),
    value_retail: round2(s.value_retail),
    value_wholesale: round2(s.value_wholesale),
    potential_profit: round2(s.value_retail - s.value_cost),
  };
  if (!isAdmin(ctx)) { delete out.value_cost; delete out.potential_profit; }
  return out;
}

// Marcas y categorías ya usadas, para sugerirlas al escribir y no terminar con "Snapback" y "snapback".
function facets(ctx) {
  const distinct = (col) => ctx.db.all(`SELECT ${col} AS v, COUNT(*) AS n FROM products WHERE ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col} COLLATE NOCASE ORDER BY ${col} COLLATE NOCASE`).map((r) => r.v);
  return { brands: distinct('brand'), categories: distinct('category') };
}

module.exports = { list, get, findByCode, facets, save, createModel, addVariants, updateModel, modelGet, models, cycleCount, reservedQty, compareSizes, RESERVED_SQL, importRows, count, adjust, movements, summary, stockStatus, MOVEMENT_LABELS };
