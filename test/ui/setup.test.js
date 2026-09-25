'use strict';
// Instalación nueva, restaurar una copia, diagnóstico para el soporte y fotos que faltan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dataDir, launch, login, go, text } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
// Respuestas fijas a los diálogos de Windows (guardar, abrir, confirmar).
const mockDialogs = (app, { save, open } = {}) => app.evaluate(({ dialog }, [s, o]) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: s });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [o] });
  dialog.showMessageBox = async () => ({ response: 1 });
}, [save, open]);

test('instalación nueva como PC principal, en la ventana más pequeña', async (t) => {
  const dir = dataDir();
  let { app, win } = await launch(t, dir, { width: 1100, height: 700 });
  await win.waitForSelector('.setup-choice');
  const overflow = await win.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'sin desplazamiento horizontal');
  await win.click('.choice[data-mode=principal]');
  await win.fill('#setup-principal [name=name]', '');
  await win.click('#setup-principal button[type=submit]');
  // El campo es obligatorio: el formulario no se envía.
  assert.equal(fs.existsSync(path.join(dir, 'config.json')), false);
  await win.fill('#setup-principal [name=name]', 'Oficina');
  const closed = app.waitForEvent('close');
  await win.click('#setup-principal button[type=submit]');
  await closed;
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'principal');
  assert.equal(cfg.share, true);

  ({ app, win } = await launch(t, dir));
  await win.waitForSelector('#login-form');
  assert.match(await text(win, '.login-hint'), /Oficina · PC principal/);
  // Primera entrada: obliga a cambiar la contraseña inicial.
  await win.fill('[name=username]', 'admin');
  await win.fill('[name=password]', 'admin123');
  await win.click('#login-form button[type=submit]');
  await win.waitForSelector('#pw-form');
  await win.fill('#pw-form [name=current]', 'admin123');
  await win.fill('#pw-form [name=password]', 'clave-nueva');
  await win.fill('#pw-form [name=password2]', 'clave-nueva');
  await win.click('#pw-form button[type=submit]');
  await win.waitForSelector('.sidebar');
});

test('restaurar una copia, guardar el diagnóstico y registrar errores de la interfaz', async (t) => {
  const dir = dataDir({ demo: true });
  const { app, win, errors } = await launch(t, dir);
  await login(win, 'admin', 'admin123');
  const salesBefore = (await api(win, 'sales.list', {})).length;

  // Copia manual, una venta más y restaurar la copia: la venta desaparece.
  const copy = path.join(dir, 'copia-manual.db');
  await mockDialogs(app, { save: copy, open: copy });
  await go(win, 'settings');
  await win.click('#bk-create');
  await win.waitForFunction(() => document.querySelector('.toast'));
  assert.ok(fs.existsSync(copy));
  await api(win, 'sales.create', { payment_type: 'contado', items: [{ product_id: 5, qty: 1 }], payments: [{ method: 'tarjeta', amount: 800 }] });
  assert.equal((await api(win, 'sales.list', {})).length, salesBefore + 1);
  await win.click('#bk-restore');
  await win.waitForSelector('#login-form', { timeout: 20000 });
  await login(win, 'admin', 'admin123');
  assert.equal((await api(win, 'sales.list', {})).length, salesBefore);

  // Un error de la interfaz queda en el registro, y el diagnóstico lo incluye sin la clave.
  await win.evaluate(() => setTimeout(() => { throw new Error('falla de prueba en la interfaz'); }));
  await new Promise((r) => setTimeout(r, 300));
  const diag = path.join(dir, 'diagnostico.txt');
  await mockDialogs(app, { save: diag, open: copy });
  await go(win, 'settings');
  await win.click('#sp-diag');
  await win.waitForFunction(() => document.querySelector('.toast'));
  const content = fs.readFileSync(diag, 'utf8');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.match(content, /CAPS Shop · diagnóstico/);
  assert.match(content, /Integridad: ok/);
  assert.match(content, /falla de prueba en la interfaz/);
  assert.match(content, /Restaurando la base/);
  assert.ok(!content.includes(cfg.key.replace('-', '')) && !content.includes(cfg.key), 'no incluye la clave de conexión');
  assert.ok(!content.includes('admin123'));
  assert.deepEqual(errors.filter((e) => !/falla de prueba/.test(e)), []);
});

test('si faltan las fotos, se muestra el ícono en lugar de una imagen rota', async (t) => {
  const dir = dataDir({ demo: true });
  fs.rmSync(path.join(dir, 'fotos'), { recursive: true });
  const { win } = await launch(t, dir);
  await login(win, 'admin', 'admin123');
  await go(win, 'products');
  await win.waitForTimeout(300);
  assert.equal(await win.$$eval('img.thumb', (l) => l.length), 0);
  assert.ok((await win.$$eval('.thumb.ph', (l) => l.length)) >= 12);
});
