'use strict';
// Ayudas para decidir (1.9, DT-48): buscador global, qué comprar según el ritmo de venta, mercancía
// sin movimiento y las alertas del sistema (la campanita). Solo leen: no cambian nada.
const { AppError, today, addDays, round2, int } = require('../util');
const { isAdmin, fmtMoney } = require('./common');
const products = require('./products');
const reservations = require('./reservations');
const finance = require('./finance');

const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

/* ---------- Buscador global (Ctrl + K) ---------- */
// Productos, clientes, ventas y (el administrador) proveedores que coinciden con lo escrito.
function search(ctx, { q, limit = 6 } = {}) {
  const s = String(q ?? '').trim();
  if (!s) return { products: [], customers: [], sales: [], suppliers: [] };
  if (s.length > 80) throw new AppError('Búsqueda demasiado larga.');
  const n = Math.min(int(limit, 'Límite', { min: 1 }), 20);
  const like = `%${s}%`;
  const out = {};
  out.products = products.list(ctx, { search: s }).slice(0, n)
    .map((p) => ({ id: p.id, name: p.name, brand: p.brand, model: p.model, color: p.color, size: p.size, sku: p.sku, stock: p.stock, available: p.available, price_retail: p.price_retail, photo: p.photo }));
  out.customers = ctx.db.all(
    'SELECT id, name, phone FROM customers WHERE active = 1 AND (name LIKE ? OR phone LIKE ? OR document LIKE ?) ORDER BY name LIMIT ?',
    [like, like, like, n]
  );
  // Una venta por su número (V-000123, 123) o por el nombre del cliente.
  const num = /^(?:v-?)?0*(\d{1,9})$/i.exec(s);
  const byId = num ? ctx.db.all(`SELECT s.id, s.date, s.total, s.status, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ? AND s.opening = 0`, [Number(num[1])]) : [];
  const byName = ctx.db.all(
    `SELECT s.id, s.date, s.total, s.status, c.name AS customer_name FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE s.opening = 0 AND c.name LIKE ? ORDER BY s.id DESC LIMIT ?`, [like, n]
  );
  out.sales = [...byId, ...byName.filter((x) => !byId.some((y) => y.id === x.id))].slice(0, n);
  out.suppliers = isAdmin(ctx)
    ? ctx.db.all('SELECT id, name, phone FROM suppliers WHERE active = 1 AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT ?', [like, like, n])
    : [];
  return out;
}

/* ---------- Reposición según el ritmo de venta ---------- */
// Cuántas unidades comprar de cada gorra para cubrir `cover` días, según lo vendido en los últimos
// `days` días, más su stock mínimo, menos lo que hay disponible (sin lo apartado). Solo sale lo que
// hace falta: una gorra que no se vende y está sobre su mínimo no aparece.
function restock(ctx, { days = 30, cover = 30 } = {}) {
  const d = Math.min(int(days, 'Días de ventas', { min: 7 }), 365);
  const c = Math.min(int(cover, 'Días a cubrir', { min: 1 }), 180);
  const t = today();
  const from = addDays(t, -(d - 1));
  const rows = ctx.db.all(
    `SELECT p.id, p.name, p.brand, p.model, p.color, p.size, p.sku, p.stock, p.min_stock, p.cost, p.model_id,
            COALESCE(rv.qty, 0) AS reserved, COALESCE(sd.q, 0) AS sold, sd.last_sale
       FROM products p
       LEFT JOIN ${products.RESERVED_SQL} rv ON rv.product_id = p.id
       LEFT JOIN (SELECT si.product_id, SUM(si.qty - si.returned_qty) AS q, MAX(s.date) AS last_sale
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                   WHERE s.status <> 'anulada' AND s.date >= ? GROUP BY si.product_id) sd ON sd.product_id = p.id
      WHERE p.active = 1`,
    [t, 0, from]
  );
  const out = [];
  for (const p of rows) {
    const available = p.stock - p.reserved;
    const perDay = Math.max(0, p.sold) / d;
    const need = perDay * c + p.min_stock;
    const suggested = Math.max(0, Math.ceil(need - available - 1e-9));
    if (!suggested) continue;
    out.push({
      ...p,
      available,
      per_week: round2(perDay * 7),
      days_left: perDay > 0 ? Math.max(0, Math.floor(available / perDay)) : null,
      suggested,
      cost_total: round2(suggested * p.cost),
    });
  }
  // Primero lo que se acaba antes; después lo que está bajo su mínimo sin ventas recientes.
  out.sort((a, b) => (a.days_left ?? 1e9) - (b.days_left ?? 1e9) || b.per_week - a.per_week || a.name.localeCompare(b.name, 'es'));
  return { days: d, cover: c, from, to: t, rows: out, units: out.reduce((s, r) => s + r.suggested, 0), cost: round2(out.reduce((s, r) => s + r.cost_total, 0)) };
}

/* ---------- Mercancía sin movimiento ---------- */
// Gorras con existencia que no se venden hace `days` días y llevan al menos ese tiempo en la tienda
// (lo que llegó ayer no está "sin movimiento"). Con su valor al costo: plata parada.
function stagnant(ctx, { days = 60 } = {}) {
  const d = Math.min(int(days, 'Días', { min: 1 }), 3650);
  const t = today();
  const since = addDays(t, -d);
  const rows = ctx.db.all(
    `SELECT p.id, p.name, p.brand, p.model, p.color, p.size, p.sku, p.stock, p.cost, p.price_retail, p.stock * p.cost AS value, date(p.created_at) AS created_on,
            (SELECT MAX(s.date) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id = p.id AND s.status <> 'anulada') AS last_sale,
            (SELECT MIN(date(m.created_at)) FROM inventory_movements m WHERE m.product_id = p.id AND m.qty > 0) AS first_in
       FROM products p
      WHERE p.stock > 0
        AND p.id NOT IN (SELECT si.product_id FROM sales s JOIN sale_items si ON si.sale_id = s.id WHERE s.status <> 'anulada' AND s.date >= ?)
      ORDER BY value DESC`,
    [since]
  ).filter((p) => (p.first_in || p.created_on) <= since)
    .map(({ created_on, ...p }) => ({ ...p, value: round2(p.value), days_without_sale: daysBetween(p.last_sale || p.first_in || t, t) }));
  const admin = isAdmin(ctx);
  return {
    days: d,
    rows: admin ? rows : rows.map(({ cost, value, ...r }) => r),
    count: rows.length,
    units: rows.reduce((s, r) => s + r.stock, 0),
    ...(admin ? { value: round2(rows.reduce((s, r) => s + r.value, 0)) } : {}),
  };
}

/* ---------- Alertas (la campanita) ---------- */
// Cada alerta: clave, nivel (danger, warn, info), título, detalle, cuántos y adónde lleva. `sig`
// cambia cuando cambia la situación: la interfaz vuelve a marcarla como nueva.
function alerts(ctx) {
  const db = ctx.db;
  const t = today();
  const admin = isAdmin(ctx);
  const out = [];
  const add = (a) => out.push({ ...a, sig: `${a.key}:${a.count}:${a.amount ?? ''}` });

  const inv = db.get(
    `SELECT SUM(CASE WHEN p.stock - COALESCE(rv.qty, 0) <= 0 THEN 1 ELSE 0 END) AS out,
            SUM(CASE WHEN p.stock - COALESCE(rv.qty, 0) > 0 AND p.stock - COALESCE(rv.qty, 0) <= p.min_stock THEN 1 ELSE 0 END) AS low
       FROM products p LEFT JOIN ${products.RESERVED_SQL} rv ON rv.product_id = p.id WHERE p.active = 1`,
    [t, 0]
  );
  if (inv.out) add({ key: 'agotados', level: 'danger', icon: 'alert', title: `${inv.out} ${inv.out === 1 ? 'producto agotado' : 'productos agotados'}`, detail: 'No se pueden vender hasta que entren.', count: inv.out, route: 'products', params: { status: 'agotado' } });
  if (inv.low) add({ key: 'stock_bajo', level: 'warn', icon: 'box', title: `${inv.low} con stock bajo`, detail: 'Llegaron a su mínimo. Vea cuánto comprar en Reposición.', count: inv.low, route: admin ? 'restock' : 'products', params: admin ? {} : { status: 'bajo' } });

  const overdue = db.get(
    `SELECT COUNT(DISTINCT customer_id) AS n, COALESCE(SUM(balance), 0) AS amount FROM sales
      WHERE status <> 'anulada' AND balance > 0 AND due_date < ? AND customer_id IS NOT NULL`, [t]
  );
  if (overdue.n) add({ key: 'credito_vencido', level: 'danger', icon: 'wallet', title: `${overdue.n} ${overdue.n === 1 ? 'cliente con crédito vencido' : 'clientes con crédito vencido'}`, detail: 'Pasaron la fecha límite de pago.', count: overdue.n, amount: round2(overdue.amount), route: 'receivables' });
  const debt = db.get(
    `SELECT COUNT(DISTINCT customer_id) AS n, COALESCE(SUM(balance), 0) AS amount FROM sales
      WHERE status <> 'anulada' AND balance > 0 AND customer_id IS NOT NULL`
  );
  if (debt.n) add({ key: 'clientes_deuda', level: 'info', icon: 'users', title: `${debt.n} ${debt.n === 1 ? 'cliente debe' : 'clientes deben'}`, detail: 'Cuentas por cobrar pendientes.', count: debt.n, amount: round2(debt.amount), route: 'receivables' });

  const expired = reservations.expiredCount(db);
  if (expired) add({ key: 'apartados_vencidos', level: 'warn', icon: 'bookmark', title: `${expired} ${expired === 1 ? 'apartado vencido' : 'apartados vencidos'}`, detail: 'Sus gorras ya se pueden vender: llame al cliente.', count: expired, route: 'reservations', params: { status: 'vencido' } });

  if (admin) {
    const soon = addDays(t, 3);
    const pay = db.get(
      `SELECT SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS late, SUM(CASE WHEN due_date >= ? THEN 1 ELSE 0 END) AS due,
              COALESCE(SUM(balance), 0) AS amount
         FROM purchases WHERE status <> 'anulada' AND balance > 0 AND due_date IS NOT NULL AND due_date <= ?`,
      [t, t, soon]
    );
    if (pay.late) add({ key: 'compras_vencidas', level: 'danger', icon: 'truck', title: `${pay.late} ${pay.late === 1 ? 'compra vencida' : 'compras vencidas'} por pagar`, detail: 'Pasó la fecha de pago al proveedor.', count: pay.late, amount: round2(pay.amount), route: 'payables' });
    else if (pay.due) add({ key: 'compras_por_vencer', level: 'warn', icon: 'truck', title: `${pay.due} ${pay.due === 1 ? 'compra vence' : 'compras vencen'} en 3 días`, detail: 'Pagos a proveedores próximos.', count: pay.due, amount: round2(pay.amount), route: 'payables' });

    const st = stagnant(ctx, { days: 60 });
    if (st.count) add({ key: 'sin_movimiento', level: 'info', icon: 'history', title: `${st.count} ${st.count === 1 ? 'producto' : 'productos'} sin venderse en 60 días`, detail: `${st.units} unidades paradas (${fmtMoney(db, st.value)} al costo).`, count: st.count, amount: st.value, route: 'restock', params: { tab: 'stagnant', days: 60 } });

    const dep = finance.pendingDeposits(db);
    if (dep && dep.count) add({ key: 'depositos', level: 'warn', icon: 'cash', title: `${dep.count} ${dep.count === 1 ? 'depósito' : 'depósitos'} al banco por verificar`, detail: 'Compárelos con el estado de cuenta.', count: dep.count, amount: round2(dep.amount), route: 'deposits' });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

module.exports = { search, restock, stagnant, alerts };
