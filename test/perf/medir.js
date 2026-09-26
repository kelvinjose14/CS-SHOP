'use strict';
// Mide cada consulta que usan las pantallas sobre una base de 3 años (RNF-08: menos de 1 s).
// Uso: npm run test:perf   (genera la base la primera vez; se reutiliza después)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../src/core/db');
const { createApi } = require('../../src/core/api');
const { periodRange, today, addDays } = require('../../src/core/util');
const { generate, DEFAULT_FILE } = require('./generar');

const LIMIT_MS = Number(process.env.CAPSSHOP_PERF_LIMIT || 1000);
const RUNS = 3;

async function main() {
  const source = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(source)) {
    console.log('Generando la base de 3 años (una sola vez, tarda alrededor de un minuto)…');
    await generate(source);
  }
  // Se mide sobre una copia: las escrituras de la prueba no cambian la base guardada.
  const file = path.join(os.tmpdir(), `capsshop-medicion-${process.pid}.db`);
  fs.copyFileSync(source, file);
  const db = await openDatabase(file);
  const api = createApi(db);
  const enter = (username, password) => {
    const r = api.login({ username, password });
    if (r.user.must_change) api.call(r.token, 'auth.changePassword', { current: password, password });
    return r.token;
  };
  const admin = enter('admin', 'admin123');
  const seller = enter('vendedor', 'vendedor123');
  const as = (token) => (name, params) => api.call(token, name, params);
  const A = as(admin);
  const V = as(seller);

  const year = periodRange({ period: 'anio' });
  const month = periodRange({ period: 'mes' });
  const all = { period: 'rango', from: addDays(today(), -3 * 366), to: today() };
  const sale = A('sales.list', {})[0];
  const customer = db.get("SELECT customer_id AS id FROM sales WHERE customer_id IS NOT NULL GROUP BY customer_id ORDER BY COUNT(*) DESC LIMIT 1").id;
  const product = db.get('SELECT product_id AS id FROM sale_items GROUP BY product_id ORDER BY COUNT(*) DESC LIMIT 1').id;
  const session = db.value('SELECT MAX(id) FROM cash_sessions');
  A('cash.open', { amount: 1000, reason: 'Medición' });

  const cases = [
    ['Inicio (administrador)', () => A('reports.dashboard')],
    ['Inicio (vendedor)', () => V('reports.dashboard')],
    ['Inventario', () => A('products.list', {})],
    ['Inventario: resumen', () => A('products.summary')],
    ['Producto: movimientos', () => A('products.movements', { product_id: product })],
    ['Movimientos de inventario (mes)', () => A('products.movements', { from: month.from, to: month.to })],
    ['Ventas (mes)', () => A('sales.list', { from: month.from, to: month.to })],
    ['Ventas (año)', () => A('sales.list', { from: year.from, to: year.to })],
    ['Ventas (todas)', () => A('sales.list', {})],
    ['Detalle de venta', () => A('sales.get', { id: sale.id })],
    ['Clientes', () => A('customers.list', {})],
    ['Cliente con más compras', () => A('customers.get', { id: customer })],
    ['Cuentas por cobrar', () => A('receivables.list', {})],
    ['Depósitos al banco (todos)', () => A('deposits.list', {})],
    ['Depósitos por verificar', () => A('deposits.list', { status: 'pendiente' })],
    ['Compras (año)', () => A('purchases.list', { from: year.from, to: year.to })],
    ['Proveedores', () => A('suppliers.list', {})],
    ['Cuentas por pagar', () => A('payables.list', {})],
    ['Gastos (año)', () => A('expenses.list', { from: year.from, to: year.to })],
    ['Caja', () => A('cash.status')],
    ['Historial de cierres', () => A('cash.history', {})],
    ['Detalle de un cierre', () => A('cash.session', { id: session })],
    ['Contabilidad (mes)', () => A('reports.profit', { period: 'mes' })],
    ['Contabilidad (año)', () => A('reports.profit', { period: 'anio' })],
    ['Contabilidad (3 años)', () => A('reports.profit', all)],
    ['Flujo de dinero (año)', () => A('reports.cashflow', { period: 'anio' })],
    ['Flujo de dinero (3 años)', () => A('reports.cashflow', all)],
    ['Más vendidos (3 años)', () => A('reports.topProducts', all)],
    ['Historial de movimientos (semana)', () => A('reports.audit', periodRange({ period: 'semana' }))],
    ['Historial de movimientos (3 años)', () => A('reports.audit', { from: all.from, to: all.to })],
    ['Registrar una venta', () => A('sales.create', { payment_type: 'contado', items: [{ product_id: product, qty: 1 }], payments: [{ method: 'tarjeta', amount: A('products.get', { id: product }).price_retail }] })],
  ];

  const rows = [];
  for (const [label, fn] of cases) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = process.hrtime.bigint();
      fn();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rows.push({ label, ms: Math.max(...times) });
  }
  db.close();
  for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });

  const counts = `${sale.id} ventas`;
  console.log(`\nRendimiento con ${counts} (peor de ${RUNS} intentos, límite ${LIMIT_MS} ms)\n`);
  console.log('| Pantalla u operación | ms |\n|---|---:|');
  for (const r of rows) console.log(`| ${r.label} | ${r.ms.toFixed(1)}${r.ms > LIMIT_MS ? ' **LENTO**' : ''} |`);
  const slow = rows.filter((r) => r.ms > LIMIT_MS);
  if (slow.length) {
    console.error(`\n${slow.length} operaciones pasan de ${LIMIT_MS} ms: ${slow.map((r) => r.label).join(', ')}`);
    process.exit(1);
  }
  console.log(`\nTodas por debajo de ${LIMIT_MS} ms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
