'use strict';
// Varias computadoras sobre la misma base: sesiones separadas y una caja por PC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-pc-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  const caja2 = api.pair('Caja 2');
  const A = client(api); // PC principal
  const B = client(api, caja2.id);
  A.login({ username: 'admin', password: 'admin123' });
  B.login({ username: 'vendedor', password: 'vendedor123' });
  const productId = A.call('products.save', { name: 'Gorra NY', cost: 500, price_retail: 1200, price_wholesale: 900 });
  const supplierId = A.call('suppliers.save', { name: 'Distribuidora' });
  A.call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 10, unit_cost: 500 }] });
  const sell = (pc) => pc.call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 1 }], payments: [{ method: 'efectivo', amount: 1200 }] });
  return { db, api, caja2, A, B, productId, sell };
}

test('cada computadora tiene su caja y el efectivo entra en la caja de la PC que cobra', async () => {
  const { caja2, A, B, sell } = await setup();
  A.call('cash.open', { amount: 1000 });
  B.call('cash.open', { amount: 500 });
  assert.throws(() => A.call('cash.open', { amount: 0 }), /Ya hay una caja abierta en esta computadora/);

  sell(B);
  sell(A);
  sell(A);
  assert.equal(B.call('cash.status').open.expected, 1700);
  assert.equal(A.call('cash.status').open.expected, 3400);
  assert.equal(B.call('cash.status').terminal.name, 'Caja 2');
  assert.equal(B.call('cash.status').others, undefined, 'el vendedor no ve las otras cajas');
  const others = A.call('cash.status').others;
  assert.equal(others.length, 1);
  assert.equal(others[0].terminal_name, 'Caja 2');
  assert.equal(others[0].expected, 1700);
  assert.equal(A.call('reports.dashboard').cash, 3400 + 1700, 'el dashboard suma todas las cajas');

  // Cerrar la caja de la Caja 2 no toca la de la principal.
  const closed = B.call('cash.close', { counted: 1700 });
  assert.equal(closed.difference, 0);
  assert.equal(A.call('cash.status').open.expected, 3400);
  assert.throws(() => sell(B), /caja está cerrada/);
  assert.equal(A.call('reports.dashboard').cash, 3400 + 1700, 'una caja cerrada cuenta con lo contado');

  const hist = A.call('cash.history');
  assert.deepEqual(hist.map((h) => h.terminal_name).sort(), ['Caja 2', 'Principal']);
  const saleByB = A.call('reports.audit', { action: 'registrar_venta' }).find((a) => a.terminal_name === 'Caja 2');
  assert.ok(saleByB, 'el historial guarda desde qué PC se hizo la venta');
  const list = A.call('terminals.list');
  assert.deepEqual(list.map((t) => [t.name, t.principal, t.cash_open]), [['Principal', true, true], ['Caja 2', false, false]]);
  void caja2;
});

test('las sesiones de cada computadora son independientes', async () => {
  const { api, A, B } = await setup();
  A.logout();
  assert.throws(() => A.call('products.list'), /iniciar sesión/);
  assert.ok(B.call('products.list').length, 'la otra PC sigue trabajando');
  assert.throws(() => api.call('token-falso', 'products.list'), /sesión terminó/);
  api.closeAll();
  assert.throws(() => B.call('products.list'), /sesión terminó/);
});

test('el administrador puede renombrar y desactivar una computadora', async () => {
  const { api, caja2, A, B } = await setup();
  assert.throws(() => api.pair('principal'), /nombre es el de la PC principal/);
  assert.equal(api.pair('caja 2').id, caja2.id, 'volver a conectar con el mismo nombre reutiliza la PC');
  assert.throws(() => B.call('terminals.list'), /permiso/);

  B.call('cash.open', { amount: 0 });
  assert.throws(() => A.call('terminals.save', { id: caja2.id, active: false }), /Cierre la caja/);
  B.call('cash.close', { counted: 0 });
  A.call('terminals.save', { id: caja2.id, active: false });
  assert.throws(() => B.call('products.list'), /desactivada por el administrador/);
  assert.throws(() => B.login({ username: 'vendedor', password: 'vendedor123' }), /desactivada/);
  assert.throws(() => A.call('terminals.save', { id: 1, active: false }), /no se puede desactivar/);

  A.call('terminals.save', { id: caja2.id, name: 'Mostrador', active: true });
  B.login({ username: 'vendedor', password: 'vendedor123' });
  assert.equal(B.call('cash.status').terminal.name, 'Mostrador');
  assert.throws(() => A.call('terminals.save', { id: caja2.id, name: 'Principal' }), /Ya existe/);
});
