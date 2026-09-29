'use strict';
// Buscar actualizaciones desde Configuración: se ve que está buscando y un aviso dice qué encontró.
// El actualizador real solo funciona instalado; aquí se reemplazan sus respuestas en el proceso principal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text } = require('./helpers');

test('Buscar ahora muestra "Buscando…" y avisa; instalar al cerrar el programa queda programado', async (t) => {
  const { app, win, errors } = await launch(t, dataDir({ demo: true }));
  // Respuestas del actualizador: la búsqueda tarda un poco, como por internet.
  const fake = (result) => app.evaluate(({ ipcMain }, r) => {
    const base = { current: '1.6.0', version: null, percent: 0, error: null, checked_at: null };
    ipcMain.removeHandler('update:status');
    ipcMain.handle('update:status', () => ({ ok: true, data: { ...base, status: 'idle' } }));
    ipcMain.removeHandler('update:check');
    ipcMain.handle('update:check', () => new Promise((ok) => setTimeout(() => ok({ ok: true, data: { ...base, ...r, checked_at: new Date().toISOString() } }), 400)));
  }, result);
  await fake({ status: 'none' });
  await login(win, 'admin', 'admin123');
  await go(win, 'settings');
  await win.waitForSelector('#upd-check:not([disabled])');
  await win.click('#upd-check');
  assert.equal(await win.textContent('#upd-check'), 'Buscando…');
  assert.equal(await win.$eval('#upd-check', (b) => b.disabled), true);
  await win.waitForSelector('.toast:has-text("No hay versiones nuevas: la 1.6.0 es la más reciente")');
  assert.match(await text(win, '#upd-card'), /Tiene la versión más reciente \(revisado a las .+\)/);

  await fake({ status: 'available', version: '1.6.1' });
  await win.click('#upd-check');
  await win.waitForSelector('.toast:has-text("Hay una versión nueva: 1.6.1")');
  await win.waitForSelector('#upd-install:has-text("Actualizar ahora a la 1.6.1")');
  await win.waitForSelector('#upd-later:has-text("Al cerrar el programa")');

  // "Al cerrar el programa": se programa sin cerrar nada, y el aviso de arriba lo dice.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('update:install');
    ipcMain.handle('update:install', (_e, opts) => {
      global.installOpts = opts;
      const data = { current: '1.6.0', version: '1.6.1', status: opts.when === 'quit' ? 'scheduled' : 'ready', percent: 100, error: null, checked_at: null };
      ipcMain.removeHandler('update:status');
      ipcMain.handle('update:status', () => ({ ok: true, data }));
      return { ok: true, data };
    });
  });
  await win.click('#upd-later');
  await win.waitForSelector('.toast:has-text("se instalará sola al cerrar el programa")');
  assert.deepEqual(await app.evaluate(() => global.installOpts), { when: 'quit' });
  assert.match(await text(win, '#upd-card'), /se instalará sola al cerrar el programa/);
  await win.waitForSelector('.update-pill:has-text("Versión 1.6.1 al cerrar")');
  // Refrescar la caja no borra el aviso ni duplica la etiqueta de la caja.
  await win.evaluate(() => App.refreshCashBadge());
  await win.waitForTimeout(300);
  assert.equal(await win.$$eval('#topbar-right .update-pill', (x) => x.length), 1);
  assert.equal(await win.$$eval('#topbar-right .cash-pill:not(.update-pill)', (x) => x.length), 1);

  await fake({ status: 'error', error: 'No hay conexión a internet.' });
  await go(win, 'settings');
  await win.click('#upd-check');
  await win.waitForSelector('.toast.error:has-text("No hay conexión a internet.")');
  assert.deepEqual(errors, []);
});
