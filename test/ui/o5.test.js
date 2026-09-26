'use strict';
// Brechas funcionales (O5) en la aplicación real: depósito al banco, saldo inicial, aportes,
// importar productos, etiquetas, impresora de recibos, historial legible y recuperar la contraseña.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const submit = (win) => win.click('.modal-back:last-child .modal-foot .btn.primary');

test('depósito al banco, saldo inicial, aportes, importar, etiquetas, impresora e historial', async (t) => {
  const dir = dataDir({ demo: true });
  const { app, win, errors } = await launch(t, dir);
  await login(win, 'admin', 'admin123');

  // --- Depósito al banco: sale de la caja, no del negocio ---
  const before = (await api(win, 'cash.status')).open;
  await go(win, 'cash');
  await win.click('#cash-bank');
  await win.fill('.modal [name=amount]', '300');
  await win.fill('.modal [name=description]', 'Banco, boleta 55');
  await submit(win);
  assert.ok(await eventually(async () => (await api(win, 'cash.status')).open.bank_deposits === 300));
  assert.equal((await api(win, 'cash.status')).open.expected, before.expected - 300);
  await go(win, 'cash');
  assert.match(await text(win, '.cash-summary'), /Depósitos al banco/);

  // --- Saldo inicial de un cliente ---
  const recBefore = (await api(win, 'reports.dashboard')).receivables;
  const customer = await api(win, 'customers.save', { name: 'Cliente del cuaderno' });
  await win.evaluate((id) => customerDetail(id, () => {}), customer);
  await win.click('.modal-foot button:has-text("Saldo inicial")');
  await win.fill('.modal-back:last-child [name=amount]', '2500');
  await submit(win);
  assert.ok(await eventually(async () => (await api(win, 'reports.dashboard')).receivables === recBefore + 2500));
  await win.keyboard.press('Escape');
  await win.keyboard.press('Escape');

  // --- Aporte del dueño: pestaña en Gastos ---
  const profitBefore = await api(win, 'reports.profit', { period: 'mes' });
  await go(win, 'expenses');
  await win.click('[data-go=capital]');
  await win.waitForSelector('#c-new');
  await win.click('#c-new');
  await win.fill('.modal [name=amount]', '10000');
  await win.fill('.modal [name=description]', 'Capital para mercancía');
  await submit(win);
  assert.ok(await eventually(async () => (await api(win, 'capital.list', {})).length === 1));
  const profit = await api(win, 'reports.profit', { period: 'mes' });
  assert.equal(profit.other_income, profitBefore.other_income, 'el aporte no es ingreso…');
  assert.equal(profit.net_profit, profitBefore.net_profit, '…ni ganancia');

  // --- Importar productos desde CSV (el cuadro de abrir archivo se sustituye) ---
  const csv = path.join(dir, 'lista.csv');
  fs.writeFileSync(csv, '﻿Nombre;Color;Precio detalle;Costo;Existencia\r\nGorra importada;Azul;1.250,00;600;8\r\nSin precio;Rojo;;100;1\r\n');
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, csv);
  await go(win, 'products');
  await win.click('#p-import');
  await win.click('#imp-file');
  await win.waitForSelector('#imp-go');
  assert.match(await text(win, '#imp-preview'), /Precio al detalle es obligatorio/);
  assert.equal((await api(win, 'products.list', { search: 'Gorra importada' })).length, 0, 'la vista previa no guarda');
  await win.click('#imp-go');
  assert.ok(await eventually(async () => (await api(win, 'products.list', { search: 'Gorra importada' })).length === 1));
  const imported = (await api(win, 'products.list', { search: 'Gorra importada' }))[0];
  assert.equal(imported.price_retail, 1250);
  assert.equal(imported.stock, 8);

  // --- Etiquetas: el diálogo muestra los productos; el código se dibuja como SVG ---
  await win.fill('#p-search', 'Gorra importada');
  await eventually(async () => (await win.$$('#page tbody tr')).length === 1);
  await win.click('#p-labels');
  await win.waitForSelector('[data-lb]');
  await win.click('#lb-stock');
  assert.equal(await win.inputValue('[data-lb="0"]'), '8');
  const labels = await win.evaluate((p) => labelsHtml([{ p, qty: 2 }], { size: '40x30', price: true }), imported);
  assert.equal((labels.match(/<svg/g) || []).length, 2);
  assert.match(labels, /size: 40mm 30mm/);
  await win.keyboard.press('Escape');

  // --- Impresora de recibos de esta PC ---
  await go(win, 'settings');
  await win.waitForSelector('#prn-width');
  await win.selectOption('#prn-width', '58');
  assert.ok(await eventually(async () => (await win.evaluate(() => window.capsApi.printer.get())).width === 58));
  assert.ok(fs.existsSync(path.join(dir, 'impresora.json')));
  const receipt = await win.evaluate(() => receiptHtml({ id: 1, created_at: '2026-09-26 10:00:00', sale_type: 'detalle', payment_type: 'contado', user_name: 'x', subtotal: 1, discount: 0, total: 1, change_given: 0, returned_total: 0, balance: 0, status: 'pagado', items: [], payments: [] }, 58));
  assert.match(receipt, /width: 48mm/);

  // --- Historial en español ---
  await go(win, 'audit');
  const hist = await text(win, '#page');
  assert.match(hist, /Depósito al banco/);
  assert.match(hist, /Saldo inicial de cliente/);
  assert.doesNotMatch(hist, /\b(price_retail|category|amount)\b/);

  assert.deepEqual(errors, []);
});

test('recuperar la contraseña del administrador con el código', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  await go(win, 'users');
  await win.click('#rec-new');
  await win.fill('.modal [name=password]', 'admin123');
  await submit(win);
  await win.waitForSelector('#rec-code');
  const code = (await text(win, '#rec-code')).trim();
  assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  await submit(win);
  await win.click('#btn-logout');

  await win.click('#login-recover');
  await win.fill('#rec-form [name=code]', 'AAAA-BBBB-CCCC-DDDD');
  await win.fill('#rec-form [name=password]', 'nueva123');
  await win.fill('#rec-form [name=password2]', 'nueva123');
  await win.click('#rec-form button[type=submit]');
  assert.ok(await eventually(async () => /no son correctos/.test(await text(win, '.login-error'))));
  await win.fill('#rec-form [name=code]', code.toLowerCase());
  await win.click('#rec-form button[type=submit]');
  await win.waitForSelector('#login-form');
  await login(win, 'admin', 'nueva123');
  assert.ok(await win.$('.sidebar'));
  assert.deepEqual(errors, []);
});
