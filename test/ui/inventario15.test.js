'use strict';
// Inventario avanzado (1.5) en la aplicación real: modelo con variantes, apartados y conteo sugerido.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('producto nuevo: marca, modelo y categoría con pocas opciones y "+ Crear", tallas con un clic y existencia por talla, sin colores', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  await go(win, 'products');
  await win.click('#p-new');
  await win.waitForSelector(`${dialog} #pe-brand-input`);
  assert.equal(await win.$(`${dialog} #pe-colors`), null, 'el formulario ya no pide colores');
  assert.equal(await win.inputValue(`${dialog} [name=min_stock]`), '2', 'stock mínimo 2 al empezar');
  await win.fill(`${dialog} [name=name]`, 'Gorra por tallas');
  // Marca: pocas opciones; al escribir se filtra; si no existe, "+ Crear nueva marca" la crea y la deja elegida.
  await win.click(`${dialog} #pe-brand-input`);
  const brands = await win.$$eval(`${dialog} #pe-brand .combo-item:not(.combo-create)`, (x) => x.map((e) => e.textContent.trim()));
  for (const b of ['New Era', 'Mitchell & Ness', 'Goorin Bros.', 'Nike', 'Adidas']) assert.ok(brands.includes(b), b);
  assert.ok(!brands.includes('Supreme'), 'las de la lista larga anterior ya no salen');
  await win.fill(`${dialog} #pe-brand-input`, 'mitch');
  assert.deepEqual(await win.$$eval(`${dialog} #pe-brand .combo-item:not(.combo-create)`, (x) => x.map((e) => e.textContent.trim())), ['Mitchell & Ness']);
  await win.press(`${dialog} #pe-brand-input`, 'Escape');
  assert.ok(await win.$(`${dialog} #pe-brand-input`), 'Esc cierra la lista, no el formulario');
  assert.equal(await win.isVisible(`${dialog} #pe-brand .combo-list`), false);
  await win.fill(`${dialog} #pe-brand-input`, 'Pink Dolphin');
  await win.click(`${dialog} #pe-brand .combo-create`);
  await win.waitForSelector('.toast:has-text("Pink Dolphin")');
  assert.equal(await win.inputValue(`${dialog} #pe-brand-input`), 'Pink Dolphin');
  // Modelo: igual, sin depender de la marca.
  await win.click(`${dialog} #pe-model-input`);
  const models = await win.$$eval(`${dialog} #pe-model .combo-item:not(.combo-create)`, (x) => x.map((e) => e.textContent.trim()));
  for (const m of ['59FIFTY', '9FIFTY', '9FORTY', '39THIRTY', '9TWENTY']) assert.ok(models.includes(m), m);
  await win.fill(`${dialog} #pe-model-input`, 'Low Pro Prueba');
  await win.click(`${dialog} #pe-model .combo-create`);
  await win.waitForSelector('.toast:has-text("Low Pro Prueba")');
  assert.equal(await win.inputValue(`${dialog} #pe-model-input`), 'Low Pro Prueba');
  // Categoría: escribir el nombre completo y pasar al siguiente campo también la elige.
  await win.fill(`${dialog} #pe-category-input`, 'fitted');
  await win.click(`${dialog} [name=name]`);
  await win.waitForTimeout(250);
  assert.equal(await win.inputValue(`${dialog} #pe-category-input`), 'Fitted');
  // Tallas con un clic; cada una con su existencia.
  await win.click(`${dialog} #pe-sizes .chip-opt:text-is("7")`);
  await win.click(`${dialog} #pe-sizes .chip-opt:text-is("7 1/4")`);
  assert.equal(await win.$eval(`${dialog} #pe-sizes .chip-opt.on:has-text("7 1/4")`, (b) => b.getAttribute('aria-pressed')), 'true');
  const stock = await win.$$(`${dialog} #pe-stock [data-stock]`);
  assert.equal(stock.length, 2);
  await stock[0].fill('3');
  await stock[1].fill('2');
  // La rueda del mouse no cambia un número con el cursor dentro.
  await win.fill(`${dialog} [name=min_stock]`, '5');
  await win.hover(`${dialog} [name=min_stock]`);
  await win.mouse.wheel(0, -300);
  await win.waitForTimeout(150);
  assert.equal(await win.inputValue(`${dialog} [name=min_stock]`), '5', 'sin el arreglo pasaba a 6');
  await win.fill(`${dialog} [name=min_stock]`, '2');
  await win.fill(`${dialog} [name=price_retail]`, '1500');
  // Montos: 2 decimales como máximo.
  await win.fill(`${dialog} [name=price_wholesale]`, '1200.555');
  await win.press(`${dialog} [name=price_wholesale]`, 'Tab');
  await win.waitForSelector('.toast.error:has-text("2 decimales")');
  assert.ok(await win.$(`${dialog} [name=price_wholesale].invalid`));
  await win.fill(`${dialog} [name=price_wholesale]`, '1200.50');
  await win.fill(`${dialog} [name=cost]`, '500');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast:has-text("Producto creado con 2 tallas")');
  const variants = await eventually(async () => { const l = await api(win, 'products.list', { search: 'Gorra por tallas' }); return l.length === 2 && l; });
  assert.equal(new Set(variants.map((v) => v.model_id)).size, 1);
  assert.ok(variants.every((v) => v.brand === 'Pink Dolphin' && v.model === 'Low Pro Prueba' && v.category === 'Fitted' && v.color === null && v.price_wholesale === 1200.5));
  assert.deepEqual(variants.map((v) => [v.size, v.stock]), [['7', 3], ['7 1/4', 2]]);
  const cat = await api(win, 'catalog.list', {});
  assert.ok(cat.models.some((m) => m.name === 'Low Pro Prueba') && cat.brands.some((b) => b.name === 'Pink Dolphin'), 'quedan para los próximos productos');

  // Editar: agregar 7 1/8 y quitar 7 (se desactiva, no se borra).
  await win.click('#p-view [data-v=modelos]');
  await win.click('tr:has-text("Gorra por tallas")');
  await win.waitForSelector(`${dialog} .vgrid .cell`);
  await win.click(`${dialog} .modal-foot .btn:has-text("Editar producto")`);
  await win.waitForSelector(`${dialog} #pe-sizes`);
  assert.equal(await win.inputValue(`${dialog} #pe-model-input`), 'Low Pro Prueba');
  await win.click(`${dialog} #pe-sizes .chip-opt:text-is("7 1/8")`);
  await win.click(`${dialog} #pe-sizes .chip-opt[data-id="${cat.sizes.find((z) => z.name === '7').id}"]`);
  assert.equal(await win.$$eval(`${dialog} #pe-stock .ss-item.off`, (x) => x.length), 1);
  await win.fill(`${dialog} #pe-stock [data-stock]`, '4');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.modal-back:last-child .modal-foot .btn:has-text("Quitar")');
  await win.click('.modal-back:last-child .modal-foot .btn:has-text("Quitar")');
  await win.waitForSelector('.toast:has-text("Producto guardado")');
  const after = await eventually(async () => { const l = await api(win, 'products.list', { search: 'Gorra por tallas' }); return l.some((v) => v.size === '7 1/8') && l; });
  assert.deepEqual(after.map((v) => [v.size, v.stock]), [['7 1/8', 4], ['7 1/4', 2]], 'la talla 7 quedó desactivada');
  assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('venta de un producto con colores de antes y tallas: se elige color y talla, se ve lo disponible y solo baja esa variante', async (t) => {
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
