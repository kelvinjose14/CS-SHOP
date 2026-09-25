'use strict';
// Programa ya instalado (CI de Windows): CAPSSHOP_EXE apunta al .exe instalado por el instalador.
// Sin esa variable, la prueba se omite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dataDir, launch, login, go, settle } = require('./helpers');

const exe = process.env.CAPSSHOP_EXE;
const keep = process.env.CAPSSHOP_KEEP_DATA; // carpeta que sobrevive a reinstalar y desinstalar

test('el programa instalado se configura, vende y conserva los datos', { skip: !exe && 'sin CAPSSHOP_EXE' }, async (t) => {
  assert.ok(fs.existsSync(exe), `existe ${exe}`);
  const dir = keep || dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const fresh = !fs.existsSync(path.join(dir, 'config.json'));
  let { app, win, errors } = await launch(t, dir);
  if (fresh) {
    await win.waitForSelector('.setup-choice');
    await win.click('.choice[data-mode=principal]');
    await win.fill('#setup-principal [name=name]', 'Caja');
    const closed = app.waitForEvent('close');
    await win.click('#setup-principal button[type=submit]');
    await closed;
    ({ app, win, errors } = await launch(t, dir));
  }
  await login(win, 'admin', 'admin123');
  const api = (name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
  if (fresh) {
    const id = await api('products.save', { name: 'Gorra de instalación', price_retail: 1000, initial_stock: 5 });
    await go(win, 'cash');
    await win.fill('#open-amount', '0');
    await win.click('#open-cash');
    await settle(win);
    await api('sales.create', { payment_type: 'contado', items: [{ product_id: id, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  }
  const p = (await api('products.list', {})).find((x) => x.name === 'Gorra de instalación');
  assert.ok(p, 'los datos siguen ahí');
  assert.equal(p.stock, 4);
  assert.equal(await win.evaluate(() => App.info.version), require('../../package.json').version);
  // El programa instalado busca actualizaciones (sin versión nueva o sin publicar, no debe fallar).
  const u = await win.evaluate(() => window.capsApi.updates.check());
  assert.notEqual(u.status, 'disabled', 'las actualizaciones están activas en el programa instalado');
  assert.ok(['none', 'available', 'error', 'checking'].includes(u.status), `estado ${u.status}: ${u.error || ''}`);
  assert.deepEqual(errors, []);
});
