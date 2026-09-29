'use strict';
// Inventario avanzado (1.5) en la aplicación real: modelo con variantes, apartados y conteo sugerido.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('producto nuevo: marca con búsqueda, categoría, colores y tallas con un clic, existencia por variante y total', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  await go(win, 'products');
  await win.click('#p-new');
  await win.waitForSelector(`${dialog} #pe-brand-input`);
  assert.equal(await win.$(`${dialog} #pf-colors`), null, 'ya no se escriben colores separados por coma');
  await win.fill(`${dialog} [name=name]`, 'Gorra cuadrícula');
  // Marca: al escribir se filtra; si no existe, "+ Crear nueva marca" la crea y la deja elegida.
  await win.click(`${dialog} #pe-brand-input`);
  await win.fill(`${dialog} #pe-brand-input`, 'mitch');
  assert.deepEqual(await win.$$eval(`${dialog} .combo-item:not(.combo-create)`, (x) => x.map((e) => e.textContent.trim())), ['Mitchell & Ness']);
  await win.press(`${dialog} #pe-brand-input`, 'Escape');
  assert.ok(await win.$(`${dialog} #pe-brand-input`), 'Esc cierra la lista, no el formulario');
  assert.equal(await win.isVisible(`${dialog} .combo-list`), false);
  await win.fill(`${dialog} #pe-brand-input`, 'Pink Dolphin');
  await win.click(`${dialog} .combo-create`);
  await win.waitForSelector('.toast:has-text("Pink Dolphin")');
  assert.equal(await win.inputValue(`${dialog} #pe-brand-input`), 'Pink Dolphin');
  // Escribir el nombre completo y pasar al siguiente campo también la elige.
  await win.fill(`${dialog} #pe-category-input`, 'fitted');
  await win.click(`${dialog} [name=model]`);
  await win.waitForTimeout(250);
  assert.equal(await win.inputValue(`${dialog} #pe-category-input`), 'Fitted');
  // Colores y tallas: se marcan con un clic; un color nuevo con su código.
  await win.click(`${dialog} #pe-colors .chip-opt:has-text("Negro")`);
  await win.click(`${dialog} #pe-colors .chip-add`);
  await win.fill('.modal-back:last-child [name=name]', 'Verde oliva');
  await win.fill('.modal-back:last-child [name=hex]', '#6b8e23');
  await win.click('.modal-back:last-child .modal-foot .btn.primary');
  await win.waitForSelector(`${dialog} #pe-colors .chip-opt.on:has-text("Verde oliva")`);
  await win.click(`${dialog} #pe-sizes .chip-opt:text-is("7")`);
  await win.click(`${dialog} #pe-sizes .chip-opt:text-is("7 1/4")`);
  assert.equal(await win.$eval(`${dialog} #pe-sizes .chip-opt.on:has-text("7 1/4")`, (b) => b.getAttribute('aria-pressed')), 'true');
  assert.equal(await win.$$eval(`${dialog} #pe-variants [data-stock]`, (x) => x.length), 4, '2 colores × 2 tallas');
  const stock = await win.$$(`${dialog} #pe-variants [data-stock]`);
  for (const [i, v] of [3, 1, 0, 2].entries()) await stock[i].fill(String(v));
  assert.match(await text(win, `${dialog} #pe-total`), /^6 unidades$/);
  await win.fill(`${dialog} [name=cost]`, '500');
  await win.fill(`${dialog} [name=price_retail]`, '1500');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast:has-text("Producto creado con 4 variantes")');
  const variants = await eventually(async () => { const l = await api(win, 'products.list', { search: 'Gorra cuadrícula' }); return l.length === 4 && l; });
  assert.equal(new Set(variants.map((v) => v.model_id)).size, 1);
  assert.ok(variants.every((v) => v.brand === 'Pink Dolphin' && v.category === 'Fitted'));
  assert.equal(variants.find((v) => v.color === 'Negro' && v.size === '7').stock, 3);
  assert.equal(variants.find((v) => v.color === 'Verde oliva' && v.size === '7 1/4').stock, 2);

  // Vista por modelo y detalle color × talla.
  await win.click('#p-view [data-v=modelos]');
  await win.click('tr:has-text("Gorra cuadrícula")');
  await win.waitForSelector(`${dialog} .vgrid .cell`);
  assert.deepEqual(await win.$$eval(`${dialog} .vgrid thead th`, (x) => x.map((h) => h.textContent.trim())), ['', '7', '7 1/4', 'Total']);

  // Editar: agregar Blanco y quitar Verde oliva (sus variantes se desactivan, no se borran).
  await win.click(`${dialog} .modal-foot .btn:has-text("Editar producto")`);
  await win.waitForSelector(`${dialog} #pe-colors`);
  await win.click(`${dialog} #pe-colors .chip-opt:has-text("Blanco")`);
  await win.click(`${dialog} #pe-colors .chip-opt:has-text("Verde oliva")`);
  assert.equal(await win.$$eval(`${dialog} #pe-variants tr.row-off`, (x) => x.length), 2);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.modal-back:last-child .modal-foot .btn:has-text("Desactivar")');
  await win.click('.modal-back:last-child .modal-foot .btn:has-text("Desactivar")');
  await win.waitForSelector('.toast:has-text("Producto guardado")');
  const after = await eventually(async () => { const l = await api(win, 'products.list', { search: 'Gorra cuadrícula' }); return l.some((v) => v.color === 'Blanco') && l; });
  assert.deepEqual([...new Set(after.map((v) => v.color))].sort(), ['Blanco', 'Negro'], 'Verde oliva quedó desactivado');
  assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('venta de un producto con variantes: se elige color y talla, se ve lo disponible y solo baja esa variante', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });
  const c = await api(win, 'catalog.list', {});
  const id = (l, n) => c[l].find((x) => x.name === n).id;
  const r = await api(win, 'products.createModel', { name: 'Gorra Variantes Venta', price_retail: 2000, variants: [
    { color_id: id('colors', 'Negro'), size_id: id('sizes', '7'), initial_stock: 2 },
    { color_id: id('colors', 'Negro'), size_id: id('sizes', '7 1/8'), initial_stock: 5 },
    { color_id: id('colors', 'Rojo'), size_id: id('sizes', '7'), initial_stock: 1 },
  ] });
  await go(win, 'pos');
  await win.fill('#pos-picker input', 'Variantes Venta');
  await win.waitForSelector('.picker-item:has-text("3 variantes")');
  await win.press('#pos-picker input', 'Enter');
  await win.waitForSelector(`${dialog} #vc-color`);
  await win.selectOption(`${dialog} #vc-color`, 'Negro');
  const opt = await win.$$eval(`${dialog} #vc-size option`, (x) => x.map((o) => o.textContent.trim()));
  assert.deepEqual(opt, ['7 (2)', '7 1/8 (5)']);
  await win.selectOption(`${dialog} #vc-size`, { label: '7 1/8 (5)' });
  assert.equal(await text(win, `${dialog} #vc-available`), '5');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('#pos-lines tr:has-text("7 1/8")');
  await win.click('#pos-charge');
  await win.waitForSelector('.done-no');
  const vs = await api(win, 'products.list', { model_id: r.model_id });
  assert.deepEqual(vs.map((v) => [v.color, v.size, v.stock]), [['Negro', '7', 2], ['Negro', '7 1/8', 4], ['Rojo', '7', 1]]);
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
