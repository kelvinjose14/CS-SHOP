'use strict';
// Exportar a Excel con formato (DT-43) desde la aplicación real: inventario, un reporte con período y,
// si se elige en la ventana de guardar, CSV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dataDir, launch, login, go } = require('./helpers');
const { parseXlsx } = require('../../src/core/importer');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);

test('exportar inventario y un reporte a Excel con la franja de la tienda, y a CSV si se elige', async (t) => {
  const { app, win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-excel-'));
  const saveAs = (file) => app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, path.join(out, file));

  // Inventario: una fila por gorra, montos como números y los totales de la pantalla.
  await saveAs('inventario.xlsx');
  await go(win, 'products');
  await win.click('#p-export');
  await win.waitForSelector('.toast:has-text("Excel guardado")');
  const inv = parseXlsx(fs.readFileSync(path.join(out, 'inventario.xlsx')));
  const products = await api(win, 'products.list', {});
  assert.match(inv[0][0], /^CAPS\._\.SHOP\s+Inventario$/);
  assert.match(inv[1][0], /\d+ registros\s+·\s+Generado el \d\d\/\d\d\/\d{4} \d\d:\d\d por Administrador$/);
  const head = inv[3];
  assert.ok(head.includes('Existencia') && head.includes('Detalle'), head.join('|'));
  assert.equal(inv.length, 4 + products.length + 1, 'franja, títulos, una fila por gorra y los totales');
  assert.equal(inv.at(-1)[0], 'Totales');
  const stock = head.indexOf('Existencia');
  assert.equal(Number(inv.at(-1)[stock]), products.reduce((s, p) => s + p.stock, 0));
  const price = head.indexOf('Detalle');
  assert.ok(inv.slice(4, -1).every((r) => /^\d+(\.\d+)?$/.test(r[price])), 'los precios son números, no texto con RD$');

  // Un reporte con período: el título del reporte y el período elegido.
  await saveAs('top.xlsx');
  await go(win, 'reports', { report: 'top' });
  await win.click('#r-csv');
  await win.waitForSelector('.toast:has-text("Excel guardado")');
  const top = parseXlsx(fs.readFileSync(path.join(out, 'top.xlsx')));
  assert.match(top[0][0], /Productos más vendidos$/);
  assert.match(top[1][0], /^Período: \d\d\/\d\d\/\d{4} – \d\d\/\d\d\/\d{4}\s+·\s+/);

  // Ventas del mes: lo que se ve en pantalla ("Crédito", "Por mayor"), no los códigos de la base.
  await saveAs('ventas.xlsx');
  await go(win, 'reports', { report: 'ventas' });
  // La base de muestra tiene ventas de agosto y septiembre de 2026: rango fijo, independiente de la fecha de hoy.
  await win.click('.period [data-p="rango"]');
  await win.fill('.period input[name="from"]', '2026-08-01');
  await win.fill('.period input[name="to"]', '2026-09-30');
  await win.dispatchEvent('.period input[name="to"]', 'change');
  await win.waitForSelector('.range-label:has-text("30/09/2026")');
  await win.click('#r-csv');
  await win.waitForSelector('.toast:has-text("Excel guardado")');
  const sales = parseXlsx(fs.readFileSync(path.join(out, 'ventas.xlsx')));
  const col = (label) => sales.slice(4, -1).map((r) => r[sales[3].indexOf(label)]);
  assert.ok(col('Pago').length > 0);
  assert.deepEqual([...new Set(col('Pago'))].filter((v) => !['Contado', 'Crédito'].includes(v)), []);
  assert.deepEqual([...new Set(col('Tipo'))].filter((v) => !['Detalle', 'Por mayor'].includes(v)), []);
  assert.ok(col('Método').every((v) => !/^[a-z]/.test(v)), col('Método').join('|'));
  assert.ok(col('Fecha').every((v) => /^\d+\.\d+$/.test(v)), 'la fecha y hora es una fecha de Excel');

  // CSV: si en la ventana de guardar se elige ese tipo.
  await saveAs('ventas.csv');
  await go(win, 'sales');
  await win.click('#sl-export');
  await win.waitForSelector('.toast:has-text("CSV guardado")');
  const csv = fs.readFileSync(path.join(out, 'ventas.csv'), 'utf8');
  assert.ok(csv.startsWith('\uFEFF'), 'con BOM para que Excel respete los acentos');
  assert.ok(!fs.existsSync(path.join(out, 'ventas.csv.xlsx')));

  // Si no se puede escribir (en Windows, el mismo archivo abierto en Excel), se explica sin "error inesperado".
  fs.mkdirSync(path.join(out, 'abierto.xlsx'));
  await saveAs('abierto.xlsx');
  await go(win, 'products');
  await win.click('#p-export');
  await win.waitForSelector('.toast.error:has-text("No se pudo guardar \\"abierto.xlsx\\"")');
  assert.deepEqual(errors, []);
});
