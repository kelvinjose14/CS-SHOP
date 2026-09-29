'use strict';
// Catálogo de productos en Configuración (1.7): renombrar y desactivar, y el formulario lo refleja.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('Configuración → Catálogo: renombrar una marca la cambia en sus productos; desactivar un modelo lo quita del formulario', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const brand = await api(win, 'catalog.create', { type: 'brands', name: 'Marca Mal Escrita' });
  const p = await api(win, 'products.save', { name: 'Gorra de catálogo', brand_id: brand.id, price_retail: 900 });
  await go(win, 'settings');
  await win.waitForSelector('#cat-card tr:has-text("Marca Mal Escrita")');
  await win.click('#cat-card tr:has-text("Marca Mal Escrita") [data-rename]');
  await win.fill(`${dialog} [name=v]`, 'Marca Bien Escrita');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('#cat-card tr:has-text("Marca Bien Escrita")');
  assert.equal((await api(win, 'products.get', { id: p })).brand, 'Marca Bien Escrita');

  assert.equal(await win.$('#cat-tabs [data-t=colors]'), null, 'los colores ya no se manejan');
  await win.click('#cat-tabs [data-t=models]');
  await win.click('#cat-card tr:has-text("9TWENTY") [data-toggle]');
  await eventually(async () => !(await api(win, 'catalog.list', {})).models.some((c) => c.name === '9TWENTY'));
  await go(win, 'products');
  await win.click('#p-new');
  await win.click(`${dialog} #pe-model-input`);
  await win.waitForSelector(`${dialog} #pe-model .combo-item`);
  assert.ok(await win.$(`${dialog} #pe-model .combo-item:text-is("9FORTY")`));
  assert.equal(await win.$(`${dialog} #pe-model .combo-item:text-is("9TWENTY")`), null, 'el modelo desactivado no se ofrece');
  assert.deepEqual(errors, []);
});
