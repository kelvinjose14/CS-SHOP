'use strict';
// Todas las pantallas abren sin errores, como administrador y como vendedor.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go } = require('./helpers');

const ADMIN_ROUTES = ['dashboard', 'pos', 'sales', 'products', 'movements', 'purchases', 'purchase-new', 'suppliers', 'customers',
  'receivables', 'payables', 'expenses', 'incomes', 'cash', 'accounting', 'cashflow', 'reports', 'audit', 'users', 'settings'];
const SELLER_ROUTES = ['dashboard', 'pos', 'sales', 'products', 'customers', 'receivables', 'cash'];

for (const [who, password, routes] of [['admin', 'admin123', ADMIN_ROUTES], ['vendedor', 'vendedor123', SELLER_ROUTES]]) {
  test(`pantallas como ${who}`, async (t) => {
    const { win, errors } = await launch(t, dataDir({ demo: true }));
    await login(win, who, password);
    const menu = await win.$$eval('[data-route]', (as) => as.map((a) => a.dataset.route));
    if (who === 'vendedor') {
      for (const hidden of ['purchases', 'expenses', 'accounting', 'users', 'settings']) assert.ok(!menu.includes(hidden), `el vendedor no ve ${hidden}`);
    }
    for (const r of routes) {
      await go(win, r);
      const box = await win.$('#page .error-box');
      assert.equal(box ? await box.textContent() : null, null, `pantalla ${r}`);
    }
    // Todos los reportes se generan.
    if (who === 'admin') {
      await go(win, 'reports');
      const reports = await win.evaluate(() => [...document.querySelectorAll('#page [data-r]')].map((b) => b.dataset.r));
      assert.ok(reports.length >= 15, `hay ${reports.length} reportes`);
      for (const report of reports) {
        await go(win, 'reports', { report });
        assert.equal(await win.$('#page .error-box'), null, `reporte ${report}`);
      }
    }
    assert.deepEqual(errors, []);
  });
}
