'use strict';
// Conteo de inventario (O6): muchos productos a la vez, un solo motivo, y protección contra
// ventas que ocurren mientras se cuenta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-o6-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = client(createApi(db));
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  call('cash.open', { amount: 0 });
  const a = call('products.save', { name: 'Gorra A', cost: 100, price_retail: 300, initial_stock: 10 });
  const b = call('products.save', { name: 'Gorra B', cost: 200, price_retail: 500, initial_stock: 5 });
  const c = call('products.save', { name: 'Gorra C', cost: 50, price_retail: 150, initial_stock: 3 });
  return { db, api, call, a, b, c };
}

test('conteo: vista previa, aplicar diferencias con un motivo y dejar el historial', async () => {
  const { call, db, a, b, c } = await setup();
  const counts = [
    { product_id: a, counted: 8, expected: 10 },
    { product_id: b, counted: 5, expected: 5 },
    { product_id: c, counted: 4, expected: 3 },
  ];
  const preview = call('products.count', { counts, dryRun: true });
  assert.deepEqual([preview.counted, preview.same, preview.adjusted, preview.errors], [3, 1, 2, 0]);
  assert.equal(preview.missing_units, 2);
  assert.equal(preview.extra_units, 1);
  assert.equal(preview.value, -150); // −2 × 100 + 1 × 50
  assert.equal(call('products.get', { id: a }).stock, 10, 'la vista previa no cambia nada');

  assert.throws(() => call('products.count', { counts }), /Motivo es obligatorio/);
  const done = call('products.count', { counts, note: 'Conteo del sábado' });
  assert.equal(done.adjusted, 2);
  assert.equal(call('products.get', { id: a }).stock, 8);
  assert.equal(call('products.get', { id: c }).stock, 4);
  const movs = call('products.movements', { type: 'conteo' });
  assert.equal(movs.length, 2);
  assert.equal(movs[0].type_label, 'Conteo de inventario');
  assert.match(movs[0].note, /Conteo del sábado/);
  const log = call('reports.audit', { action: 'conteo_inventario' });
  assert.equal(log.length, 1);
  const d = JSON.parse(log[0].details);
  assert.equal(d.con_diferencia, 2);
  assert.equal(d.unidades_faltantes, 2);
  assert.deepEqual(d.cambios, ['Gorra A: 10 → 8', 'Gorra C: 3 → 4']);
  assert.equal(db.value("SELECT COUNT(*) FROM inventory_movements WHERE product_id = ? AND type = 'conteo'", [b]), 0, 'sin diferencia, sin movimiento');
});

test('conteo: lo vendido mientras se contaba no se aplica, y los errores no detienen el resto', async () => {
  const { call, a, b, c } = await setup();
  // Se vende una gorra A después de imprimir la hoja (existencia esperada 10, ahora 9).
  call('sales.create', { items: [{ product_id: a, qty: 1 }], payments: [{ method: 'efectivo', amount: 300 }] });
  const r = call('products.count', {
    note: 'Conteo',
    counts: [
      { product_id: a, counted: 9, expected: 10 },
      { product_id: b, counted: -1, expected: 5 },
      { product_id: c, counted: 2, expected: 3 },
      { product_id: c, counted: 2, expected: 3 },
      { product_id: 999, counted: 1 },
    ],
  });
  assert.equal(r.adjusted, 1);
  assert.equal(r.errors, 4);
  assert.match(r.results[0].message, /cambió mientras se contaba \(era 10, ahora 9\)/);
  assert.match(r.results[1].message, /Cantidad contada/);
  assert.match(r.results[3].message, /dos veces/);
  assert.match(r.results[4].message, /no encontrado/);
  assert.equal(call('products.get', { id: a }).stock, 9, 'no se tocó');
  assert.equal(call('products.get', { id: c }).stock, 2);
  assert.throws(() => call('products.count', { counts: [] }), /No hay productos contados/);
});

test('conteo: solo el administrador', async () => {
  const { api, call, a } = await setup();
  api.logout();
  api.login({ username: 'vendedor', password: 'vendedor123' });
  assert.throws(() => call('products.count', { counts: [{ product_id: a, counted: 1 }], note: 'x' }), /permiso/);
});

test('la lista de aceptación del piloto tiene exactamente los requisitos de requisitos.md', () => {
  const ids = (file) => new Set((fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/^\| RN?F-[A-Z]*-?\d+/gm) || []).map((x) => x.slice(2)));
  const req = ids('docs/producto/requisitos.md');
  const acc = ids('docs/piloto/aceptacion.md');
  assert.ok(req.size > 100);
  assert.deepEqual([...acc].sort(), [...req].sort(), 'Ejecute node scripts/lista-aceptacion.js');
});

test('los ejercicios de la capacitación dan los números del documento (docs/piloto/capacitacion.md)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-cap-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = client(createApi(db));
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  const dash = () => call('reports.dashboard');
  const cash = () => call('cash.status').open.expected;
  // Preparar la práctica: la plantilla con dos gorras.
  call('products.import', { rows: [
    { name: 'Gorra práctica A', color: 'Negro', size: 'Ajustable', cost: '500', price_retail: '1000', price_wholesale: '800', initial_stock: '0' },
    { name: 'Gorra práctica B', color: 'Rojo', size: 'M', cost: '300', price_retail: '700', price_wholesale: '550', initial_stock: '5' },
  ] });
  const [A, B] = ['Gorra práctica A', 'Gorra práctica B'].map((n) => call('products.list', { search: n })[0].id);
  const stock = (id) => call('products.get', { id }).stock;
  // 1. Compra a crédito
  const sup = call('suppliers.save', { name: 'Proveedor práctica' });
  call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: A, qty: 10, unit_cost: 500 }] });
  assert.equal(stock(A), 10);
  assert.equal(dash().payables, 5000);
  // 2. Abrir caja
  call('cash.open', { amount: 1000 });
  // 3. Venta al detalle con cambio
  const s3 = call('sales.create', { items: [{ product_id: A, qty: 2 }], payments: [{ method: 'efectivo', amount: 2500 }] });
  assert.equal(call('sales.get', { id: s3 }).change_given, 500);
  assert.equal(stock(A), 8);
  assert.equal(cash(), 3000);
  // 4. Por mayor con tarjeta
  const s4 = call('sales.create', { sale_type: 'mayor', items: [{ product_id: B, qty: 3 }], payments: [{ method: 'tarjeta', amount: 1650 }] });
  assert.equal(call('sales.get', { id: s4 }).total, 1650);
  assert.equal(cash(), 3000);
  // 5. A crédito
  const cli = call('customers.save', { name: 'Cliente práctica' });
  const s5 = call('sales.create', { customer_id: cli, payment_type: 'credito', items: [{ product_id: A, qty: 1 }] });
  assert.equal(dash().receivables, 1000);
  // 6. Abono
  call('sales.pay', { customer_id: cli, amount: 400, method: 'efectivo' });
  assert.equal(call('customers.get', { id: cli }).balance, 600);
  assert.equal(cash(), 3400);
  // 7. Pago al proveedor
  call('suppliers.pay', { supplier_id: sup, amount: 2000, method: 'transferencia' });
  assert.equal(dash().payables, 3000);
  // 8. Devolución de 1 gorra de la venta 3
  const item = call('sales.get', { id: s3 }).items[0];
  call('sales.return', { sale_id: s3, items: [{ sale_item_id: item.id, qty: 1 }], refund_method: 'efectivo', reason: 'Práctica' });
  assert.equal(stock(A), 8);
  assert.equal(cash(), 2400);
  // 9. Gasto
  call('expenses.create', { category: 'Transporte', amount: 300, method: 'efectivo' });
  assert.equal(cash(), 2100);
  // 10. Depósito al banco
  call('cash.movement', { type: 'deposito_banco', amount: 1000, description: 'Práctica' });
  assert.equal(cash(), 1100);
  // 11. Aporte
  const before = call('reports.profit', { period: 'dia' }).net_profit;
  call('capital.create', { amount: 5000, method: 'transferencia' });
  assert.equal(call('reports.profit', { period: 'dia' }).net_profit, before);
  // 12. Saldo inicial de otro cliente
  const cli2 = call('customers.save', { name: 'Cliente cuaderno' });
  call('customers.opening', { customer_id: cli2, amount: 2000 });
  assert.equal(dash().receivables, 2600);
  // 13. Anular la venta a crédito
  call('sales.void', { id: s5, reason: 'Práctica' });
  assert.equal(stock(A), 9);
  assert.equal(cash(), 700);
  assert.equal(dash().receivables, 2000);
  // 14. Cerrar caja con faltante
  assert.equal(call('cash.close', { counted: 650 }).difference, -50);
  // 15. Ventas netas de hoy
  assert.equal(dash().sales_today, 2650);
  // 16. Conteo: falta 1 de B
  const r = call('products.count', { note: 'Práctica', counts: [{ product_id: A, counted: 9, expected: 9 }, { product_id: B, counted: 1, expected: 2 }] });
  assert.equal(r.missing_units, 1);
  assert.equal(stock(B), 1);
});
