'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { today } = require('../src/core/util');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  call('cash.open', { amount: 1000 });
  const supplierId = call('suppliers.save', { name: 'Distribuidora Gorras' });
  const productId = call('products.save', { name: 'Gorra NY', brand: 'New Era', color: 'Negro', size: '7 1/4', cost: 500, price_retail: 1200, price_wholesale: 900, min_stock: 3 });
  return { dir, db, api, call, supplierId, productId };
}

test('usuarios iniciales y permisos del vendedor', async () => {
  const { api, call } = await setup();
  api.logout();
  assert.throws(() => api.login({ username: 'admin', password: 'mala' }), /incorrectos/);
  api.login({ username: 'vendedor', password: 'vendedor123' });
  assert.throws(() => call('purchases.list'), /permiso/);
  assert.throws(() => call('reports.profit', { period: 'mes' }), /permiso/);
  const list = call('products.list');
  assert.equal(list[0].cost, undefined, 'el vendedor no ve costos');
  const dash = call('reports.dashboard');
  assert.equal(dash.net_profit_month, undefined);
});

test('compra a crédito aumenta inventario, calcula costo promedio y cuentas por pagar', async () => {
  const { call, supplierId, productId, db } = await setup();
  const id = call('purchases.create', { supplier_id: supplierId, payment_type: 'credito', paid: 2000, payment_method: 'transferencia', items: [{ product_id: productId, qty: 10, unit_cost: 600 }] });
  let p = call('products.get', { id: productId });
  assert.equal(p.stock, 10);
  assert.equal(p.cost, 600); // sin existencia previa, el costo es el de la compra
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'efectivo', items: [{ product_id: productId, qty: 10, unit_cost: 400 }] });
  p = call('products.get', { id: productId });
  assert.equal(p.stock, 20);
  assert.equal(p.cost, 500);
  const pur = call('purchases.get', { id });
  assert.equal(pur.balance, 4000);
  assert.equal(pur.status, 'parcial');
  call('suppliers.pay', { supplier_id: supplierId, amount: 4000, method: 'efectivo' });
  assert.equal(call('purchases.get', { id }).status, 'pagado');
  assert.equal(call('payables.list').length, 0);
  // Caja: 1000 inicial - 4000 contado - 4000 abono = negativo es posible sólo en teoría; revisamos el cálculo
  const cash = call('cash.status').open;
  assert.equal(cash.expected, 1000 - 4000 - 4000);
  assert.equal(db.value("SELECT COUNT(*) FROM inventory_movements WHERE type='compra'"), 2);
});

test('venta de contado con descuento y cambio; ganancias', async () => {
  const { call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 10, unit_cost: 500 }] });
  const saleId = call('sales.create', { sale_type: 'detalle', payment_type: 'contado', items: [{ product_id: productId, qty: 2 }], discount: 100, payments: [{ method: 'efectivo', amount: 3000 }] });
  const sale = call('sales.get', { id: saleId });
  assert.equal(sale.total, 2300);
  assert.equal(sale.change_given, 700);
  assert.equal(sale.cost_total, 1000);
  assert.equal(call('products.get', { id: productId }).stock, 8);
  assert.equal(call('cash.status').open.expected, 1000 + 2300);
  const pr = call('reports.profit', { period: 'dia' });
  assert.equal(pr.sales.net, 2300);
  assert.equal(pr.gross_profit, 1300);
  call('expenses.create', { category: 'Transporte', amount: 300, method: 'efectivo' });
  assert.equal(call('reports.profit', { period: 'dia' }).net_profit, 1000);
});

test('venta al por mayor a crédito, abonos y cuentas por cobrar', async () => {
  const { call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 20, unit_cost: 500 }] });
  const customerId = call('customers.save', { name: 'Tienda Juan' });
  assert.throws(() => call('sales.create', { payment_type: 'credito', items: [{ product_id: productId, qty: 1 }] }), /cliente/);
  const saleId = call('sales.create', { customer_id: customerId, sale_type: 'mayor', payment_type: 'credito', items: [{ product_id: productId, qty: 10 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  let s = call('sales.get', { id: saleId });
  assert.equal(s.total, 9000);
  assert.equal(s.balance, 8000);
  assert.equal(s.status, 'parcial');
  const rec = call('customers.list', { withBalance: true });
  assert.equal(rec[0].balance, 8000);
  call('sales.pay', { customer_id: customerId, amount: 8000, method: 'tarjeta' });
  s = call('sales.get', { id: saleId });
  assert.equal(s.status, 'pagado');
  assert.equal(call('receivables.list').length, 0);
  assert.throws(() => call('sales.pay', { customer_id: customerId, amount: 1, method: 'efectivo' }), /No hay balance/);
});

test('devolución parcial reingresa inventario y reembolsa', async () => {
  const { call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 5, unit_cost: 500 }] });
  const saleId = call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 3 }], discount: 300, payments: [{ method: 'efectivo', amount: 3300 }] });
  const sale = call('sales.get', { id: saleId });
  call('sales.return', { sale_id: saleId, items: [{ sale_item_id: sale.items[0].id, qty: 1 }], refund_method: 'efectivo', reason: 'Talla incorrecta' });
  const after = call('sales.get', { id: saleId });
  assert.equal(after.returned_total, 1100);
  assert.equal(call('products.get', { id: productId }).stock, 3);
  const pr = call('reports.profit', { period: 'dia' });
  assert.equal(pr.sales.net, 2200);
  assert.equal(pr.cogs, 1000);
  assert.throws(() => call('sales.return', { sale_id: saleId, items: [{ sale_item_id: sale.items[0].id, qty: 3 }], refund_method: 'efectivo', reason: 'x' }), /Sólo puede devolver 2/);
});

test('anulación de venta restaura inventario y caja', async () => {
  const { call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 5, unit_cost: 500 }] });
  const saleId = call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 2 }], payments: [{ method: 'efectivo', amount: 2400 }] });
  call('sales.void', { id: saleId, reason: 'Error' });
  assert.equal(call('products.get', { id: productId }).stock, 5);
  assert.equal(call('cash.status').open.expected, 1000);
  assert.equal(call('reports.profit', { period: 'dia' }).sales.net, 0);
});

test('no permite vender más de la existencia', async () => {
  const { call, productId } = await setup();
  assert.throws(() => call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 1 }], payments: [{ method: 'efectivo', amount: 1200 }] }), /Existencia insuficiente/);
});

test('ajustes de inventario y caja: retiro y cierre', async () => {
  const { call, productId } = await setup();
  call('products.adjust', { product_id: productId, type: 'entrada', qty: 5, note: 'Conteo' });
  call('products.adjust', { product_id: productId, type: 'ajuste', counted: 3, note: 'Conteo físico' });
  assert.equal(call('products.get', { id: productId }).stock, 3);
  const movs = call('products.movements', { product_id: productId });
  assert.equal(movs.length, 2);
  call('cash.movement', { type: 'retiro', amount: 200, description: 'Depósito banco' });
  const closed = call('cash.close', { counted: 790 });
  assert.equal(closed.expected, 800);
  assert.equal(closed.difference, -10);
  assert.throws(() => call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 1 }], payments: [{ method: 'efectivo', amount: 1200 }] }), /caja está cerrada/);
});

test('historial registra cambios de precio', async () => {
  const { call, productId } = await setup();
  const p = call('products.get', { id: productId });
  call('products.save', { ...p, price_retail: 1300 });
  const log = call('reports.audit', { action: 'cambio_precio' });
  assert.equal(log.length, 1);
  assert.match(log[0].details, /1300/);
});

test('dashboard y flujo de caja', async () => {
  const { call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'credito', items: [{ product_id: productId, qty: 4, unit_cost: 500 }] });
  call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 2 }], payments: [{ method: 'efectivo', amount: 2400 }] });
  const d = call('reports.dashboard');
  assert.equal(d.sales_today, 2400);
  assert.equal(d.payables, 2000);
  assert.equal(d.inventory.value_cost, 1000);
  assert.equal(d.low_stock.length, 1);
  assert.equal(d.top_products[0].qty, 2);
  const f = call('reports.cashflow', { period: 'rango', from: today(), to: today() });
  assert.equal(f.total_in, 2400);
  assert.equal(f.purchased, 2000);
  assert.equal(f.cash_expected, 3400);
});

test('la base de datos persiste en disco', async () => {
  const { dir, db, call, productId } = await setup();
  db.close();
  const db2 = await openDatabase(path.join(dir, 'test.db'));
  const api2 = createApi(db2);
  api2.login({ username: 'admin', password: 'admin123' });
  assert.equal(api2.call('products.get', { id: productId }).name, 'Gorra NY');
  void call;
});

test('campos numéricos vacíos del formulario de producto se toman como cero', async () => {
  const { call } = await setup();
  const id = call('products.save', { name: 'Gorra sin precio mayor', cost: '', price_retail: '1000', price_wholesale: '', min_stock: '', initial_stock: '' });
  const p = call('products.get', { id });
  assert.equal(p.price_wholesale, 0);
  assert.equal(p.stock, 0);
  assert.match(p.sku, /^CS-\d{5}$/);
});

test('el vendedor no puede pasar del descuento máximo ni cambiar precios', async () => {
  const { api, call, supplierId, productId } = await setup();
  call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 5, unit_cost: 500 }] });
  api.logout();
  api.login({ username: 'vendedor', password: 'vendedor123' });
  const sale = (extra) => call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 1, ...extra.item }], discount: extra.discount || 0, payments: [{ method: 'efectivo', amount: 1200 }] });
  assert.throws(() => sale({ discount: 500, item: {} }), /descuento máximo/);
  assert.throws(() => sale({ item: { unit_price: 100 } }), /administrador/);
  assert.ok(sale({ discount: 100, item: {} }));
});

test('anular compra descuenta el inventario y cancela la deuda', async () => {
  const { call, supplierId, productId } = await setup();
  const id = call('purchases.create', { supplier_id: supplierId, payment_type: 'credito', items: [{ product_id: productId, qty: 3, unit_cost: 500 }] });
  assert.equal(call('reports.dashboard').payables, 1500);
  call('purchases.void', { id, reason: 'Duplicada' });
  assert.equal(call('products.get', { id: productId }).stock, 0);
  assert.equal(call('reports.dashboard').payables, 0);
});
