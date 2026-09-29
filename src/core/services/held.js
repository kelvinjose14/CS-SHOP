'use strict';
// Ventas en espera (1.9, DT-48): un carrito se suspende y se retoma después. Sirven también para tener
// varios carritos abiertos: al pasar de uno a otro, el actual queda en espera. No descuentan existencia
// ni la apartan; eso pasa al cobrar (sales.create), que además borra la venta en espera cobrada.
const { AppError, now, text, int, round2 } = require('../util');
const { audit } = require('./common');
const products = require('./products');

const MAX_LINES = 200;

function clean(ctx, data) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (!lines.length) throw new AppError('El carrito está vacío: no hay nada que dejar en espera.');
  if (lines.length > MAX_LINES) throw new AppError(`Son demasiadas líneas (máximo ${MAX_LINES}).`);
  const out = lines.map((l) => {
    const p = ctx.db.get('SELECT id FROM products WHERE id = ?', [l.product_id]);
    if (!p) throw new AppError('Un producto del carrito ya no existe.');
    const price = Number(l.unit_price);
    return { product_id: p.id, qty: int(l.qty, 'Cantidad', { min: 1 }), unit_price: Number.isFinite(price) && price >= 0 ? round2(price) : 0 };
  });
  const customerId = data.customer_id ? Number(data.customer_id) : null;
  if (customerId && !ctx.db.get('SELECT id FROM customers WHERE id = ?', [customerId])) throw new AppError('Cliente no encontrado.');
  return {
    lines: out,
    customer_id: customerId,
    sale_type: data.sale_type === 'mayor' ? 'mayor' : 'detalle',
    payment_type: data.payment_type === 'credito' ? 'credito' : 'contado',
    discount: Math.max(0, Number(data.discount) || 0),
    discount_mode: data.discount_mode === 'pct' ? 'pct' : 'monto',
    note: text(data.note, 'Nota', { max: 500 }),
  };
}

// Guardar (o volver a guardar, con id) un carrito en espera. Devuelve su clave.
function hold(ctx, data = {}) {
  const d = clean(ctx, data);
  const items = d.lines.reduce((s, l) => s + l.qty, 0);
  const total = round2(d.lines.reduce((s, l) => s + l.qty * l.unit_price, 0));
  return ctx.db.tx(() => {
    const customer = d.customer_id ? ctx.db.value('SELECT name FROM customers WHERE id = ?', [d.customer_id]) : null;
    const t = now();
    const label = text(data.label, 'Nombre', { max: 60 }) || customer || `En espera ${t.slice(11, 16)}`;
    const row = { label, data: JSON.stringify(d), items, total, customer_id: d.customer_id, user_id: ctx.user.id, terminal_id: ctx.terminal || null, updated_at: t };
    const id = data.id ? Number(data.id) : null;
    if (id && ctx.db.get('SELECT id FROM held_sales WHERE id = ?', [id])) {
      ctx.db.update('held_sales', id, row);
      return id;
    }
    const newId = ctx.db.insert('held_sales', { ...row, created_at: t });
    audit(ctx, 'venta_en_espera', 'venta', newId, { nombre: label, articulos: items, total });
    return newId;
  });
}

// Las ventas en espera, la más reciente primero, con quién la dejó.
function list(ctx) {
  return ctx.db.all(
    `SELECT h.id, h.label, h.items, h.total, h.customer_id, h.created_at, h.updated_at, u.name AS user_name
       FROM held_sales h LEFT JOIN users u ON u.id = h.user_id ORDER BY h.updated_at DESC, h.id DESC`
  );
}

// Retomar: el carrito con los datos de hoy de cada gorra (existencia, precio de lista). Sigue guardada
// hasta cobrarla, volver a suspenderla o descartarla: si se cierra la pantalla, no se pierde.
function get(ctx, { id }) {
  const h = ctx.db.get('SELECT * FROM held_sales WHERE id = ?', [id]);
  if (!h) throw new AppError('Esa venta en espera ya no existe (la cobró o la descartó otra persona).');
  const d = JSON.parse(h.data);
  const lines = [];
  const missing = [];
  for (const l of d.lines) {
    try {
      lines.push({ ...l, p: products.get(ctx, { id: l.product_id }) });
    } catch {
      missing.push(l.product_id);
    }
  }
  return { id: h.id, label: h.label, ...d, lines, missing: missing.length };
}

function remove(ctx, { id }) {
  const h = ctx.db.get('SELECT id, label FROM held_sales WHERE id = ?', [id]);
  if (!h) return 0;
  ctx.db.run('DELETE FROM held_sales WHERE id = ?', [id]);
  audit(ctx, 'descartar_venta_en_espera', 'venta', id, { nombre: h.label });
  return 1;
}

module.exports = { hold, list, get, remove };
