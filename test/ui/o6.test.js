'use strict';
// Conteo de inventario (O6) en la aplicación real: lector, escribir, borrador, revisar y aplicar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);

test('conteo de inventario con el lector y a mano', { timeout: 90000 }, async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const [p1, p2] = (await api(win, 'products.list', {})).filter((p) => p.barcode && p.stock > 2);
  await go(win, 'products');
  await win.click('#p-count');
  await win.waitForSelector('#ct-table');
  assert.equal(await win.textContent('#page-title'), 'Conteo de inventario');

  // Lector: cada lectura suma 1.
  for (let i = 0; i < 2; i++) {
    await win.fill('#ct-scan', p1.barcode);
    await win.press('#ct-scan', 'Enter');
  }
  assert.equal(await win.inputValue(`[data-count="${p1.id}"]`), '2');
  await win.fill('#ct-scan', 'NO-EXISTE');
  await win.press('#ct-scan', 'Enter');
  await win.waitForSelector('.toast.error');
  // A mano: el segundo coincide con el sistema.
  await win.fill(`[data-count="${p2.id}"]`, String(p2.stock));
  assert.match(await text(win, `[data-diff="${p1.id}"]`), new RegExp(`${2 - p1.stock}`));
  assert.match(await text(win, '.stats'), /Contados ?2 de/);

  // El borrador sobrevive si se sale de la pantalla.
  await go(win, 'dashboard');
  await win.evaluate(() => { App.go('count'); });
  await win.waitForSelector('.modal-back');
  await win.click('.modal-foot .btn.primary'); // Seguir
  await win.waitForSelector('#ct-table');
  assert.equal(await win.inputValue(`[data-count="${p1.id}"]`), '2');

  await win.click('#ct-review');
  await win.waitForSelector('.modal [name=note]');
  assert.match(await text(win, '.modal'), /Faltan/);
  await win.fill('.modal [name=note]', 'Conteo de prueba del piloto');
  await win.click('.modal-foot .btn.primary');
  await win.waitForFunction(() => document.querySelector('#page-title').textContent === 'Inventario');
  assert.equal((await api(win, 'products.get', { id: p1.id })).stock, 2);
  assert.equal((await api(win, 'products.get', { id: p2.id })).stock, p2.stock);
  assert.equal((await api(win, 'products.movements', { type: 'conteo' })).length, 1);
  // Terminado el conteo, no queda borrador.
  await win.evaluate(() => { App.go('count'); });
  await win.waitForSelector('#ct-table');
  assert.equal(await win.$('.modal-back'), null);
  assert.equal(await win.inputValue(`[data-count="${p1.id}"]`), '');
  assert.ok(await eventually(async () => (await api(win, 'reports.audit', { action: 'conteo_inventario' })).length === 1));
  assert.deepEqual(errors, []);
});
