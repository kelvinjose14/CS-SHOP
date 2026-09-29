'use strict';
// Dashboard ejecutivo (versión 1.4): indicadores con comparación, salud del inventario, utilidad por
// producto, marca, categoría y vendedor, y pronóstico de cierre de mes. Solo el administrador.
// Las ventas se cuentan como en el estado de resultados: sin anuladas ni saldos iniciales, y las
// devoluciones restan en la fecha en que se hicieron (reports.salesTotals).
const { today, addDays, round2, periodRange, int } = require('../util');
const { salesTotals } = require('./reports');

const pct = (part, whole) => (whole ? round2((part / whole) * 100) : null);
const change = (cur, prev) => (prev ? round2(((cur - prev) / Math.abs(prev)) * 100) : null);
const days = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1;
const weekday = (d) => new Date(`${d}T12:00:00`).getDay();

// La misma fecha un año antes (el 29 de febrero pasa al 28).
function yearBefore(d) {
  const [y, m, day] = d.split('-').map(Number);
  const last = new Date(y - 1, m, 0).getDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
// El mismo día del mes anterior (el 31 pasa al último día de ese mes).
function monthBefore(d) {
  const [y, m, day] = d.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(py, pm, 0).getDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

// Con qué se compara el período elegido. Si el período todavía no termina (este mes), se compara
// hasta el mismo día: del 1 al 15 de este mes contra del 1 al 15 del mes anterior.
function comparisons(period, from, to, t) {
  const complete = to < t;
  const end = complete ? to : t < from ? from : t;
  let prev;
  let label;
  switch (period) {
    case 'dia':
      prev = { from: addDays(from, -1), to: addDays(from, -1) };
      label = from === t ? 'ayer' : 'el día anterior';
      break;
    case 'semana':
      prev = { from: addDays(from, -7), to: addDays(end, -7) };
      label = 'la semana anterior';
      break;
    case 'mes': {
      const pf = monthBefore(from);
      prev = complete ? periodRange({ period: 'mes', ref: pf }) : { from: pf, to: monthBefore(end) };
      label = 'el mes anterior';
      break;
    }
    case 'anio':
      prev = complete ? { from: yearBefore(from), to: yearBefore(to) } : { from: yearBefore(from), to: yearBefore(end) };
      label = 'el año anterior';
      break;
    default: {
      const n = days(from, end);
      prev = { from: addDays(from, -n), to: addDays(from, -1) };
      label = 'el período anterior';
    }
  }
  const yoy = period === 'anio' ? null : { from: yearBefore(from), to: yearBefore(end), label: 'el mismo período del año anterior' };
  return { current: { from, to: end }, prev: { ...prev, label }, yoy };
}

// Indicadores de un rango de fechas.
function kpis(db, from, to) {
  const s = salesTotals(db, from, to);
  const sold = db.value(
    `SELECT COALESCE(SUM(si.qty), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status <> 'anulada' AND s.opening = 0 AND s.date BETWEEN ? AND ?`, [from, to]);
  const returned = db.value(
    `SELECT COALESCE(SUM(ri.qty), 0) FROM return_items ri JOIN returns r ON r.id = ri.return_id JOIN sales s ON s.id = r.sale_id
      WHERE s.status <> 'anulada' AND r.date BETWEEN ? AND ?`, [from, to]);
  const expenses = db.value('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE voided = 0 AND date BETWEEN ? AND ?', [from, to]);
  const other = db.value('SELECT COALESCE(SUM(amount), 0) FROM incomes WHERE voided = 0 AND date BETWEEN ? AND ?', [from, to]);
  const gross = s.net - s.cogs;
  const units = sold - returned;
  return {
    sales: s.net,
    gross_profit: round2(gross),
    margin: pct(gross, s.net),
    tickets: s.count,
    avg_ticket: s.count ? round2(s.net / s.count) : 0,
    units,
    units_per_ticket: s.count ? round2(units / s.count) : 0,
    discounts: s.discounts,
    expenses: round2(expenses),
    net_profit: round2(gross + other - expenses),
  };
}

const KPI_KEYS = ['sales', 'gross_profit', 'margin', 'tickets', 'avg_ticket', 'units', 'units_per_ticket', 'discounts', 'expenses', 'net_profit'];

// Cambio contra otro rango. El margen cambia en puntos (de 40% a 42% son +2 puntos), no en porcentaje.
function compare(cur, other) {
  const out = {};
  for (const k of KPI_KEYS) {
    out[k] = { value: other[k], change: k === 'margin' ? (cur.margin === null || other.margin === null ? null : round2(cur.margin - other.margin)) : change(cur[k], other[k]) };
  }
  return out;
}

// Ventas netas por día (devoluciones restadas el día que se hicieron).
function dailySales(db, from, to) {
  const map = {};
  for (const r of db.all("SELECT date AS d, SUM(total) AS v, SUM(cost_total) AS c FROM sales WHERE status <> 'anulada' AND opening = 0 AND date BETWEEN ? AND ? GROUP BY date", [from, to])) map[r.d] = { sales: r.v, cost: r.c };
  for (const r of db.all("SELECT r.date AS d, SUM(r.total) AS v, SUM(r.cost_total) AS c FROM returns r JOIN sales s ON s.id = r.sale_id WHERE s.status <> 'anulada' AND r.date BETWEEN ? AND ? GROUP BY r.date", [from, to])) {
    map[r.d] = map[r.d] || { sales: 0, cost: 0 };
    map[r.d].sales -= r.v;
    map[r.d].cost -= r.c;
  }
  return map;
}

// Serie para el gráfico: el período elegido al lado del anterior, día por día (o mes por mes si es un año).
function series(db, cmp, period) {
  const monthly = period === 'anio' || days(cmp.current.from, cmp.current.to) > 62;
  const bucket = (from, to) => {
    const daily = dailySales(db, from, to);
    const out = [];
    if (monthly) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const k = d.slice(0, 7);
        if (!out.length || out[out.length - 1].k !== k) out.push({ k, v: 0 });
        out[out.length - 1].v += daily[d] ? daily[d].sales : 0;
      }
    } else {
      for (let d = from; d <= to; d = addDays(d, 1)) out.push({ k: d, v: daily[d] ? daily[d].sales : 0 });
    }
    return out;
  };
  // Se muestra el período completo (un mes entero aunque vaya por el día 15); lo anterior, alineado por posición.
  const full = periodRange({ period: period === 'rango' ? 'rango' : period, from: cmp.current.from, to: cmp.current.to, ref: cmp.current.from });
  const cur = bucket(cmp.current.from, period === 'rango' ? cmp.current.to : full.to);
  const prevFull = period === 'mes' ? periodRange({ period: 'mes', ref: cmp.prev.from })
    : period === 'anio' ? { from: yearBefore(full.from), to: yearBefore(full.to) }
      : { from: cmp.prev.from, to: addDays(cmp.prev.from, cur.length - 1) };
  const prev = bucket(prevFull.from, prevFull.to);
  const t = today();
  return {
    granularity: monthly ? 'mes' : 'dia',
    points: cur.map((c, i) => ({ k: c.k, current: c.k > (monthly ? t.slice(0, 7) : t) ? null : round2(c.v), previous: prev[i] ? round2(prev[i].v) : 0 })),
  };
}

// Utilidad agrupada por producto, marca, categoría o vendedor. Lo devuelto se resta de quien vendió.
const GROUPS = {
  producto: { key: 'p.id', label: "p.name || COALESCE(' · ' || NULLIF(p.color, ''), '') || COALESCE(' · ' || NULLIF(p.size, ''), '')", extra: ', MIN(p.sku) AS sku, MIN(p.brand) AS brand, MIN(p.category) AS category, MIN(p.stock) AS stock' },
  marca: { key: "COALESCE(NULLIF(TRIM(p.brand), ''), 'Sin marca') COLLATE NOCASE", label: "COALESCE(NULLIF(TRIM(p.brand), ''), 'Sin marca')" },
  categoria: { key: "COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría') COLLATE NOCASE", label: "COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría')" },
  vendedor: { key: 's.user_id', label: "COALESCE(u.name, 'Sin usuario')" },
};

function breakdown(db, by, from, to, limit = 500) {
  const g = GROUPS[by];
  const joins = 'JOIN products p ON p.id = x.product_id JOIN sales s ON s.id = x.sale_id LEFT JOIN users u ON u.id = s.user_id';
  const rows = db.all(
    `SELECT ${g.key} AS id, MIN(${g.label}) AS name ${g.extra || ''},
            SUM(x.qty) AS units, SUM(x.revenue) AS revenue, SUM(x.cost) AS cost,
            COUNT(DISTINCT CASE WHEN x.kind = 'v' THEN x.sale_id END) AS tickets
       FROM (
         SELECT 'v' AS kind, si.sale_id, si.product_id, si.qty, si.net_total AS revenue, si.qty * si.unit_cost AS cost
           FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE s.status <> 'anulada' AND s.opening = 0 AND s.date BETWEEN ? AND ?
         UNION ALL
         SELECT 'd', r.sale_id, ri.product_id, -ri.qty, -ri.subtotal, -ri.qty * ri.unit_cost
           FROM return_items ri JOIN returns r ON r.id = ri.return_id JOIN sales s ON s.id = r.sale_id
          WHERE s.status <> 'anulada' AND r.date BETWEEN ? AND ?
       ) x ${joins}
      GROUP BY ${g.key}
      ORDER BY SUM(x.revenue) - SUM(x.cost) DESC
      LIMIT ?`,
    [from, to, from, to, limit]
  );
  return rows.map((r) => {
    const profit = r.revenue - r.cost;
    const out = { ...r, revenue: round2(r.revenue), cost: round2(r.cost), profit: round2(profit), margin: pct(profit, r.revenue) };
    // Tickets y ticket promedio solo tienen sentido por vendedor: una venta lleva varias marcas.
    if (by === 'vendedor') out.avg_ticket = r.tickets ? round2(r.revenue / r.tickets) : 0;
    else delete out.tickets;
    return out;
  });
}

// Salud del inventario en los últimos 90 días, para que no dependa del período elegido: con "Hoy"
// la rotación no diría nada.
const HEALTH_DAYS = 90;

function inventoryHealth(db, t, stagnantDays) {
  const from = addDays(t, -(HEALTH_DAYS - 1));
  const cogs = salesTotals(db, from, t).cogs;
  const valueNow = db.value('SELECT COALESCE(SUM(stock * cost), 0) FROM products WHERE stock > 0');
  // Existencia al empezar la ventana: la de hoy menos todo lo que entró y salió desde entonces.
  // Se valora al costo de hoy (el sistema no guarda el costo de cada día).
  const valueStart = db.value(
    `SELECT COALESCE(SUM(MAX(p.stock - COALESCE(m.q, 0), 0) * p.cost), 0) FROM products p
       LEFT JOIN (SELECT product_id, SUM(qty) AS q FROM inventory_movements WHERE created_at >= ? GROUP BY product_id) m ON m.product_id = p.id`,
    [`${from} 00:00:00`]
  );
  const avg = (valueStart + valueNow) / 2;
  const dailyCogs = cogs / HEALTH_DAYS;

  // Estancados: tienen existencia, no se venden hace stagnantDays días y llevan al menos ese tiempo en
  // la tienda (una gorra que llegó ayer no está estancada).
  const since = addDays(t, -stagnantDays);
  const stagnant = db.all(
    `SELECT p.id, p.name, p.color, p.size, p.sku, p.brand, p.category, p.stock, p.cost, p.price_retail, p.stock * p.cost AS value,
            ls.last_sale, fi.first_in
       FROM products p
       LEFT JOIN (SELECT si.product_id, MAX(s.date) AS last_sale FROM sale_items si JOIN sales s ON s.id = si.sale_id
                   WHERE s.status <> 'anulada' GROUP BY si.product_id) ls ON ls.product_id = p.id
       LEFT JOIN (SELECT product_id, MIN(date(created_at)) AS first_in FROM inventory_movements WHERE qty > 0 GROUP BY product_id) fi ON fi.product_id = p.id
      WHERE p.stock > 0 AND (ls.last_sale IS NULL OR ls.last_sale < ?) AND COALESCE(fi.first_in, date(p.created_at)) <= ?
      ORDER BY value DESC`,
    [since, since]
  ).map((p) => ({ ...p, value: round2(p.value), days_without_sale: days(p.last_sale || p.first_in || t, t) - 1 }));

  return {
    window_days: HEALTH_DAYS,
    from,
    cogs: round2(cogs),
    value_now: round2(valueNow),
    value_start: round2(valueStart),
    // Vueltas al año: cuántas veces se vende el inventario promedio en 12 meses a este ritmo.
    turnover: avg > 0 ? round2((cogs / avg) * (365 / HEALTH_DAYS)) : null,
    // Días de inventario: cuántos días dura lo que hay hoy si se sigue vendiendo igual.
    days_of_inventory: dailyCogs > 0 ? Math.round(valueNow / dailyCogs) : null,
    stagnant_days: stagnantDays,
    stagnant_count: stagnant.length,
    stagnant_units: stagnant.reduce((s, p) => s + p.stock, 0),
    stagnant_value: round2(stagnant.reduce((s, p) => s + p.value, 0)),
    stagnant: stagnant.slice(0, 200),
  };
}

// Pronóstico del mes en curso: lo vendido hasta hoy más lo que se espera vender cada día que falta,
// según lo que se vende normalmente ese día de la semana (promedio de las últimas 8 semanas). Hoy
// cuenta lo vendido o lo normal de un día así, lo que sea mayor, porque el día no ha terminado.
function monthForecast(db, t) {
  const month = periodRange({ period: 'mes', ref: t });
  const actual = dailySales(db, month.from, t);
  const sum = (map, key = 'sales') => Object.values(map).reduce((s, x) => s + x[key], 0);
  const soFar = sum(actual);
  const todaySales = actual[t] ? actual[t].sales : 0;

  const firstSale = db.value("SELECT MIN(date) FROM sales WHERE status <> 'anulada' AND opening = 0");
  const hFrom = [addDays(t, -56), firstSale || t].sort()[1];
  const hTo = addDays(t, -1);
  const history = hFrom <= hTo ? dailySales(db, hFrom, hTo) : {};
  const historyDays = hFrom <= hTo ? days(hFrom, hTo) : 0;
  const byDay = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (let d = hFrom; d <= hTo; d = addDays(d, 1)) {
    byDay[weekday(d)].total += history[d] ? history[d].sales : 0;
    byDay[weekday(d)].n++;
  }
  // Con menos de 2 semanas de historia no hay un "martes normal": se usa el promedio diario del mes.
  const elapsedBefore = days(month.from, t) - 1;
  const method = historyDays >= 14 ? 'dia_semana' : 'promedio';
  const flat = elapsedBefore > 0 ? (soFar - todaySales) / elapsedBefore : todaySales;
  const expected = (d) => (method === 'dia_semana' ? (byDay[weekday(d)].n ? byDay[weekday(d)].total / byDay[weekday(d)].n : 0) : flat);

  let rest = 0;
  for (let d = addDays(t, 1); d <= month.to; d = addDays(d, 1)) rest += expected(d);
  const todayEstimate = Math.max(todaySales, expected(t));
  const forecast = soFar - todaySales + todayEstimate + rest;

  // Margen del mes; si todavía no hay ventas, el de las últimas 8 semanas.
  const cost = sum(actual, 'cost');
  const hSales = sum(history);
  const margin = soFar > 0 ? (soFar - cost) / soFar : hSales > 0 ? (hSales - sum(history, 'cost')) / hSales : 0;

  const prevMonth = periodRange({ period: 'mes', ref: monthBefore(month.from) });
  const lastYear = periodRange({ period: 'mes', ref: yearBefore(month.from) });
  const prevTotal = salesTotals(db, prevMonth.from, prevMonth.to).net;
  const lastYearTotal = salesTotals(db, lastYear.from, lastYear.to).net;
  return {
    month,
    method,
    history_days: historyDays,
    days_elapsed: days(month.from, t),
    days_left: days(t, month.to) - 1,
    sales_so_far: round2(soFar),
    forecast: round2(forecast),
    forecast_profit: round2(forecast * margin),
    margin: round2(margin * 100),
    previous_month: { ...prevMonth, sales: prevTotal, change: change(forecast, prevTotal) },
    last_year: { ...lastYear, sales: lastYearTotal, change: change(forecast, lastYearTotal) },
  };
}

function executive(ctx, params = {}) {
  const db = ctx.db;
  const t = today();
  const period = params.period || 'mes';
  const { from, to } = periodRange({ ...params, period });
  const stagnantDays = int(params.stagnant_days ?? 60, 'Días sin venta', { min: 7 });
  const cmp = comparisons(period, from, to, t);
  const current = kpis(db, cmp.current.from, cmp.current.to);
  const prev = kpis(db, cmp.prev.from, cmp.prev.to);
  const yoy = cmp.yoy ? kpis(db, cmp.yoy.from, cmp.yoy.to) : null;
  const limit = Math.min(Number(params.limit) || 500, 2000);
  return {
    period, from, to,
    compared_to: cmp.current.to,
    current,
    prev: { from: cmp.prev.from, to: cmp.prev.to, label: cmp.prev.label, ...compare(current, prev) },
    yoy: yoy ? { from: cmp.yoy.from, to: cmp.yoy.to, label: cmp.yoy.label, ...compare(current, yoy) } : null,
    series: series(db, cmp, period),
    forecast: monthForecast(db, t),
    inventory: inventoryHealth(db, t, stagnantDays),
    by_product: breakdown(db, 'producto', cmp.current.from, cmp.current.to, limit),
    by_brand: breakdown(db, 'marca', cmp.current.from, cmp.current.to),
    by_category: breakdown(db, 'categoria', cmp.current.from, cmp.current.to),
    by_seller: breakdown(db, 'vendedor', cmp.current.from, cmp.current.to),
  };
}

module.exports = { executive, comparisons, kpis, monthForecast, inventoryHealth, breakdown, yearBefore, monthBefore };
