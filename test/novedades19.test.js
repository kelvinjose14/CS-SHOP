'use strict';
// Versión 1.9 (DT-48): ventas en espera, buscador global, reposición según el ritmo de venta,
// mercancía sin movimiento y alertas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { addDays, today } = require('../src/core/util');
const { client } = require('./helpers');

const tmp = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-19-')), name);

async function setup() {
  const db = await openDatabase(tmp('test.db'));
  const api = createApi(db);
  const admin = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  const seller = client(api);
  seller.login({ username: 'vendedor', password: 'vendedor123' });
  const call = (n, p) => admin.call(n, p);
  call('cash.open', { amount: 0 });
  return { db, call, seller };
}

test('venta en espera: se guarda, se retoma con los datos de hoy y al cobrarla deja de estar en espera', async () => {
  const { db, call, seller } = await setup();
  assert.equal(db.value('PRAGMA user_version'), 11);
  const p = call('products.save', { name: 'Gorra Espera', price_retail: 1000, initial_stock: 5 });
  const cu = call('customers.save', { name: 'Juan Espera' });
  assert.throws(() => seller.call('sales.hold', { lines: [] }), /vacío/);
  const id = seller.call('sales.hold', { customer_id: cu, lines: [{ product_id: p, qty: 2, unit_price: 950 }], discount: 50, note: 'vuelve en 10 min' });
  const list = call('sales.heldList');
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].label, list[0].items, list[0].total, list[0].user_name], ['Juan Espera', 2, 1900, 'Vendedor']);
  // Retomar no la borra (si se cierra la pantalla no se pierde); trae la gorra con su existencia de hoy.
  const h = call('sales.heldGet', { id });
  assert.equal(h.lines[0].p.stock, 5);
  assert.equal(h.lines[0].unit_price, 950);
  assert.equal(h.discount, 50);
  assert.equal(seller.call('sales.heldGet', { id }).lines[0].p.cost, undefined, 'el vendedor no ve costos');
  // Volver a dejarla en espera la actualiza (no crea otra).
  call('sales.hold', { id, customer_id: cu, lines: [{ product_id: p, qty: 3, unit_price: 950 }] });
  assert.equal(call('sales.heldList').length, 1);
  assert.equal(call('sales.heldList')[0].items, 3);
  // Cobrarla la quita de la espera, en la misma operación.
  call('sales.create', { customer_id: cu, held_id: id, items: [{ product_id: p, qty: 3, unit_price: 950 }], payments: [{ method: 'efectivo', amount: 2850 }] });
  assert.equal(call('sales.heldList').length, 0);
  assert.throws(() => call('sales.heldGet', { id }), /ya no existe/);
  // Descartar otra.
  const other = call('sales.hold', { lines: [{ product_id: p, qty: 1, unit_price: 1000 }] });
  assert.match(call('sales.heldList')[0].label, /^En espera \d\d:\d\d$/);
  assert.equal(seller.call('sales.heldDelete', { id: other }), 1);
  assert.equal(call('sales.heldList').length, 0);
});

test('buscador global: producto, cliente, venta por número y proveedor (solo el administrador)', async () => {
  const { call, seller } = await setup();
  const p = call('products.save', { name: 'Gorra Buscada Yankees', price_retail: 1000, initial_stock: 3 });
  const cu = call('customers.save', { name: 'María Buscada', phone: '809-555-7777' });
  const sup = call('suppliers.save', { name: 'Proveedor Buscado' });
  const sale = call('sales.create', { customer_id: cu, items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  const r = call('search.global', { q: 'buscad' });
  assert.equal(r.products[0].id, p);
  assert.equal(r.customers[0].id, cu);
  assert.equal(r.sales[0].id, sale, 'por el nombre del cliente');
  assert.equal(r.suppliers[0].id, sup);
  assert.equal(call('search.global', { q: `V-${String(sale).padStart(6, '0')}` }).sales[0].id, sale);
  assert.equal(call('search.global', { q: '555-7777' }).customers[0].id, cu);
  const v = seller.call('search.global', { q: 'buscad' });
  assert.deepEqual(v.suppliers, [], 'el vendedor no ve proveedores');
  assert.equal(v.products[0].cost, undefined);
  assert.deepEqual(call('search.global', { q: '  ' }), { products: [], customers: [], sales: [], suppliers: [] });
});

test('reposición según el ritmo de venta y mercancía sin movimiento', async () => {
  const { db, call, seller } = await setup();
  const fast = call('products.save', { name: 'Se vende mucho', price_retail: 100, min_stock: 2, initial_stock: 20 });
  const low = call('products.save', { name: 'Bajo el mínimo', price_retail: 100, min_stock: 2, initial_stock: 1, cost: 40 });
  const ok = call('products.save', { name: 'Tranquila', price_retail: 100, min_stock: 2, initial_stock: 5 });
  call('sales.create', { items: [{ product_id: fast, qty: 10 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  const r = call('products.restock', { days: 30, cover: 30 });
  const by = (id) => r.rows.find((x) => x.id === id);
  // Vendió 10 en 30 días: para cubrir 30 días más su mínimo (2) necesita 12; hay 10 → comprar 2.
  assert.equal(by(fast).suggested, 2);
  assert.equal(by(fast).per_week, 2.33);
  assert.equal(by(fast).days_left, 30);
  assert.equal(by(low).suggested, 1, 'sin ventas, lo que falta para su mínimo');
  assert.equal(by(low).cost_total, 40);
  assert.equal(by(ok), undefined, 'lo que no hace falta no aparece');
  assert.equal(r.rows[0].id, fast, 'primero lo que se acaba antes');
  assert.throws(() => seller.call('products.restock', {}), /permiso/i);

  // Sin movimiento: con existencia, sin ventas en 60 días y en la tienda desde antes.
  const old = `${addDays(today(), -100)} 10:00:00`;
  db.run('UPDATE products SET created_at = ? WHERE id IN (?, ?)', [old, ok, fast]);
  db.run('UPDATE inventory_movements SET created_at = ? WHERE product_id IN (?, ?)', [old, ok, fast]);
  const s = call('products.stagnant', { days: 60 });
  assert.deepEqual(s.rows.map((x) => x.id), [ok], 'la que se vendió hoy no; la nueva (bajo el mínimo) tampoco');
  assert.equal(s.rows[0].days_without_sale, 100);
  assert.equal(s.units, 5);
});

test('alertas: agotados, stock bajo, crédito vencido, apartados, compras por pagar y sin movimiento', async () => {
  const { db, call, seller } = await setup();
  const p = call('products.save', { name: 'Gorra Alerta', price_retail: 1000, min_stock: 2, initial_stock: 2 });
  call('products.save', { name: 'Agotada', price_retail: 1000 });
  const cu = call('customers.save', { name: 'Debe Mucho' });
  const sale = call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] });
  db.run('UPDATE sales SET due_date = ? WHERE id = ?', [addDays(today(), -5), sale]);
  const sup = call('suppliers.save', { name: 'Proveedor' });
  const pu = call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: p, qty: 1, unit_cost: 500 }], confirm_costs: true });
  db.run('UPDATE purchases SET due_date = ? WHERE id = ?', [addDays(today(), -1), pu]);
  const keys = (list) => list.map((a) => a.key);
  const a = call('alerts.list');
  for (const k of ['agotados', 'stock_bajo', 'credito_vencido', 'clientes_deuda', 'compras_vencidas']) assert.ok(keys(a).includes(k), k);
  assert.equal(a[0].level, 'danger', 'primero lo urgente');
  assert.equal(a.find((x) => x.key === 'credito_vencido').amount, 1000);
  assert.deepEqual(a.find((x) => x.key === 'agotados').params, { status: 'agotado' });
  const v = seller.call('alerts.list');
  assert.ok(!keys(v).includes('compras_vencidas'), 'el vendedor no ve lo de proveedores');
  assert.ok(keys(v).includes('credito_vencido'));
  // La firma cambia cuando cambia la situación (la campanita la vuelve a marcar como nueva).
  const sig = a.find((x) => x.key === 'agotados').sig;
  call('products.save', { name: 'Otra agotada', price_retail: 1000 });
  assert.notEqual(call('alerts.list').find((x) => x.key === 'agotados').sig, sig);
});
