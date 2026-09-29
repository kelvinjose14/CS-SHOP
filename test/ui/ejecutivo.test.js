'use strict';
// Dashboard ejecutivo (1.4) y categoría del producto en la aplicación real.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('categoría en el producto y dashboard ejecutivo con comparaciones, pronóstico, inventario y utilidad', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });

  // Producto nuevo con categoría desde el formulario: se elige de la lista, escribiendo para filtrar.
  await go(win, 'products');
  await win.click('#p-new');
  await win.waitForSelector(`${dialog} #pe-category-input`);
  await win.fill(`${dialog} [name=name]`, 'Snapback ejecutivo');
  await win.click(`${dialog} #pe-category-input`);
  await win.fill(`${dialog} #pe-category-input`, 'snap');
  await win.press(`${dialog} #pe-category-input`, 'Enter');
  await win.fill(`${dialog} [name=cost]`, '400');
  await win.fill(`${dialog} [name=price_retail]`, '1000');
  await win.fill(`${dialog} #pe-stock [data-stock]`, '10');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  const id = await eventually(async () => (await api(win, 'products.list', { search: 'Snapback ejecutivo' }))[0]?.id);
  assert.equal((await api(win, 'products.get', { id })).category, 'Snapback');
  await api(win, 'sales.create', { payment_type: 'contado', items: [{ product_id: id, qty: 2 }], payments: [{ method: 'efectivo', amount: 2000 }] });

  // Desde el Inicio se llega al dashboard ejecutivo.
  await go(win, 'dashboard');
  await win.click('[data-go=executive]');
  await win.waitForSelector('#ex-forecast');
  assert.equal(await win.$$eval('.kpis .kpi', (x) => x.length), 8);
  assert.match(await text(win, '[data-kpi=sales]'), /Ventas netas/);
  assert.match(await text(win, '[data-kpi=sales]'), /vs el mes anterior/);
  assert.match(await text(win, '[data-kpi=margin]'), /pts vs|Sin datos/);
  assert.match(await text(win, '#ex-forecast'), /Pronóstico de cierre de/);
  assert.match(await text(win, '#ex-inventory'), /Rotación del inventario/);

  // Utilidad por categoría: la venta de hoy aparece en Snapback con su utilidad.
  await win.click('#ex-tabs [data-t=by_category]');
  const row = await text(win, '#ex-table tr:has-text("Snapback")');
  assert.match(row, /RD\$\s2,000\.00/);
  assert.match(row, /RD\$\s1,200\.00/);
  await win.click('#ex-tabs [data-t=by_seller]');
  assert.match(await text(win, '#ex-table'), /Ticket promedio/);

  // Cambiar los días de estancado vuelve a calcular.
  await win.selectOption('#ex-stagnant', '180');
  await win.waitForSelector('#ex-inventory:has-text("180 días")');

  // Período "Hoy": se compara con ayer.
  await win.click('.period [data-p=dia]');
  await win.waitForSelector('.ex-compare:has-text("ayer")');

  // En la ventana mínima, la pantalla no se desborda.
  assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('el vendedor no ve el dashboard ejecutivo', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'vendedor', 'vendedor123');
  assert.equal(await win.$('[data-route=executive]'), null);
  await go(win, 'dashboard');
  assert.equal(await win.$('[data-go=executive]'), null);
  assert.deepEqual(errors, []);
});
