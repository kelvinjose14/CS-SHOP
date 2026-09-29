'use strict';
// Productos con catálogos (1.7, DT-45): marcas, categorías, colores y tallas en tablas propias, variantes
// sin repetir, y la migración de las bases que tenían todo escrito como texto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, Database } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { migrate, MIGRATIONS, CATALOG_SEEDS, QUICK_OPTIONS } = require('../src/core/schema');
const { client } = require('./helpers');

const tmp = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-17-')), name);

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

test('migración 9: los textos de siempre pasan al catálogo, sin repetir y con el nombre bien escrito', async () => {
  const file = tmp('v1.db');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'v1.0.0.db'), file);
  const db = await openDatabase(file);
  createApi(db);
  assert.equal(db.value('SELECT COUNT(*) FROM products WHERE brand IS NOT NULL AND brand_id IS NULL'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM products WHERE color IS NOT NULL AND color_id IS NULL'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM products WHERE size IS NOT NULL AND size_id IS NULL'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.brand <> b.name'), 0, 'el texto es el del catálogo');
  for (const b of CATALOG_SEEDS.brands) assert.ok(db.get('SELECT id FROM brands WHERE name = ?', [b]), b);
  assert.equal(db.get("SELECT hex FROM colors WHERE name = 'Negro'").hex, '#000000');
  assert.ok(db.value("SELECT sort FROM sizes WHERE name = '7 1/8'") < db.value("SELECT sort FROM sizes WHERE name = '7 1/4'"));
  assert.ok(db.value("SELECT COUNT(*) FROM sqlite_master WHERE name = 'ux_products_variant'"));
});

test('migración 9: dos productos iguales de una base vieja no se pierden y se pueden seguir editando', async () => {
  const db = new Database(tmp('v8.db'));
  db.tx(() => migrate(db, MIGRATIONS.slice(0, 8)));
  const t = '2026-01-01 10:00:00';
  const add = (sku, color) => db.insert('products', { name: 'Gorra NY', brand: 'new era', color, size: '7 1/4', sku, cost: 100, price_retail: 900, stock: 2, created_at: t, updated_at: t });
  const a = add('A-1', 'negro');
  const b = add('A-2', 'Negro');
  const c = add('A-3', 'Rojo');
  const key = 'gorra ny|new era|';
  const model = db.insert('product_models', { key, name: 'Gorra NY', brand: 'new era', created_at: t });
  db.run('UPDATE products SET model_id = ?', [model]);
  db.tx(() => migrate(db));
  const rows = db.all('SELECT id, model_id, brand, color FROM products ORDER BY id');
  assert.deepEqual(rows.map((r) => [r.brand, r.color]), [['New Era', 'Negro'], ['New Era', 'Negro'], ['New Era', 'Rojo']], 'el catálogo trae "New Era" y "Negro" bien escritos');
  assert.equal(rows[0].model_id, rows[2].model_id);
  assert.notEqual(rows[1].model_id, rows[0].model_id, 'el repetido queda en su propio modelo');
  const api = createApi(db);
  const admin = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  const p = admin.call('products.get', { id: b });
  admin.call('products.save', { ...p, price_retail: 950 });
  assert.equal(admin.call('products.get', { id: b }).price_retail, 950);
  assert.equal(admin.call('products.get', { id: b }).model_id, rows[1].model_id, 'editarlo no lo junta con el otro');
  void a; void c;
});

test('catálogos: crear sin repetir, colores con código, renombrar renombra los productos, desactivar', async () => {
  const { call, seller } = await setup();
  const c = call('catalog.list', {});
  assert.deepEqual(c.sizes.slice(0, 5).map((s) => s.name), ['6 1/2', '6 5/8', '6 3/4', '6 7/8', '7']);
  assert.equal(c.sizes.at(-1).name, 'One Size');
  assert.ok(c.categories.some((x) => x.name === 'Dad Hat'));
  const nuevo = call('catalog.create', { type: 'brands', name: '  Pink  Dolphin ' });
  assert.equal(nuevo.name, 'Pink Dolphin');
  assert.equal(nuevo.existed, false);
  assert.equal(call('catalog.create', { type: 'brands', name: 'pink dolphin' }).id, nuevo.id, 'no se repite con otras mayúsculas');
  assert.equal(call('catalog.create', { type: 'colors', name: 'Verde oliva', hex: '6b8e23' }).hex, '#6B8E23');
  assert.throws(() => call('catalog.create', { type: 'colors', name: 'Raro', hex: 'verde' }), /Código de color inválido/);
  assert.throws(() => seller.call('catalog.create', { type: 'brands', name: 'Otra más' }), /permiso/i);

  const id = call('products.save', { name: 'Gorra PD', brand_id: nuevo.id, price_retail: 1000 });
  call('catalog.update', { type: 'brands', id: nuevo.id, name: 'Pink Dolphin Co.' });
  assert.equal(call('products.get', { id }).brand, 'Pink Dolphin Co.');
  assert.throws(() => call('catalog.update', { type: 'brands', id: nuevo.id, name: 'new era' }), /Ya existe "New Era"/);
  call('catalog.update', { type: 'brands', id: nuevo.id, active: false });
  assert.ok(!call('catalog.list', {}).brands.some((b) => b.id === nuevo.id), 'desactivada no aparece para elegir');
  assert.equal(call('products.get', { id }).brand_id, nuevo.id, 'el producto no cambia');
  assert.equal(call('catalog.list', { includeInactive: true }).brands.find((b) => b.id === nuevo.id).products, 1);
});

test('producto con colores y tallas del catálogo: una variante por combinación, sin repetir, stock por variante', async () => {
  const { call, seller } = await setup();
  const c = call('catalog.list', {});
  const id = (list, name) => c[list].find((x) => x.name === name).id;
  const [negro, rojo] = [id('colors', 'Negro'), id('colors', 'Rojo')];
  const [t7, t718] = [id('sizes', '7'), id('sizes', '7 1/8')];
  const r = call('products.createModel', {
    name: 'New Era Yankees 59FIFTY', brand_id: id('brands', 'New Era'), model: '59FIFTY', category_id: id('categories', 'Fitted'), cost: 900, price_retail: 2200,
    variants: [{ color_id: negro, size_id: t7, initial_stock: 2 }, { color_id: negro, size_id: t718, initial_stock: 4 }, { color_id: rojo, size_id: t7, initial_stock: 1 }],
  });
  const m = call('products.modelGet', { id: r.model_id });
  assert.equal(m.stock, 7, 'el total es la suma de las variantes');
  assert.equal(m.brand, 'New Era');
  assert.deepEqual(m.sizes, ['7', '7 1/8']);
  assert.equal(m.palette.Negro, '#000000');
  const v = m.variants.find((x) => x.color === 'Negro' && x.size === '7 1/8');
  assert.equal(v.stock, 4);
  assert.equal(v.category, 'Fitted');

  // La misma combinación no se puede repetir: al crear, al agregar ni al editar una variante.
  assert.throws(() => call('products.createModel', { name: 'x', price_retail: 1, variants: [{ color_id: negro, size_id: t7 }, { color_id: negro, size_id: t7 }] }), /Negro · 7 está repetida/);
  assert.throws(() => call('products.addVariants', { model_id: r.model_id, variants: [{ color_id: negro, size_id: t718 }] }), /Ya existe la variante Negro · 7 1\/8/);
  const rojo7 = m.variants.find((x) => x.color === 'Rojo');
  assert.throws(() => call('products.save', { ...rojo7, color_id: negro }), /Ya existe la variante Negro · 7 de "New Era Yankees 59FIFTY"/);
  const add = call('products.addVariants', { model_id: r.model_id, variants: [{ color_id: rojo, size_id: t718, initial_stock: 3 }] });
  assert.equal(call('products.get', { id: add.ids[0] }).brand, 'New Era', 'la nueva copia marca, categoría y precios');

  // La venta descuenta solo esa variante.
  seller.call('sales.create', { items: [{ product_id: v.id, qty: 1 }], payments: [{ method: 'efectivo', amount: 2200 }] });
  const after = call('products.modelGet', { id: r.model_id });
  assert.equal(after.variants.find((x) => x.id === v.id).stock, 3);
  assert.equal(after.variants.find((x) => x.color === 'Negro' && x.size === '7').stock, 2, 'las otras tallas no cambian');
  assert.equal(after.stock, 9);

  // Quitar un color desactiva sus variantes; volver a ponerlo las activa.
  const rojos = after.variants.filter((x) => x.color === 'Rojo').map((x) => x.id);
  call('products.setActive', { ids: rojos, active: false });
  assert.ok(!call('products.list', { search: 'Yankees' }).some((x) => x.color === 'Rojo'));
  call('products.setActive', { ids: rojos, active: true });

  // Una gorra ajustable, sin tallas numéricas.
  const aj = call('products.createModel', { name: 'Trucker Otto', category_id: id('categories', 'Trucker'), price_retail: 600, variants: [{ color_id: negro, size_id: id('sizes', 'Ajustable'), initial_stock: 5 }] });
  assert.equal(call('products.get', { id: aj.ids[0] }).size, 'Ajustable');
  // Y una sin color ni talla.
  const solo = call('products.save', { name: 'Visera lisa', price_retail: 300, initial_stock: 2 });
  assert.equal(call('products.get', { id: solo }).color_id, null);

  // Editar el modelo cambia marca y categoría de todas sus variantes.
  call('products.updateModel', { id: r.model_id, name: 'New Era Yankees 59FIFTY', model: '59FIFTY', brand_id: id('brands', 'Nike'), category_id: id('categories', 'Snapback') });
  assert.ok(call('products.list', { search: 'Yankees' }).every((x) => x.brand === 'Nike' && x.category === 'Snapback'));
});

test('importar y las PCs con la versión anterior siguen funcionando con nombres', async () => {
  const { call } = await setup();
  const id = call('products.save', { name: 'Gorra', brand: 'NEW ERA', category: 'snapback', color: 'negro', size: '7 1/4', price_retail: 1000 });
  const p = call('products.get', { id });
  assert.deepEqual([p.brand, p.category, p.color, p.size], ['New Era', 'Snapback', 'Negro', '7 1/4']);
  const nueva = call('products.save', { name: 'Gorra 2', brand: 'Marca Rara', price_retail: 1000 });
  assert.equal(call('products.get', { id: nueva }).brand, 'Marca Rara');
  assert.ok(call('catalog.list', {}).brands.some((b) => b.name === 'Marca Rara'), 'se agrega al catálogo');
  const res = call('products.import', { rows: [{ name: 'Importada', brand: 'nike', color: 'Blanco', size: '7', price_retail: '800' }] });
  assert.equal(res.created, 1);
  assert.equal(call('products.list', { search: 'Importada' })[0].brand, 'Nike');
});

test('migración 10: pocas opciones al empezar, catálogo de modelos y lo que ya se usa se conserva', async () => {
  const db = new Database(tmp('v9.db'));
  db.tx(() => migrate(db, MIGRATIONS.slice(0, 9)));
  const t = '2026-01-01 10:00:00';
  const jordan = db.value("SELECT id FROM brands WHERE name = 'Jordan'");
  db.insert('products', { name: 'Gorra J', brand: 'Jordan', brand_id: jordan, model: '9forty', sku: 'J-1', cost: 100, price_retail: 900, stock: 1, created_at: t, updated_at: t });
  db.insert('products', { name: 'Gorra K', model: 'Low Pro', sku: 'K-1', cost: 100, price_retail: 900, stock: 1, created_at: t, updated_at: t });
  db.tx(() => migrate(db));
  const api = createApi(db);
  const admin = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  const c = admin.call('catalog.list', {});
  assert.deepEqual(c.brands.map((b) => b.name).sort(), [...QUICK_OPTIONS.brands, 'Jordan'].sort(), 'las de siempre y la que ya se usa');
  assert.deepEqual(c.categories.map((b) => b.name).sort(), [...QUICK_OPTIONS.categories].sort());
  assert.deepEqual(c.models.map((b) => b.name).sort(), [...QUICK_OPTIONS.models, 'Low Pro'].sort());
  assert.equal(db.value("SELECT model FROM products WHERE sku = 'J-1'"), '9FORTY', 'queda escrito como en el catálogo');
  assert.equal(c.models.find((m) => m.name === '9FORTY').products, 1);
  // Las desactivadas vuelven al crearlas desde el formulario.
  assert.equal(admin.call('catalog.create', { type: 'brands', name: 'puma' }).name, 'Puma');
  assert.ok(admin.call('catalog.list', {}).brands.some((b) => b.name === 'Puma'));
});

test('modelos y marcas nuevos: se guardan, no se repiten y renombrarlos no parte el producto', async () => {
  const { call } = await setup();
  const low = call('catalog.create', { type: 'models', name: '  low   profile ' });
  assert.equal(low.name, 'low profile');
  assert.equal(call('catalog.create', { type: 'models', name: 'LOW PROFILE' }).id, low.id, 'sin repetir por mayúsculas ni espacios');
  assert.equal(call('catalog.create', { type: 'models', name: '59fifty' }).name, '59FIFTY');
  const brand = call('catalog.create', { type: 'brands', name: 'Pink Dolphin' });
  const r = call('products.createModel', { name: 'Gorra PD', brand_id: brand.id, model: 'Low Profile', price_retail: 1000, variants: [{ size_id: null, initial_stock: 1 }] });
  assert.equal(call('products.get', { id: r.ids[0] }).model, 'low profile', 'con el nombre del catálogo');
  call('products.createModel', { name: 'Gorra X', model: 'Modelo Nuevo', price_retail: 10, variants: [{ initial_stock: 0 }] });
  assert.ok(call('catalog.list', {}).models.some((m) => m.name === 'Modelo Nuevo'), 'un modelo escrito se agrega al catálogo');

  call('catalog.update', { type: 'models', id: low.id, name: 'Low Profile' });
  call('catalog.update', { type: 'brands', id: brand.id, name: 'Pink Dolphin Co.' });
  const p = call('products.get', { id: r.ids[0] });
  assert.deepEqual([p.brand, p.model], ['Pink Dolphin Co.', 'Low Profile']);
  call('products.save', { ...p, price_retail: 1200 });
  assert.equal(call('products.get', { id: r.ids[0] }).model_id, r.model_id, 'sigue en el mismo modelo');
  assert.equal(call('products.modelGet', { id: r.model_id }).model, 'Low Profile');
});

test('precios y costo: positivos y con 2 decimales como máximo', async () => {
  const { call } = await setup();
  assert.equal(call('products.get', { id: call('products.save', { name: 'A', cost: '1500', price_retail: 1500.5 }) }).price_retail, 1500.5);
  assert.throws(() => call('products.save', { name: 'B', price_retail: '1500.00000001' }), /máximo 2 decimales/);
  assert.throws(() => call('products.save', { name: 'B', price_retail: 1500, cost: 10.123 }), /Costo: use como máximo 2 decimales/);
  assert.throws(() => call('products.save', { name: 'B', price_retail: 1500, price_wholesale: -1 }), /mayor o igual a cero/);
  // El costo promedio que salió de las compras (4 decimales) se puede volver a guardar sin cambiarlo.
  const id = call('products.save', { name: 'C', cost: 10, price_retail: 20, initial_stock: 1 });
  const sup = call('suppliers.save', { name: 'Proveedor' });
  call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: id, qty: 2, unit_cost: 11.33 }], confirm_costs: true });
  const p = call('products.get', { id });
  assert.notEqual(Math.round(p.cost * 100), p.cost * 100, 'el promedio tiene más de 2 decimales');
  call('products.save', { ...p, price_retail: 25 });
  assert.equal(call('products.get', { id }).price_retail, 25);
});
