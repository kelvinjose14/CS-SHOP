'use strict';
// Inventario avanzado (1.5) en la aplicación real: modelo con variantes, apartados y conteo sugerido.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('modelo con variantes desde la cuadrícula, vista por modelo y detalle color × talla', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  await go(win, 'products');
  await win.click('#p-new');
  await win.waitForSelector(`${dialog} #pf-mode`);
  await win.click(`${dialog} #pf-mode [data-m=varias]`);
  assert.equal(await win.isVisible(`${dialog} [name=color]`), false, 'color y talla sueltos se esconden');
  await win.fill(`${dialog} [name=name]`, 'Gorra cuadrícula');
  await win.fill(`${dialog} [name=category]`, 'Fitted');
  await win.fill(`${dialog} [name=cost]`, '500');
  await win.fill(`${dialog} [name=price_retail]`, '1500');
  await win.fill(`${dialog} #pf-colors`, 'Negro, Rojo');
  await win.fill(`${dialog} #pf-sizes`, '7 1/4, 7');
  assert.match(await text(win, `${dialog} #pf-grid`), /Se crean 4 variantes/);
  await win.fill(`${dialog} [data-vc="Negro"][data-vs="7"]`, '3');
  await win.fill(`${dialog} [data-vc="Rojo"][data-vs="7 1/4"]`, '2');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast:has-text("Modelo creado con 4 variantes")');
  const variants = await eventually(async () => { const l = await api(win, 'products.list', { search: 'Gorra cuadrícula' }); return l.length === 4 && l; });
  assert.equal(new Set(variants.map((v) => v.model_id)).size, 1);
  assert.equal(variants.find((v) => v.color === 'Negro' && v.size === '7').stock, 3);

  // Vista por modelo y cuadrícula del modelo.
  await win.click('#p-view [data-v=modelos]');
  await win.waitForSelector('tr:has-text("Gorra cuadrícula")');
  assert.match(await text(win, 'tr:has-text("Gorra cuadrícula")'), /Negro, Rojo/);
  await win.click('tr:has-text("Gorra cuadrícula")');
  await win.waitForSelector(`${dialog} .vgrid .cell`);
  assert.equal(await win.$$eval(`${dialog} .vgrid .cell`, (x) => x.length), 4);
  assert.deepEqual(await win.$$eval(`${dialog} .vgrid thead th`, (x) => x.map((h) => h.textContent.trim())), ['', '7', '7 1/4', 'Total'], 'tallas en orden');

  // Agregar un color: solo las combinaciones nuevas.
  await win.click(`${dialog} .modal-foot .btn:has-text("Agregar colores o tallas")`);
  await win.waitForSelector(`${dialog} #av-grid`);
  await win.fill(`${dialog} [name=colors]`, 'Negro, Rojo, Blanco');
  assert.match(await text(win, `${dialog} #av-grid`), /Se crean 2 variantes/);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast:has-text("2 variantes agregadas")');
  assert.equal((await api(win, 'products.list', { search: 'Gorra cuadrícula' })).length, 6);
  assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('apartado: se crea, el vendedor no puede vender lo apartado y se vende desde el apartado', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });
  const p = await api(win, 'products.save', { name: 'Gorra para apartar', price_retail: 900, initial_stock: 1 });
  const cu = await api(win, 'customers.save', { name: 'Cliente que aparta', phone: '809-555-0101' });

  await go(win, 'reservations');
  await win.click('#rs-new');
  await win.waitForSelector(`${dialog} #rf-customer`);
  await win.selectOption(`${dialog} #rf-customer`, String(cu));
  await win.fill(`${dialog} #rf-picker input`, 'Gorra para apartar');
  await win.waitForSelector('.picker-item');
  await win.press(`${dialog} #rf-picker input`, 'Enter');
  await win.waitForSelector(`${dialog} #rf-lines tr[data-i]`);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('#page tr:has-text("Cliente que aparta")');
  assert.equal((await api(win, 'products.get', { id: p })).available, 0);

  // En una venta normal, la gorra apartada no entra.
  await go(win, 'pos');
  await win.fill('#pos-picker input', 'Gorra para apartar');
  await win.waitForSelector('.picker-item');
  assert.match(await text(win, '.picker-item'), /Disp\.: 0 · 1 apart\./);
  await win.press('#pos-picker input', 'Enter');
  await win.waitForSelector('.toast.error:has-text("apartado para otro cliente")');

  // Desde el apartado: Vender abre la venta con el cliente y la gorra.
  await go(win, 'reservations');
  await win.click('#page tr:has-text("Cliente que aparta")');
  await win.waitForSelector(`${dialog} .modal-foot .btn:has-text("Vender")`);
  await win.click(`${dialog} .modal-foot .btn:has-text("Vender")`);
  await win.waitForSelector('#pos-reservation');
  assert.equal(await win.$eval('#pos-customer', (s) => s.disabled), true);
  assert.match(await text(win, '#pos-lines'), /Gorra para apartar/);
  await win.click('#pos-charge');
  await win.waitForSelector('.done-no');
  const res = (await api(win, 'reservations.list', { status: 'vendido' }))[0];
  assert.equal(res.customer_name, 'Cliente que aparta');
  assert.equal((await api(win, 'products.get', { id: p })).stock, 0);
  await win.keyboard.press('Escape');

  // Conteo sugerido de la semana.
  await go(win, 'count');
  await win.click('#ct-cycle');
  await win.waitForSelector('#ct-cycle-info:not(.hidden)');
  assert.match(await text(win, '#ct-cycle-info'), /Conteo sugerido de esta semana/);
  assert.deepEqual(errors, []);
});
