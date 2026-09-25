'use strict';
const { AppError, now, today, round2 } = require('../util');

const DEFAULT_SETTINGS = {
  business_name: 'CAPS._.SHOP',
  business_tagline: 'Tienda de Gorras',
  business_phone: '',
  business_address: '',
  currency: 'RD$',
  credit_days: '30',
  require_open_cash: '1',
  allow_negative_stock: '0',
  seller_can_receive_payments: '1',
  seller_can_discount: '1',
  seller_max_discount_pct: '10',
  receipt_footer: '¡Gracias por su compra!',
  expense_categories: JSON.stringify(['Alquiler', 'Transporte', 'Publicidad', 'Nómina', 'Servicios', 'Internet', 'Delivery', 'Otros']),
  income_categories: JSON.stringify(['Otros ingresos', 'Aporte del dueño', 'Servicios']),
};

function getSetting(db, key) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

function setSetting(db, key, value) {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
}

function audit(ctx, action, entity, entityId, details) {
  ctx.db.insert('audit_log', {
    created_at: now(),
    user_id: ctx.user ? ctx.user.id : null,
    action,
    entity,
    entity_id: entityId ?? null,
    details: details === undefined ? null : typeof details === 'string' ? details : JSON.stringify(details),
  });
}

function openCashSession(db) {
  return db.get("SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1");
}

// Registra una entrada o salida de dinero. El efectivo se asocia a la caja abierta.
function ledger(ctx, { direction, amount, method, category, refType, refId, description, date }) {
  amount = round2(amount);
  if (amount <= 0) return null;
  let sessionId = null;
  if (method === 'efectivo') {
    const session = openCashSession(ctx.db);
    if (session) sessionId = session.id;
    else if (getSetting(ctx.db, 'require_open_cash') === '1') {
      throw new AppError('La caja está cerrada. Abra la caja antes de registrar movimientos en efectivo.', 'CASH_CLOSED');
    }
  }
  return ctx.db.insert('money_movements', {
    date: date || today(),
    direction,
    amount,
    method,
    category,
    ref_type: refType || null,
    ref_id: refId || null,
    description: description || null,
    session_id: sessionId,
    user_id: ctx.user ? ctx.user.id : null,
    created_at: now(),
  });
}

// Modifica la existencia de un producto y deja su movimiento registrado.
function changeStock(ctx, productId, qty, type, { refType, refId, note, unitCost, allowNegative } = {}) {
  const product = ctx.db.get('SELECT id, name, stock, cost FROM products WHERE id = ?', [productId]);
  if (!product) throw new AppError('Producto no encontrado.');
  const after = product.stock + qty;
  if (after < 0 && !allowNegative && getSetting(ctx.db, 'allow_negative_stock') !== '1') {
    throw new AppError(`Existencia insuficiente de "${product.name}" (disponible: ${product.stock}).`, 'NO_STOCK');
  }
  ctx.db.run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', [after, now(), productId]);
  ctx.db.insert('inventory_movements', {
    product_id: productId,
    type,
    qty,
    stock_before: product.stock,
    stock_after: after,
    unit_cost: unitCost ?? product.cost,
    ref_type: refType || null,
    ref_id: refId || null,
    note: note || null,
    user_id: ctx.user ? ctx.user.id : null,
    created_at: now(),
  });
  return after;
}

function isAdmin(ctx) {
  return ctx.user && ctx.user.role === 'admin';
}

module.exports = { DEFAULT_SETTINGS, getSetting, getSettings, setSetting, audit, ledger, changeStock, openCashSession, isAdmin };
