'use strict';
// Contabilidad, flujo de dinero, dashboard y reportes.
const { today, round2, periodRange, addDays } = require('../util');
const { openCashSession, isAdmin } = require('./common');
const { CASH_LABELS, TRANSFERS } = require('./finance');
const finance = require('./finance');
const products = require('./products');

function r2(obj) {
  for (const k of Object.keys(obj)) if (typeof obj[k] === 'number') obj[k] = round2(obj[k]);
  return obj;
}

function salesTotals(db, from, to) {
  const s = db.get(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(total),0) AS gross,
            COALESCE(SUM(discount),0) AS discounts,
            COALESCE(SUM(cost_total),0) AS cost,
            COALESCE(SUM(CASE WHEN sale_type='detalle' THEN total ELSE 0 END),0) AS retail,
            COALESCE(SUM(CASE WHEN sale_type='mayor' THEN total ELSE 0 END),0) AS wholesale,
            COALESCE(SUM(CASE WHEN payment_type='contado' THEN total ELSE 0 END),0) AS cash_sales,
            COALESCE(SUM(CASE WHEN payment_type='credito' THEN total ELSE 0 END),0) AS credit_sales
       FROM sales WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ?`,
    [from, to]
  );
  const r = db.get('SELECT COALESCE(SUM(r.total),0) AS total, COALESCE(SUM(r.cost_total),0) AS cost FROM returns r JOIN sales s ON s.id = r.sale_id WHERE s.status <> \'anulada\' AND r.date BETWEEN ? AND ?', [from, to]);
  return r2({ ...s, returns: r.total, returns_cost: r.cost, net: s.gross - r.total, cogs: s.cost - r.cost });
}

// Estado de resultados del período.
function profit(ctx, params = {}) {
  const { from, to } = periodRange(params);
  const db = ctx.db;
  const sales = salesTotals(db, from, to);
  const otherIncome = db.value('SELECT COALESCE(SUM(amount),0) FROM incomes WHERE voided = 0 AND date BETWEEN ? AND ?', [from, to]);
  const expenseRows = db.all('SELECT category, SUM(amount) AS amount, COUNT(*) AS count FROM expenses WHERE voided = 0 AND date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC', [from, to]);
  const expenses = expenseRows.reduce((s, e) => s + e.amount, 0);
  const grossProfit = sales.net - sales.cogs;
  const netProfit = grossProfit + otherIncome - expenses;

  // Serie diaria (o mensual si el rango es largo) para gráficos.
  const days = (new Date(to) - new Date(from)) / 86400000;
  const fmt = days > 62 ? "substr(date,1,7)" : 'date';
  const series = {};
  const add = (rows, key) => rows.forEach((r) => { series[r.k] = series[r.k] || { k: r.k, sales: 0, cogs: 0, expenses: 0, other: 0 }; series[r.k][key] += r.v; });
  add(db.all(`SELECT ${fmt} AS k, SUM(total) AS v FROM sales WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'sales');
  add(db.all(`SELECT ${fmt} AS k, SUM(cost_total) AS v FROM sales WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'cogs');
  add(db.all(`SELECT ${fmt.replace('date', 'r.date')} AS k, -SUM(r.total) AS v FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.status <> 'anulada' AND r.date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'sales');
  add(db.all(`SELECT ${fmt.replace('date', 'r.date')} AS k, -SUM(r.cost_total) AS v FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.status <> 'anulada' AND r.date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'cogs');
  add(db.all(`SELECT ${fmt} AS k, SUM(amount) AS v FROM expenses WHERE voided = 0 AND date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'expenses');
  add(db.all(`SELECT ${fmt} AS k, SUM(amount) AS v FROM incomes WHERE voided = 0 AND date BETWEEN ? AND ? GROUP BY k`, [from, to]), 'other');
  // Completa los días/meses sin movimientos para que el gráfico sea continuo.
  const monthly = days > 62;
  for (let k = monthly ? from.slice(0, 7) : from; k <= (monthly ? to.slice(0, 7) : to);) {
    series[k] = series[k] || { k, sales: 0, cogs: 0, expenses: 0, other: 0 };
    if (monthly) {
      const [y, m] = k.split('-').map(Number);
      k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    } else {
      k = addDays(k, 1);
    }
  }
  const seriesList = Object.values(series)
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .map((s) => r2({ ...s, gross_profit: s.sales - s.cogs, net_profit: s.sales - s.cogs + s.other - s.expenses }));

  return {
    from, to,
    granularity: days > 62 ? 'mes' : 'dia',
    sales,
    other_income: round2(otherIncome),
    total_income: round2(sales.net + otherIncome),
    cogs: sales.cogs,
    gross_profit: round2(grossProfit),
    gross_margin: sales.net > 0 ? round2((grossProfit / sales.net) * 100) : 0,
    expenses: round2(expenses),
    expenses_by_category: expenseRows.map((e) => r2(e)),
    net_profit: round2(netProfit),
    net_margin: sales.net > 0 ? round2((netProfit / sales.net) * 100) : 0,
    series: seriesList,
  };
}

// Flujo de dinero: todo lo que entró y salió en el período.
function cashflow(ctx, params = {}) {
  const { from, to } = periodRange(params);
  const db = ctx.db;
  const rows = db.all('SELECT direction, category, method, SUM(amount) AS amount, COUNT(*) AS count FROM money_movements WHERE date BETWEEN ? AND ? GROUP BY direction, category, method', [from, to]);
  // Los depósitos al banco no son entradas ni salidas del negocio: el dinero cambia de lugar.
  const flows = rows.filter((r) => !TRANSFERS.includes(r.category));
  const group = (dir) => {
    const map = {};
    flows.filter((r) => r.direction === dir).forEach((r) => {
      map[r.category] = map[r.category] || { category: r.category, label: CASH_LABELS[r.category] || r.category, amount: 0, methods: {} };
      map[r.category].amount = round2(map[r.category].amount + r.amount);
      map[r.category].methods[r.method] = round2((map[r.category].methods[r.method] || 0) + r.amount);
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  };
  const byMethod = {};
  rows.forEach((r) => {
    byMethod[r.method] = byMethod[r.method] || { method: r.method, in: 0, out: 0 };
    byMethod[r.method][r.direction] = round2(byMethod[r.method][r.direction] + r.amount);
  });
  const totalIn = round2(flows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0));
  const totalOut = round2(flows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0));
  const movements = db.all(
    `SELECT m.*, u.name AS user_name FROM money_movements m LEFT JOIN users u ON u.id = m.user_id WHERE m.date BETWEEN ? AND ? ORDER BY m.id DESC`,
    [from, to]
  ).map((m) => ({ ...m, label: CASH_LABELS[m.category] || m.category }));
  const sales = salesTotals(db, from, to);
  return {
    from, to,
    total_in: totalIn,
    total_out: totalOut,
    net: round2(totalIn - totalOut),
    inflows: group('in'),
    outflows: group('out'),
    // Neto de anulaciones: la parte en efectivo del depósito (sale) menos la de su anulación (vuelve).
    bank_deposits: round2(rows.filter((r) => r.method === 'efectivo' && TRANSFERS.includes(r.category)).reduce((s, r) => s + (r.direction === 'out' ? r.amount : -r.amount), 0)),
    capital: round2(flows.filter((r) => r.category === 'aporte_capital' || r.category === 'anulacion_aporte').reduce((s, r) => s + (r.direction === 'in' ? r.amount : -r.amount), 0)),
    by_method: Object.values(byMethod).map((m) => ({ ...m, net: round2(m.in - m.out) })),
    sold: sales.net,
    spent: round2(db.value('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE voided = 0 AND date BETWEEN ? AND ?', [from, to])),
    purchased: round2(db.value("SELECT COALESCE(SUM(total),0) FROM purchases WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ?", [from, to])),
    receivables: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM sales WHERE status <> 'anulada'")),
    payables: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM purchases WHERE status <> 'anulada'")),
    cash_expected: currentCash(ctx),
    movements,
  };
}

// Efectivo de la tienda: suma de la caja de cada PC activa (abierta: lo esperado; cerrada: lo contado en el último cierre).
function currentCash(ctx) {
  let total = 0;
  for (const t of ctx.db.all('SELECT id FROM terminals WHERE active = 1')) {
    const s = openCashSession(ctx.db, t.id);
    if (s) total += finance.sessionSummary(ctx.db, s).expected;
    else total += ctx.db.value("SELECT counted_amount FROM cash_sessions WHERE status = 'cerrada' AND terminal_id = ? ORDER BY id DESC LIMIT 1", [t.id]) || 0;
  }
  return round2(total);
}

function topProducts(ctx, params = {}) {
  const { from, to } = periodRange(params);
  const limit = Math.min(Number(params.limit) || 20, 500);
  const rows = ctx.db.all(
    `SELECT p.id, p.name, p.brand, p.model, p.color, p.size, p.sku, p.stock, p.photo,
            SUM(si.qty - si.returned_qty) AS qty,
            SUM(si.net_total - (si.net_total * si.returned_qty * 1.0 / si.qty)) AS revenue,
            SUM((si.qty - si.returned_qty) * si.unit_cost) AS cost
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE s.status <> 'anulada' AND s.date BETWEEN ? AND ?
      GROUP BY p.id HAVING qty > 0 ORDER BY qty DESC, revenue DESC LIMIT ?`,
    [from, to, limit]
  ).map((r) => r2({ ...r, profit: r.revenue - r.cost }));
  if (!isAdmin(ctx)) rows.forEach((r) => { delete r.cost; delete r.profit; });
  return { from, to, rows };
}

function dashboard(ctx) {
  const t = today();
  const month = periodRange({ period: 'mes' });
  const db = ctx.db;
  const todaySales = salesTotals(db, t, t);
  const monthProfit = profit(ctx, { period: 'mes' });
  const inv = products.summary(ctx);
  const lowStock = db.all('SELECT id, name, color, size, sku, stock, min_stock FROM products WHERE active = 1 AND stock > 0 AND stock <= min_stock ORDER BY stock, name LIMIT 50');
  const outOfStock = db.all('SELECT id, name, color, size, sku, stock, min_stock FROM products WHERE active = 1 AND stock <= 0 ORDER BY name LIMIT 50');
  const last30 = profit(ctx, { period: 'rango', from: addDays(t, -29), to: t }).series;
  const out = {
    today: t,
    month,
    sales_today: todaySales.net,
    sales_today_count: todaySales.count,
    sales_month: monthProfit.sales.net,
    sales_month_count: monthProfit.sales.count,
    gross_profit_month: monthProfit.gross_profit,
    net_profit_month: monthProfit.net_profit,
    expenses_month: monthProfit.expenses,
    purchases_month: round2(db.value("SELECT COALESCE(SUM(total),0) FROM purchases WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ?", [month.from, month.to])),
    receivables: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM sales WHERE status <> 'anulada'")),
    receivables_overdue: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM sales WHERE status <> 'anulada' AND balance > 0 AND due_date < ?", [t])),
    payables: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM purchases WHERE status <> 'anulada'")),
    payables_overdue: round2(db.value("SELECT COALESCE(SUM(balance),0) FROM purchases WHERE status <> 'anulada' AND balance > 0 AND due_date < ?", [t])),
    cash: currentCash(ctx),
    cash_open: !!openCashSession(db, ctx.terminal),
    inventory: inv,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    top_products: topProducts(ctx, { period: 'mes', limit: 10 }).rows,
    series: last30,
  };
  if (isAdmin(ctx)) {
    out.deposits_pending = finance.pendingDeposits(db); // depósitos al banco sin revisar (auditoría 4.2)
  } else {
    // El vendedor sólo ve ventas e inventario, sin costos ni ganancias.
    for (const k of ['gross_profit_month', 'net_profit_month', 'expenses_month', 'purchases_month', 'payables', 'payables_overdue']) delete out[k];
    out.series = out.series.map(({ k, sales }) => ({ k, sales }));
  }
  return out;
}

function auditLog(ctx, { from, to, user_id, action, entity, search } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('date(a.created_at) >= ?'); params.push(from); }
  if (to) { where.push('date(a.created_at) <= ?'); params.push(to); }
  if (user_id) { where.push('a.user_id = ?'); params.push(user_id); }
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (entity) { where.push('a.entity = ?'); params.push(entity); }
  if (search) { where.push('a.details LIKE ?'); params.push(`%${search}%`); }
  return ctx.db.all(
    `SELECT a.*, u.name AS user_name, t.name AS terminal_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id LEFT JOIN terminals t ON t.id = a.terminal_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC`,
    params
  );
}

function range(ctx, params) {
  return periodRange(params);
}

module.exports = { profit, cashflow, topProducts, dashboard, auditLog, range, salesTotals };
