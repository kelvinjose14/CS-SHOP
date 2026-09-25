'use strict';
const { AppError, now, round2, money, int, text } = require('../util');
const { audit, changeStock, isAdmin } = require('./common');

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
};

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

function stockStatus(p) {
  if (p.stock <= 0) return 'agotado';
  if (p.stock <= p.min_stock) return 'bajo';
  return 'ok';
}

function list(ctx, { search = '', status = 'todos', includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('active = 1');
  if (search) {
    const q = `%${search.trim()}%`;
    where.push('(name LIKE ? OR brand LIKE ? OR model LIKE ? OR color LIKE ? OR size LIKE ? OR sku LIKE ? OR barcode LIKE ?)');
    params.push(q, q, q, q, q, q, q);
  }
  if (status === 'agotado') where.push('stock <= 0');
  if (status === 'bajo') where.push('stock > 0 AND stock <= min_stock');
  if (status === 'reponer') where.push('stock <= min_stock');
  const rows = ctx.db.all(
    `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name, color, size`,
    params
  );
  return rows.map((p) => stripCosts(ctx, { ...p, status: stockStatus(p) }));
}

function get(ctx, { id }) {
  const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!p) throw new AppError('Producto no encontrado.');
  return stripCosts(ctx, { ...p, status: stockStatus(p) });
}

// Búsqueda exacta por código de barras o SKU (lector de código de barras).
function findByCode(ctx, { code }) {
  const c = String(code || '').trim();
  if (!c) return null;
  const p = ctx.db.get('SELECT * FROM products WHERE active = 1 AND (barcode = ? OR sku = ?)', [c, c]);
  return p ? stripCosts(ctx, { ...p, status: stockStatus(p) }) : null;
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
    color: text(data.color, 'Color', { max: 60 }),
    size: text(data.size, 'Talla', { max: 30 }),
    sku: text(data.sku, 'SKU', { max: 60 }),
    barcode: text(data.barcode, 'Código de barras', { max: 60 }),
    // El costo promedio guarda 4 decimales para no acumular errores de redondeo.
    cost: cost4(data.cost),
    price_retail: money(orZero(data.price_retail), 'Precio al detalle'),
    price_wholesale: money(orZero(data.price_wholesale), 'Precio al por mayor'),
    min_stock: int(orZero(data.min_stock), 'Stock mínimo'),
    notes: text(data.notes, 'Notas', { max: 1000 }),
  };
  if (data.photo !== undefined) fields.photo = data.photo || null;
  if (data.active !== undefined) fields.active = data.active ? 1 : 0;

  return ctx.db.tx(() => {
    if (!fields.sku) fields.sku = nextSku(ctx.db);
    if (ctx.db.get('SELECT id FROM products WHERE sku = ? AND id <> ?', [fields.sku, data.id || 0])) throw new AppError('Ya existe un producto con ese SKU.');
    if (fields.barcode && ctx.db.get('SELECT id FROM products WHERE barcode = ? AND id <> ?', [fields.barcode, data.id || 0])) {
      throw new AppError('Ya existe un producto con ese código de barras.');
    }
    if (data.id) {
      const old = ctx.db.get('SELECT * FROM products WHERE id = ?', [data.id]);
      if (!old) throw new AppError('Producto no encontrado.');
      ctx.db.update('products', data.id, { ...fields, updated_at: now() });
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
    audit(ctx, 'ajuste_inventario', 'producto', p.id, { producto: p.name, tipo: type, cantidad: delta, existencia: after, motivo: reason });
    return after;
  });
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
      ORDER BY m.id DESC LIMIT 2000`,
    params
  );
  return rows.map((r) => {
    const out = { ...r, type_label: MOVEMENT_LABELS[r.type] || r.type };
    if (!isAdmin(ctx)) delete out.unit_cost;
    return out;
  });
}

function summary(ctx) {
  const s = ctx.db.get(`
    SELECT COUNT(*) AS products,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock ELSE 0 END), 0) AS units,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * cost ELSE 0 END), 0) AS value_cost,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price_retail ELSE 0 END), 0) AS value_retail,
           COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price_wholesale ELSE 0 END), 0) AS value_wholesale,
           COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
           COALESCE(SUM(CASE WHEN stock > 0 AND stock <= min_stock THEN 1 ELSE 0 END), 0) AS low_stock
      FROM products WHERE active = 1`);
  const out = {
    ...s,
    value_cost: round2(s.value_cost),
    value_retail: round2(s.value_retail),
    value_wholesale: round2(s.value_wholesale),
    potential_profit: round2(s.value_retail - s.value_cost),
  };
  if (!isAdmin(ctx)) { delete out.value_cost; delete out.potential_profit; }
  return out;
}

module.exports = { list, get, findByCode, save, adjust, movements, summary, stockStatus, MOVEMENT_LABELS };
