'use strict';
// Correcciones de la auditoría de producción (26/09/2026), secciones 3 y 4.1 de docs/tecnico/auditoria.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi, METHODS } = require('../src/core/api');
const { now, today } = require('../src/core/util');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-aud-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const core = createApi(db);
  const api = client(core);
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  call('cash.open', { amount: 1000 });
  const sup = call('suppliers.save', { name: 'Proveedor' });
  return { db, core, api, call, sup };
}
const asSeller = (api) => { api.logout(); api.login({ username: 'vendedor', password: 'vendedor123' }); };

test('3.1: no se vende en RD$ 0 un producto sin precio (por mayor o al detalle)', async () => {
  const { api, call, db } = await setup();
  const p = call('products.save', { name: 'Sin precio mayor', cost: 500, price_retail: 1000, initial_stock: 5 });
  assert.throws(() => call('sales.create', { sale_type: 'mayor', items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 0 }] }),
    (e) => e.code === 'NO_PRICE' && /no tiene precio por mayor/.test(e.message));
  // Un producto viejo (1.0.0) con precio al detalle en 0.
  db.run('UPDATE products SET price_retail = 0 WHERE id = ?', [p]);
  assert.throws(() => call('sales.create', { items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 0 }] }), /no tiene precio al detalle/);
  // El administrador puede escribir el precio en la venta.
  const id = call('sales.create', { sale_type: 'mayor', items: [{ product_id: p, qty: 1, unit_price: 800 }], payments: [{ method: 'efectivo', amount: 800 }] });
  assert.equal(call('sales.get', { id }).total, 800);
  assert.throws(() => call('sales.create', { items: [{ product_id: p, qty: 1, unit_price: 0 }], payments: [] }), /no tiene precio/);
  assert.equal(call('products.get', { id: p }).stock, 4, 'solo la venta con precio bajó la existencia');
  asSeller(api);
  assert.throws(() => call('sales.create', { items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 0 }] }), /Pídale al administrador/);
});

test('3.2: las listas y reportes devuelven todas las filas, sin tope', async () => {
  const { call, db } = await setup();
  const p = call('products.save', { name: 'Gorra', cost: 10, price_retail: 20 });
  const t = today();
  const n = 5300; // más que el tope anterior de ventas (5000), movimientos (2000) y flujo/historial (3000)
  db.tx(() => {
    for (let i = 0; i < n; i++) {
      const id = db.insert('sales', { date: t, sale_type: 'detalle', payment_type: 'contado', subtotal: 20, total: 20, cost_total: 10, paid: 20, status: 'pagado', user_id: 1, created_at: now() });
      db.insert('money_movements', { date: t, direction: 'in', amount: 20, method: 'tarjeta', category: 'venta', ref_type: 'venta', ref_id: id, created_at: now() });
      db.insert('inventory_movements', { product_id: p, type: 'entrada', qty: 1, stock_before: 0, stock_after: 1, created_at: now() });
      db.insert('audit_log', { created_at: now(), action: 'registrar_venta', entity: 'venta', entity_id: id });
    }
  });
  const rows = call('sales.list', { from: t, to: t });
  assert.equal(rows.length, n);
  assert.equal(rows.reduce((s, r) => s + r.total, 0), n * 20, 'el total del reporte es el real');
  assert.equal(call('products.movements', { from: t, to: t }).length, n);
  assert.equal(call('reports.cashflow', { period: 'dia' }).movements.length, n);
  assert.ok(call('reports.audit', { from: t, to: t }).length >= n);
});

test('3.3: anular una compra devuelve el costo promedio', async () => {
  const { call, sup } = await setup();
  const buy = (product, qty, unit_cost) => call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: product, qty, unit_cost }] });
  const cost = (id) => call('products.get', { id }).cost;
  // Sin ventas en el medio: vuelve exacto.
  const a = call('products.save', { name: 'A', cost: 100, price_retail: 300, initial_stock: 10 });
  const pa = buy(a, 10, 500);
  assert.equal(cost(a), 300);
  call('purchases.void', { id: pa, reason: 'error' });
  assert.equal(cost(a), 100);
  // Con ventas en el medio: la mercancía que queda es la que ya estaba, a su costo de antes.
  const b = call('products.save', { name: 'B', cost: 100, price_retail: 300, initial_stock: 10 });
  const pb = buy(b, 10, 200);
  call('sales.create', { items: [{ product_id: b, qty: 5 }], payments: [{ method: 'efectivo', amount: 1500 }] });
  call('purchases.void', { id: pb, reason: 'error' });
  assert.equal(cost(b), 100);
  assert.equal(call('products.get', { id: b }).stock, 5);
  // Con otra compra después: se quita solo lo que aportó la anulada.
  const c = call('products.save', { name: 'C', cost: 100, price_retail: 300, initial_stock: 10 });
  const pc1 = buy(c, 10, 200); // 150
  buy(c, 10, 300); // (20 × 150 + 10 × 300) / 30 = 200
  call('purchases.void', { id: pc1, reason: 'error' });
  assert.equal(cost(c), 200); // quedan 10 a 100 y 10 a 300
  // El mismo producto dos veces en una compra.
  const d = call('products.save', { name: 'D', cost: 100, price_retail: 300, initial_stock: 10 });
  const pd = call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: d, qty: 10, unit_cost: 300 }, { product_id: d, qty: 20, unit_cost: 500 }] });
  assert.equal(cost(d), 350); // (10 × 100 + 10 × 300) / 20 = 200; (20 × 200 + 20 × 500) / 40 = 350
  call('purchases.void', { id: pd, reason: 'error' });
  assert.equal(cost(d), 100);
  assert.ok(call('reports.audit', { action: 'cambio_precio' }).some((r) => /Anulación compra/.test(r.details)));
});

test('3.4: anular un abono de cliente', async () => {
  const { api, call } = await setup();
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 1000, initial_stock: 5 });
  const cu = call('customers.save', { name: 'Ana' });
  const sale = call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] });
  call('sales.pay', { sale_id: sale, amount: 600, method: 'efectivo' });
  const pay = call('sales.get', { id: sale }).payments[0];
  assert.equal(call('cash.status').open.expected, 1600);
  assert.throws(() => call('sales.voidPayment', { payment_id: pay.id, reason: '' }), /Motivo/);
  call('sales.voidPayment', { payment_id: pay.id, reason: 'Era 60, no 600' });
  const s = call('sales.get', { id: sale });
  assert.deepEqual([s.paid, s.balance, s.status], [0, 1000, 'pendiente']);
  assert.equal(call('cash.status').open.expected, 1000, 'el efectivo sale de la caja');
  assert.ok(call('customers.get', { id: cu }).payments[0].voided);
  assert.throws(() => call('sales.voidPayment', { payment_id: pay.id, reason: 'otra vez' }), /ya está anulado/);
  // El cobro de una venta de contado no se anula aparte.
  const cash = call('sales.create', { items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  assert.throws(() => call('sales.voidPayment', { payment_id: call('sales.get', { id: cash }).payments[0].id, reason: 'x' }), /anule la venta/);
  // Si ese dinero ya se devolvió en una devolución, no se puede anular.
  const s2 = call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  const item = call('sales.get', { id: s2 }).items[0];
  call('sales.return', { sale_id: s2, items: [{ sale_item_id: item.id, qty: 1 }], refund_method: 'efectivo', reason: 'defecto' });
  assert.throws(() => call('sales.voidPayment', { payment_id: call('sales.get', { id: s2 }).payments[0].id, reason: 'x' }), /ya se le devolvió/);
  assert.equal(call('reports.audit', { action: 'anular_abono' }).length, 1);
  asSeller(api);
  assert.throws(() => call('sales.voidPayment', { payment_id: pay.id, reason: 'x' }), /permiso/);
});

test('3.4: anular un pago a proveedor', async () => {
  const { call, sup } = await setup();
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 300 });
  const pu = call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: p, qty: 10, unit_cost: 100 }] });
  call('suppliers.pay', { supplier_id: sup, amount: 400, method: 'efectivo' });
  const pay = call('purchases.get', { id: pu }).payments[0];
  assert.equal(call('cash.status').open.expected, 600);
  call('purchases.voidPayment', { payment_id: pay.id, reason: 'Pago duplicado' });
  const x = call('purchases.get', { id: pu });
  assert.deepEqual([x.paid, x.balance, x.status], [0, 1000, 'pendiente']);
  assert.equal(call('cash.status').open.expected, 1000, 'el efectivo vuelve a la caja');
  assert.equal(call('reports.dashboard').payables, 1000);
  assert.throws(() => call('purchases.voidPayment', { payment_id: pay.id, reason: 'x' }), /ya está anulado/);
  const cashBuy = call('purchases.create', { supplier_id: sup, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: p, qty: 1, unit_cost: 100 }] });
  assert.throws(() => call('purchases.voidPayment', { payment_id: call('purchases.get', { id: cashBuy }).payments[0].id, reason: 'x' }), /anule la compra/);
});

test('3.4: anular entradas, depósitos al banco y retiros de caja', async () => {
  const { core, api, call } = await setup();
  const move = (type, amount) => call('cash.movement', { type, amount, description: `${type} de prueba` });
  const e = move('entrada', 200);
  const d = move('deposito_banco', 300);
  const r = move('retiro', 100);
  let s = call('cash.status').open;
  assert.equal(s.expected, 800);
  for (const id of [e, d, r]) call('cash.voidMovement', { movement_id: id, reason: 'Registrado por error' });
  s = call('cash.status').open;
  assert.equal(s.expected, 1000, 'todo vuelve a como estaba');
  assert.deepEqual([s.bank_deposits, s.withdrawals, s.other_income, s.other_out], [0, 0, 0, 0], 'cada línea descuenta su anulación');
  assert.deepEqual(s.movements.filter((m) => m.voided).map((m) => m.id).sort(), [e, d, r].sort());
  const flow = call('reports.cashflow', { period: 'dia' });
  assert.equal(flow.bank_deposits, 0);
  assert.deepEqual([flow.total_in, flow.total_out], [200 + 100, 200 + 100], 'el depósito y su anulación no son entrada ni salida');
  assert.equal(Object.fromEntries(flow.by_method.map((m) => [m.method, m.net])).transferencia || 0, 0, 'la entrada al banco también se anuló');
  assert.throws(() => call('cash.voidMovement', { movement_id: e, reason: 'x' }), /ya está anulado/);
  // Una venta no se anula por aquí.
  const p = call('products.save', { name: 'Gorra', cost: 1, price_retail: 10, initial_stock: 1 });
  call('sales.create', { items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 10 }] });
  const saleMov = call('cash.status').open.movements.find((m) => m.category === 'venta');
  assert.throws(() => call('cash.voidMovement', { movement_id: saleMov.id, reason: 'x' }), /Solo se anulan/);
  // Con la caja cerrada, ya no.
  const r2 = move('retiro', 10);
  call('cash.close', { counted: 1000 });
  call('cash.open', { amount: 1000 });
  assert.throws(() => call('cash.voidMovement', { movement_id: r2, reason: 'x' }), /ya se cerró/);
  // La anulación va a la caja del movimiento, aunque se haga desde otra PC.
  const pc2 = core.pair('Caja 2');
  const other = client(core, pc2.id);
  other.login({ username: 'vendedor', password: 'vendedor123' });
  other.call('cash.open', { amount: 500 });
  const r3 = other.call('cash.movement', { type: 'deposito_banco', amount: 50, description: 'Banco' });
  call('cash.voidMovement', { movement_id: r3, reason: 'No se llevó' });
  assert.equal(other.call('cash.status').open.expected, 500);
  assert.equal(call('cash.status').open.expected, 1000, 'la caja de la principal no cambia');
  assert.throws(() => other.call('cash.voidMovement', { movement_id: r3, reason: 'x' }), /permiso/);
  assert.equal(call('reports.audit', { action: 'anular_movimiento_caja' }).length, 4);
  asSeller(api);
});

test('4.1: ninguna respuesta al vendedor trae costos ni ganancias', async () => {
  const { api, call, sup } = await setup();
  const p = call('products.save', { name: 'Gorra', cost: 500, price_retail: 1000, price_wholesale: 800, initial_stock: 3 });
  call('purchases.create', { supplier_id: sup, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: p, qty: 2, unit_cost: 500 }] });
  const cu = call('customers.save', { name: 'Ana' });
  const sale = call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] });
  asSeller(api);
  const calls = {
    'products.list': {}, 'products.get': { id: p }, 'products.findByCode': { code: call('products.get', { id: p }).sku }, 'products.summary': {},
    'products.movements': { product_id: p }, 'customers.list': {}, 'customers.get': { id: cu }, 'sales.list': {}, 'sales.get': { id: sale },
    'receivables.list': {}, 'cash.status': {}, 'reports.dashboard': {}, 'settings.get': {},
  };
  // Todas las operaciones de lectura del vendedor están aquí (si se agrega una, hay que sumarla).
  const reads = Object.entries(METHODS).filter(([n, [roles]]) => roles.includes('vendedor') && !/save|create|pay|open|close|movement|change|range/i.test(n)).map(([n]) => n);
  assert.deepEqual(reads.filter((n) => !(n in calls)), []);
  const leaks = [];
  const walk = (o, where) => {
    if (Array.isArray(o)) o.forEach((x) => walk(x, `${where}[]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (/cost|profit|margin|ganancia/i.test(k)) leaks.push(`${where}.${k}`); walk(v, `${where}.${k}`); }
  };
  for (const [n, params] of Object.entries(calls)) walk(call(n, params), n);
  assert.deepEqual([...new Set(leaks)], []);
});
