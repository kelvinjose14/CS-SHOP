'use strict';
// Dos computadoras en la misma máquina: la principal comparte y otra se conecta, vende y pierde la conexión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dataDir, launch, login, go, settle, text } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);

test('PC principal y PC conectada', async (t) => {
  const aDir = dataDir({ demo: true });
  const bDir = dataDir();

  // A: actualización desde 1.0.0 → principal. Se activa la red.
  let A = await launch(t, aDir);
  await login(A.win, 'admin', 'admin123');
  await go(A.win, 'settings');
  await A.win.click('#net-share');
  await A.win.waitForSelector('.net-key', { timeout: 15000 });
  const key = (await A.win.textContent('.net-key')).trim();
  assert.match(key, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  // B: instalación nueva → se conecta a la principal.
  let B = await launch(t, bDir);
  await B.win.waitForSelector('.setup-choice');
  await B.win.click('.choice[data-mode=terminal]');
  await B.win.fill('#setup-terminal [name=host]', '127.0.0.1');
  await B.win.fill('#setup-terminal [name=key]', key.toLowerCase());
  await B.win.fill('#setup-terminal [name=name]', 'Caja 2');
  await B.win.click('#st-test');
  await B.win.waitForSelector('.toast');
  assert.match(await text(B.win, '.toast'), /Conexión correcta/);
  const closed = B.app.waitForEvent('close');
  await B.win.click('#setup-terminal button[type=submit]');
  await closed;
  const cfg = JSON.parse(fs.readFileSync(path.join(bDir, 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'terminal');
  assert.equal(cfg.name, 'Caja 2');

  B = await launch(t, bDir);
  await B.win.waitForSelector('#login-form');
  assert.match(await text(B.win, '.login-hint'), /Caja 2 · conectada a Principal/);
  await login(B.win, 'vendedor', 'vendedor123');

  // B abre su caja y vende; A ve la venta, la existencia y la caja de B.
  await go(B.win, 'cash');
  await B.win.fill('#open-amount', '500');
  await B.win.click('#open-cash');
  await settle(B.win);
  const before = (await api(A.win, 'products.get', { id: 5 })).stock;
  const saleId = await api(B.win, 'sales.create', { payment_type: 'contado', items: [{ product_id: 5, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  assert.equal((await api(A.win, 'products.get', { id: 5 })).stock, before - 1);
  assert.equal((await api(A.win, 'sales.get', { id: saleId })).id, saleId);
  const others = (await api(A.win, 'cash.status')).others;
  assert.deepEqual(others.map((o) => [o.terminal_name, o.expected]), [['Caja 2', 1300]]);
  // Las fotos de la principal se ven en la PC conectada.
  await go(B.win, 'products');
  const photos = await B.win.$$eval('img.thumb', (imgs) => imgs.map((i) => i.complete && i.naturalWidth > 0));
  assert.ok(photos.length > 0 && photos.every(Boolean), 'fotos por la red');

  // Se cierra la principal: B muestra "Sin conexión". Vuelve: B pide entrar de nuevo.
  await A.close();
  await B.win.evaluate(() => App.go('customers'));
  await B.win.waitForSelector('#offline', { timeout: 30000 });
  A = await launch(t, aDir);
  await A.win.waitForSelector('#login-form');
  // Se reconecta sola cada 5 s; si el aviso sigue, se pulsa "Reintentar ahora" (puede desaparecer antes).
  const retry = await B.win.$('#off-retry');
  if (retry) await retry.click({ timeout: 2000 }).catch(() => {});
  await B.win.waitForSelector('#login-form', { timeout: 30000 });
  assert.match(await text(B.win, '.login-error'), /Su sesión terminó/);
  assert.equal(await B.win.$('#offline'), null);

  assert.deepEqual(A.errors, []);
  assert.deepEqual(B.errors, []);
});
