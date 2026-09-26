'use strict';
// Flujos principales de la tienda en la aplicación real, comprobando los números.
// Datos: base de muestra de la versión 1.0.0 (caja de la PC principal abierta).
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, settle, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);

test('venta, compra a crédito, abono, devolución, anulación y cierre de caja', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');

  // --- Venta con lector de código y búsqueda por nombre; pago en efectivo con cambio ---
  const cashBefore = (await api(win, 'cash.status')).open.expected;
  const stock1 = (await api(win, 'products.get', { id: 1 })).stock;
  await go(win, 'pos');
  await win.fill('#pos-picker input', '74600000001');
  await win.press('#pos-picker input', 'Enter');
  await win.fill('#pos-picker input', 'trucker');
  await win.waitForSelector('.picker-item');
  await win.press('#pos-picker input', 'Enter');
  await win.fill('#pay-rows [data-k=amount]', '5000');
  assert.match(await text(win, '#t-total'), /3,100\.00/);
  await win.keyboard.press('F9');
  await win.waitForSelector('.done-total');
  assert.match(await text(win, '.done-change'), /1,900\.00/);
  await win.click('.modal-foot .btn.primary');
  assert.equal((await api(win, 'products.get', { id: 1 })).stock, stock1 - 1);
  assert.equal((await api(win, 'cash.status')).open.expected, cashBefore + 3100);

  // --- Compra a crédito: sube la existencia y la cuenta por pagar ---
  const payablesBefore = (await api(win, 'reports.dashboard')).payables;
  const stock7 = (await api(win, 'products.get', { id: 7 })).stock;
  await go(win, 'purchase-new');
  await win.selectOption('[name=supplier_id]', { index: 1 });
  await win.fill('#pu-picker input', 'jordan');
  await win.waitForSelector('.picker-item');
  await win.press('#pu-picker input', 'Enter');
  await win.fill('#pu-lines [data-k=qty]', '5');
  await win.fill('#pu-lines [data-k=unit_cost]', '1000');
  await win.click('#pu-type [data-t=credito]');
  await win.click('#pu-save');
  await win.waitForFunction(() => document.querySelector('#page-title').textContent === 'Compras');
  assert.equal((await api(win, 'products.get', { id: 7 })).stock, stock7 + 5);
  assert.equal((await api(win, 'reports.dashboard')).payables, payablesBefore + 5000);

  // --- Abono de un cliente ---
  const receivablesBefore = (await api(win, 'reports.dashboard')).receivables;
  await go(win, 'receivables');
  await win.click('[data-pay]');
  await win.fill('.modal [name=amount]', '500');
  await win.selectOption('.modal [name=method]', 'transferencia').catch(() => {});
  await win.click('.modal-foot .btn.primary');
  assert.ok(await eventually(async () => (await api(win, 'reports.dashboard')).receivables === receivablesBefore - 500), 'el abono rebaja lo que deben');

  // --- Devolución de la venta de hoy: vuelve la gorra al inventario ---
  const [sale] = await api(win, 'sales.list', {});
  await go(win, 'sales');
  await win.evaluate((id) => saleDetail(id, () => App.reload()), sale.id);
  await win.waitForSelector('.modal');
  await win.click('.modal-foot >> text=Devolución');
  await win.waitForSelector('[data-item]');
  const ret = win.locator('.modal-back', { has: win.locator('[data-item]') });
  await ret.locator('[data-item]').first().fill('1');
  await ret.locator('[name=reason]').fill('Talla incorrecta');
  await ret.locator('.modal-foot .btn.primary').click();
  assert.ok(await eventually(async () => (await api(win, 'sales.get', { id: sale.id })).returned_total > 0), 'la devolución quedó registrada');

  // --- Anulación de otra venta: se sella con motivo ---
  const other = (await api(win, 'sales.list', {})).find((s) => s.id !== sale.id && s.status !== 'anulada' && !(s.returned_total > 0));
  await win.evaluate((id) => saleDetail(id, () => App.reload()), other.id);
  await win.click('.modal-foot >> text=Anular venta');
  const prompt = win.locator('.modal-back', { has: win.locator('[name=v]') });
  await prompt.locator('[name=v]').fill('Venta duplicada');
  await prompt.locator('.modal-foot .btn.primary').click();
  assert.ok(await eventually(async () => (await api(win, 'sales.get', { id: other.id })).status === 'anulada'), 'la venta quedó anulada');

  // --- Cierre de caja con un faltante de 50 ---
  const expected = (await api(win, 'cash.status')).open.expected;
  await go(win, 'cash');
  await win.click('#cash-close');
  await win.fill('.modal [name=counted]', String(expected - 50));
  await win.click('.modal-foot .btn.primary');
  await eventually(async () => (await api(win, 'cash.status')).open === null);
  await settle(win);
  const [last] = await api(win, 'cash.history', {});
  assert.equal(last.status, 'cerrada');
  assert.equal(last.difference, -50);
  assert.match(await text(win, '#page'), /La caja de esta computadora está cerrada/);

  assert.deepEqual(errors, []);
});
