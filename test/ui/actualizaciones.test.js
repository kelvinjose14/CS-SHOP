'use strict';
// Buscar actualizaciones desde Configuración: se ve que está buscando y un aviso dice qué encontró.
// El actualizador real solo funciona instalado; aquí se reemplazan sus respuestas en el proceso principal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text } = require('./helpers');

test('Buscar ahora muestra "Buscando…" y avisa si no hay versión nueva o si la hay', async (t) => {
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
  await win.waitForSelector('#upd-install:has-text("Instalar la versión 1.6.1")');

  await fake({ status: 'error', error: 'No hay conexión a internet.' });
  await win.click('#upd-check');
  await win.waitForSelector('.toast.error:has-text("No hay conexión a internet.")');
  assert.deepEqual(errors, []);
});
