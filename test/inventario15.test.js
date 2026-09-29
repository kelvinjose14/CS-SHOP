'use strict';
// Inventario avanzado (1.5): modelos con variantes, apartados (stock disponible) y conteo cíclico.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { addDays, today } = require('../src/core/util');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-15-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  const admin = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  const seller = client(api);
  seller.login({ username: 'vendedor', password: 'vendedor123' });
  const call = (n, p) => admin.call(n, p);
  call('cash.open', { amount: 0 });
  return { db, call, seller, dir };
}

test('migración 7: los productos de una base vieja quedan agrupados por nombre, marca y modelo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-15m-'));
  const file = path.join(dir, 'capsshop.db');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'v1.0.0.db'), file);
  const db = await openDatabase(file);
  createApi(db);
  const withoutModel = db.value('SELECT COUNT(*) FROM products WHERE model_id IS NULL');
  assert.equal(withoutModel, 0);
  const groups = db.value("SELECT COUNT(DISTINCT lower(trim(name)) || '|' || lower(trim(COALESCE(brand, ''))) || '|' || lower(trim(COALESCE(model, '')))) FROM products");
  assert.equal(db.value('SELECT COUNT(*) FROM product_models'), groups);
});

test('modelo con variantes: cuadrícula color × talla, SKU propio, tallas ordenadas y reagrupar al renombrar', async () => {
  const { call } = await setup();
  const r = call('products.createModel', {
    name: 'Gorra NY 59FIFTY', brand: 'New Era', model: '59FIFTY', category: 'Fitted', cost: 900, price_retail: 2200, price_wholesale: 1800, min_stock: 1,
    variants: [
      { color: 'Negro', size: '7 1/4', initial_stock: 3 }, { color: 'Negro', size: '7', initial_stock: 2 }, { color: 'Negro', size: 'Ajustable', initial_stock: 0 },
      { color: 'Azul', size: '7 1/4', initial_stock: 1 }, { color: 'Azul', size: '7 1/8', initial_stock: 4 },
    ],
  });
  assert.equal(r.ids.length, 5);
  const m = call('products.modelGet', { id: r.model_id });
  assert.deepEqual(m.colors, ['Negro', 'Azul']);
  assert.deepEqual(m.sizes, ['7', '7 1/8', '7 1/4', 'Ajustable']);
  assert.equal(m.stock, 10);
  assert.equal(new Set(m.variants.map((v) => v.sku)).size, 5, 'cada variante con su SKU');
  assert.ok(m.variants.every((v) => v.category === 'Fitted' && v.price_retail === 2200));
  assert.equal(m.variants.find((v) => v.id === m.cells['azul|7 1/8']).stock, 4);

  // Repetidas o que ya existen: se rechazan con un mensaje claro.
  assert.throws(() => call('products.createModel', { name: 'Otra', price_retail: 100, variants: [{ color: 'Rojo', size: 'M' }, { color: 'rojo', size: 'm' }] }), /rojo · m está repetida/i);
  assert.throws(() => call('products.addVariants', { model_id: r.model_id, variants: [{ color: 'Negro', size: '7' }] }), /Ya existe la variante Negro · 7/);

  // Agregar variantes copia precios y categoría del modelo.
  const add = call('products.addVariants', { model_id: r.model_id, variants: [{ color: 'Rojo', size: '7 1/4', initial_stock: 2 }] });
  assert.equal(add.model_id, r.model_id);
  const red = call('products.get', { id: add.ids[0] });
  assert.equal(red.price_retail, 2200);
  assert.equal(red.category, 'Fitted');
  assert.equal(red.variants, 6);

  // Un producto nuevo con el mismo nombre, marca y modelo (sin importar mayúsculas) cae en el mismo modelo.
  const same = call('products.save', { name: ' gorra ny 59fifty', brand: 'NEW ERA', model: '59fifty', color: 'Blanco', size: '7', price_retail: 2200 });
  assert.equal(call('products.get', { id: same }).model_id, r.model_id);

  // Editar el modelo: renombra todas y, si se pide, cambia los precios de todas.
  const newId = call('products.updateModel', { id: r.model_id, name: 'Gorra NY Yankees 59FIFTY', brand: 'New Era', model: '59FIFTY', category: 'Fitted', price_retail: 2400, price_wholesale: 1900, apply_prices: true });
  const renamed = call('products.modelGet', { id: newId });
  assert.equal(renamed.variants.length, 7);
  assert.ok(renamed.variants.every((v) => v.name === 'Gorra NY Yankees 59FIFTY' && v.price_retail === 2400));
  assert.throws(() => call('products.modelGet', { id: r.model_id === newId ? -1 : r.model_id }), /Modelo no encontrado/, 'el modelo viejo, vacío, se borra');

  // Renombrar una sola variante la pasa a otro modelo.
  const v = renamed.variants[0];
  call('products.save', { ...v, name: 'Gorra NY edición especial' });
  assert.notEqual(call('products.get', { id: v.id }).model_id, newId);
  assert.equal(call('products.modelGet', { id: newId }).variants.length, 6);

  // Inventario agrupado por modelo.
  const models = call('products.models', {});
  const g = models.find((x) => x.id === newId);
  assert.equal(g.variants, 6);
  assert.deepEqual(g.colors.sort(), ['Azul', 'Blanco', 'Negro', 'Rojo']);
});

test('apartados: reservan unidades, la venta a otro cliente no las toca, y se venden, extienden o cancelan', async () => {
  const { call, seller, db } = await setup();
  const p = call('products.save', { name: 'Trucker', cost: 200, price_retail: 600, initial_stock: 3, min_stock: 0 });
  const ana = call('customers.save', { name: 'Ana' });
  const luis = call('customers.save', { name: 'Luis' });

  // El vendedor aparta 2 de 3 para Ana.
  const res = seller.call('reservations.create', { customer_id: ana, items: [{ product_id: p, qty: 1 }, { product_id: p, qty: 1 }] });
  let prod = call('products.get', { id: p });
  assert.deepEqual([prod.stock, prod.reserved, prod.available], [3, 2, 1]);
  assert.equal(call('products.summary').reserved_units, 2);
  const r = seller.call('reservations.get', { id: res });
  assert.equal(r.items.length, 1, 'la misma gorra dos veces se junta');
  assert.equal(r.items[0].qty, 2);
  assert.equal(r.state, 'activo');
  assert.equal(r.expires_on, addDays(today(), 15));

  // No alcanza para apartar otras 2.
  assert.throws(() => seller.call('reservations.create', { customer_id: luis, items: [{ product_id: p, qty: 2 }] }), /quedan 1 disponibles \(2 ya apartadas\)/);
  // A Luis se le vende 1, no 2.
  const pay = (qty) => [{ method: 'efectivo', amount: qty * 600 }];
  assert.throws(() => seller.call('sales.create', { customer_id: luis, items: [{ product_id: p, qty: 2 }], payments: pay(2) }), /queda 1 disponible: 2 están apartadas/);
  seller.call('sales.create', { customer_id: luis, items: [{ product_id: p, qty: 1 }], payments: pay(1) });
  prod = call('products.get', { id: p });
  assert.deepEqual([prod.stock, prod.available, prod.status], [2, 0, 'agotado'], 'lo que queda está apartado');
  assert.ok(call('reports.dashboard').out_of_stock.some((x) => x.id === p));

  // La venta del apartado: a nombre de Ana y libera la reserva.
  assert.throws(() => seller.call('sales.create', { reservation_id: res, customer_id: luis, items: [{ product_id: p, qty: 2 }], payments: pay(2) }), /a nombre del cliente que apartó/);
  const sale = seller.call('sales.create', { reservation_id: res, items: [{ product_id: p, qty: 2 }], payments: pay(2) });
  assert.equal(call('sales.get', { id: sale }).customer_id, ana);
  assert.equal(call('sales.get', { id: sale }).reservation_id, res);
  const sold = call('reservations.get', { id: res });
  assert.deepEqual([sold.status, sold.sale_id], ['vendido', sale]);
  assert.equal(call('products.get', { id: p }).stock, 0);
  assert.throws(() => call('reservations.cancel', { id: res, reason: 'x' }), /ya está vendido/);

  // Vencido: deja de reservar; extenderlo revisa que siga habiendo.
  call('products.adjust', { product_id: p, type: 'entrada', qty: 2, note: 'Llegaron' });
  const res2 = call('reservations.create', { customer_id: luis, items: [{ product_id: p, qty: 2 }], expires_on: addDays(today(), 3) });
  db.run('UPDATE reservations SET expires_on = ? WHERE id = ?', [addDays(today(), -1), res2]);
  assert.equal(call('products.get', { id: p }).available, 2);
  assert.equal(call('reservations.list', { status: 'vencido' })[0].id, res2);
  assert.equal(call('reports.dashboard').reservations_expired, 1);
  call('sales.create', { items: [{ product_id: p, qty: 1 }], payments: pay(1) });
  assert.throws(() => call('reservations.extend', { id: res2, expires_on: addDays(today(), 5) }), /quedan 1 disponibles/);
  assert.throws(() => call('reservations.cancel', { id: res2, reason: '' }), /Motivo es obligatorio/);
  call('reservations.cancel', { id: res2, reason: 'No vino' });
  assert.equal(call('reservations.get', { id: res2 }).status, 'cancelado');
  assert.ok(call('reports.audit', {}).some((a) => a.action === 'cancelar_apartado'));
});

test('conteo cíclico: lo que más se vende se cuenta cada semana; contar lo saca de la lista', async () => {
  const { call, db } = await setup();
  const best = call('products.save', { name: 'La que más se vende', cost: 100, price_retail: 1000, initial_stock: 50 });
  const mid = call('products.save', { name: 'Intermedia', cost: 100, price_retail: 150, initial_stock: 50 });
  const slow = call('products.save', { name: 'No se vende', cost: 100, price_retail: 300, initial_stock: 5 });
  const empty = call('products.save', { name: 'Sin existencia', cost: 100, price_retail: 300 });
  call('sales.create', { items: [{ product_id: best, qty: 10 }], payments: [{ method: 'efectivo', amount: 10000 }] });
  call('sales.create', { items: [{ product_id: mid, qty: 10 }], payments: [{ method: 'efectivo', amount: 1500 }] });

  let c = call('products.cycleCount', {});
  const cls = Object.fromEntries(c.rows.map((r) => [r.id, r.class]));
  assert.equal(cls[best], 'A');
  assert.equal(cls[mid], 'B');
  assert.equal(cls[slow], 'C');
  assert.equal(cls[empty], undefined, 'sin ventas ni existencia no se cuenta');
  assert.equal(c.rows[0].id, best, 'primero lo que más se vende');

  // Contadas (aunque coincidan) salen de la lista.
  call('products.count', { counts: [{ product_id: best, counted: 40 }, { product_id: slow, counted: 5 }], note: 'Cíclico' });
  c = call('products.cycleCount', {});
  assert.deepEqual(c.rows.map((r) => r.id), [mid]);

  // A los 10 días, la A vuelve a tocar (cada 7) y la C todavía no (cada 90).
  const tenDaysAgo = `${addDays(today(), -10)} 10:00:00`;
  db.run('UPDATE products SET last_counted_at = ? WHERE id IN (?, ?)', [tenDaysAgo, best, slow]);
  c = call('products.cycleCount', {});
  assert.deepEqual(c.rows.map((r) => r.id).sort(), [best, mid].sort());
  assert.equal(c.rows.find((r) => r.id === best).overdue_days, 3);
  assert.equal(call('products.cycleCount', { limit: 1 }).rows.length, 1);
});
