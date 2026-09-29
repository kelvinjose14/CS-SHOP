'use strict';
// Apartados (versión 1.5): gorras reservadas para un cliente hasta una fecha. Mientras el apartado está
// activo y no vence, esas unidades no se pueden vender a otro cliente. No mueve dinero ni inventario:
// la existencia baja cuando el cliente se lleva las gorras y se registra la venta desde el apartado.
const { AppError, now, today, addDays, int, text, date, round2 } = require('../util');
const { audit, getSetting } = require('./common');
const { reservedQty } = require('./products');

const MAX_DAYS = 180;
const label = (p) => [p.name, p.color, p.size].filter(Boolean).join(' · ');

// activo, vencido (activo con la fecha pasada), vendido o cancelado.
function state(r, t = today()) {
  return r.status === 'activo' && r.expires_on < t ? 'vencido' : r.status;
}

// Revisa que alcance lo disponible (existencia menos lo apartado por otros) para cada gorra.
function checkAvailable(db, items, exclude = 0) {
  for (const it of items) {
    const p = db.get('SELECT id, name, color, size, stock, active FROM products WHERE id = ?', [it.product_id]);
    if (!p || !p.active) throw new AppError('Producto no disponible.');
    const available = p.stock - reservedQty(db, p.id, { exclude });
    if (it.qty > available) {
      throw new AppError(`De "${label(p)}" quedan ${Math.max(available, 0)} disponibles${p.stock > available ? ` (${p.stock - available} ya apartadas)` : ''}: no alcanza para apartar ${it.qty}.`, 'NO_STOCK');
    }
  }
}

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw new AppError('Agregue al menos una gorra al apartado.');
  const merged = new Map();
  for (const it of items) {
    const id = Number(it.product_id);
    if (!id) throw new AppError('Producto no válido.');
    merged.set(id, (merged.get(id) || 0) + int(it.qty, 'Cantidad', { min: 1 }));
  }
  return [...merged].map(([product_id, qty]) => ({ product_id, qty }));
}

function create(ctx, data) {
  const customer = ctx.db.get('SELECT * FROM customers WHERE id = ?', [data.customer_id]);
  if (!customer) throw new AppError('Elija el cliente del apartado.');
  if (!customer.active) throw new AppError(`${customer.name} está desactivado: no se le puede apartar.`);
  const items = cleanItems(data.items);
  const t = today();
  const days = Number(getSetting(ctx.db, 'reservation_days')) || 15;
  const expires = date(data.expires_on || addDays(t, days), 'Fecha límite', { min: t });
  if (expires > addDays(t, MAX_DAYS)) throw new AppError(`La fecha límite no puede pasar de ${MAX_DAYS} días.`);
  return ctx.db.tx(() => {
    checkAvailable(ctx.db, items);
    const id = ctx.db.insert('reservations', {
      customer_id: customer.id, date: t, expires_on: expires, status: 'activo',
      note: text(data.note, 'Nota', { max: 500 }), user_id: ctx.user.id, created_at: now(),
    });
    for (const it of items) ctx.db.insert('reservation_items', { reservation_id: id, ...it });
    audit(ctx, 'crear_apartado', 'apartado', id, { cliente: customer.name, unidades: items.reduce((s, i) => s + i.qty, 0), vence: expires });
    return id;
  });
}

function list(ctx, { status = '', search = '', customer_id, id } = {}) {
  const t = today();
  const where = [];
  const params = [];
  if (id) { where.push('r.id = ?'); params.push(id); }
  if (status === 'activo') { where.push("r.status = 'activo' AND r.expires_on >= ?"); params.push(t); }
  else if (status === 'vencido') { where.push("r.status = 'activo' AND r.expires_on < ?"); params.push(t); }
  else if (status) { where.push('r.status = ?'); params.push(status); }
  if (customer_id) { where.push('r.customer_id = ?'); params.push(customer_id); }
  if (search) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR EXISTS (SELECT 1 FROM reservation_items ri JOIN products p ON p.id = ri.product_id WHERE ri.reservation_id = r.id AND (p.name LIKE ? OR p.sku LIKE ?)))');
    const q = `%${search.trim()}%`;
    params.push(q, q, q, q);
  }
  const rows = ctx.db.all(
    `SELECT r.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS user_name,
            (SELECT SUM(ri.qty) FROM reservation_items ri WHERE ri.reservation_id = r.id) AS units,
            (SELECT SUM(ri.qty * p.price_retail) FROM reservation_items ri JOIN products p ON p.id = ri.product_id WHERE ri.reservation_id = r.id) AS value,
            (SELECT GROUP_CONCAT(p.name || COALESCE(' · ' || NULLIF(p.color, ''), '') || COALESCE(' · ' || NULLIF(p.size, ''), '') || CASE WHEN ri.qty > 1 THEN ' ×' || ri.qty ELSE '' END, ', ')
               FROM reservation_items ri JOIN products p ON p.id = ri.product_id WHERE ri.reservation_id = r.id) AS summary
       FROM reservations r JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE WHEN r.status = 'activo' THEN 0 ELSE 1 END, r.expires_on, r.id DESC`,
    params
  );
  return rows.map((r) => ({ ...r, value: round2(r.value || 0), state: state(r, t), days_left: Math.round((new Date(`${r.expires_on}T12:00:00`) - new Date(`${t}T12:00:00`)) / 86400000) }));
}

function get(ctx, { id }) {
  const r = list(ctx, { id: Number(id) || -1 })[0];
  if (!r) throw new AppError('Apartado no encontrado.');
  const items = ctx.db.all(
    `SELECT ri.*, p.name, p.brand, p.color, p.size, p.sku, p.photo, p.price_retail, p.price_wholesale, p.stock, p.active
       FROM reservation_items ri JOIN products p ON p.id = ri.product_id WHERE ri.reservation_id = ? ORDER BY ri.id`, [r.id]);
  return { ...r, items, closed_by_name: r.closed_by ? ctx.db.value('SELECT name FROM users WHERE id = ?', [r.closed_by]) : null };
}

function active(ctx, id) {
  const r = ctx.db.get('SELECT * FROM reservations WHERE id = ?', [id]);
  if (!r) throw new AppError('Apartado no encontrado.');
  if (r.status !== 'activo') throw new AppError(`El apartado ya está ${r.status}.`);
  return r;
}

// Más días. Si ya había vencido, se revisa que las gorras sigan disponibles: pudieron venderse.
function extend(ctx, { id, expires_on }) {
  const t = today();
  return ctx.db.tx(() => {
    const r = active(ctx, id);
    const expires = date(expires_on, 'Nueva fecha límite', { min: t });
    if (expires > addDays(t, MAX_DAYS)) throw new AppError(`La fecha límite no puede pasar de ${MAX_DAYS} días.`);
    if (r.expires_on < t) checkAvailable(ctx.db, ctx.db.all('SELECT product_id, qty FROM reservation_items WHERE reservation_id = ?', [r.id]), r.id);
    ctx.db.run('UPDATE reservations SET expires_on = ? WHERE id = ?', [expires, r.id]);
    audit(ctx, 'extender_apartado', 'apartado', r.id, { vence: { antes: r.expires_on, despues: expires } });
    return expires;
  });
}

function cancel(ctx, { id, reason }) {
  const why = text(reason, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const r = active(ctx, id);
    ctx.db.run("UPDATE reservations SET status = 'cancelado', closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ?", [now(), ctx.user.id, why, r.id]);
    audit(ctx, 'cancelar_apartado', 'apartado', r.id, { motivo: why });
  });
}

// Lo llama la venta que se hace desde el apartado (sales.create con reservation_id), dentro de su transacción.
function markSold(ctx, id, saleId) {
  ctx.db.run("UPDATE reservations SET status = 'vendido', sale_id = ?, closed_at = ?, closed_by = ? WHERE id = ?", [saleId, now(), ctx.user.id, id]);
  audit(ctx, 'vender_apartado', 'apartado', id, { venta: saleId });
}

// Para el Inicio: cuántos apartados vencieron y siguen sin resolver.
function expiredCount(db) {
  return db.value("SELECT COUNT(*) FROM reservations WHERE status = 'activo' AND expires_on < ?", [today()]);
}

module.exports = { create, list, get, extend, cancel, markSold, active, expiredCount, state };
