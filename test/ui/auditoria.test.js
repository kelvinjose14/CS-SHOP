'use strict';
// Correcciones de la auditoría en la aplicación real: tablas grandes, anular pagos y movimientos de caja,
// y productos sin precio en la venta.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);

test('tablas grandes: 1000 filas en pantalla, totales con todas y "Mostrar todas"', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const r = await win.evaluate(() => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ n: i + 1, amount: 2 }));
    const box = document.createElement('div');
    document.querySelector('#page').appendChild(box);
    setHTML(box, table({ columns: [{ key: 'n', label: 'N' }, { key: 'amount', label: 'Monto', money: true, total: true }], rows }));
    let clicked = null;
    onRowClick(box, rows, (row) => (clicked = row.n));
    const before = { shown: box.querySelectorAll('tbody tr[data-idx]').length, note: box.querySelector('.table-more').textContent, total: box.querySelector('tfoot').textContent };
    box.querySelector('[data-show-all]').click();
    box.querySelectorAll('tbody tr[data-idx]')[1400].click();
    return { before, after: box.querySelectorAll('tbody tr[data-idx]').length, note: !!box.querySelector('.table-more'), clicked };
  });
  assert.equal(r.before.shown, 1000);
  assert.match(r.before.note, /1,000 de 1,500/);
  assert.match(r.before.total, /3,000\.00/, 'el total suma las 1500 filas');
  assert.equal(r.after, 1500);
  assert.equal(r.note, false);
  assert.equal(r.clicked, 1401, 'el clic funciona en las filas agregadas');
  assert.deepEqual(errors, []);
});

test('anular un movimiento de caja y un abono desde la pantalla; producto sin precio en la venta', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');

  // Caja: anular un retiro.
  const before = (await api(win, 'cash.status')).open.expected;
  await api(win, 'cash.movement', { type: 'retiro', amount: 150, description: 'Retiro equivocado' });
  await go(win, 'cash');
  await win.click('[data-void-mov]');
  await win.fill('.modal-back:last-child [name=v]', 'Era de otra caja');
  await win.click('.modal-back:last-child .modal-foot .btn.primary');
  assert.ok(await eventually(async () => (await api(win, 'cash.status')).open.expected === before));
  await go(win, 'cash');
  assert.match(await text(win, '.cash-grid'), /Anulado/);

  // Cliente: anular un abono.
  const cu = await api(win, 'customers.save', { name: 'Cliente de la auditoría' });
  await api(win, 'customers.opening', { customer_id: cu, amount: 900 });
  await api(win, 'sales.pay', { customer_id: cu, amount: 300, method: 'transferencia' });
  await go(win, 'customers');
  await win.evaluate((id) => customerDetail(id, () => {}), cu);
  await win.click('[data-void-pay]');
  await win.fill('.modal-back:last-child [name=v]', 'Abono duplicado');
  await win.click('.modal-back:last-child .modal-foot .btn.primary');
  assert.ok(await eventually(async () => (await api(win, 'customers.get', { id: cu })).balance === 900));
  await win.waitForSelector('.modal .badge:has-text("Anulado")');
  await win.keyboard.press('Escape');

  // Venta al por mayor de un producto sin precio por mayor: se ve "Sin precio" y no se cobra en 0.
  const p = await api(win, 'products.save', { name: 'Gorra sin mayor', cost: 100, price_retail: 500, initial_stock: 3 });
  await api(win, 'products.get', { id: p });
  await go(win, 'pos');
  await win.click('#pos-type [data-v=mayor]');
  await win.fill('#pos-picker input', 'Gorra sin mayor');
  await win.waitForSelector('.picker-item');
  await win.press('#pos-picker input', 'Enter');
  await win.waitForSelector('.toast.error');
  assert.match(await text(win, '#toasts'), /no tiene precio por mayor/);
  assert.equal(await win.$eval('#pos-lines [data-k=unit_price]', (i) => i.classList.contains('invalid')), true);
  await win.keyboard.press('F9');
  assert.ok(await eventually(async () => /no tiene precio por mayor/.test(await text(win, '#toasts'))));
  assert.equal((await api(win, 'products.get', { id: p })).stock, 3, 'no se vendió');
  assert.deepEqual(errors, []);
});
