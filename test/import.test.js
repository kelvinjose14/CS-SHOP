'use strict';
// Importar productos (RF-NUE-05), etiquetas con código de barras (RF-NUE-04) e impresora de recibos (RF-NUE-03).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const importer = require('../src/core/importer');
const barcode = require('../src/renderer/js/barcode');
const printer = require('../src/main/printer');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-imp-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = client(createApi(db));
  api.login({ username: 'admin', password: 'admin123' });
  return { dir, db, api, call: (n, p) => api.call(n, p) };
}

// ZIP mínimo (como lo guarda Excel: entradas comprimidas con deflate).
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const n = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(zlib.crc32(data), 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    locals.push(h, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(zlib.crc32(data), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('lee un CSV de Excel en español (punto y coma, acentos, comillas y decimales con coma)', () => {
  const csv = '﻿Nombre;Marca;Color;Talla;Código de barras;Costo;Precio detalle;Precio por mayor;Existencia;Mínimo;Otra cosa\r\n'
    + '"Gorra ""Clásica""";New Era;Negro;7 1/4;7501234567890;"850,50";"1.500,00";1200;10;3;x\r\n'
    + ';;;;;;;;;;\r\n'
    + 'Gorra Snapback;Nike;Rojo;;;RD$ 700;1,250;;5;;\r\n';
  const { records, mapped } = importer.toRecords(importer.parseCsv(csv));
  assert.equal(records.length, 2, 'las filas vacías se saltan');
  assert.deepEqual(records[0], { _line: 2, name: 'Gorra "Clásica"', brand: 'New Era', color: 'Negro', size: '7 1/4', barcode: '7501234567890', cost: '850.50', price_retail: '1500.00', price_wholesale: '1200', initial_stock: '10', min_stock: '3' });
  assert.equal(records[1]._line, 4);
  assert.equal(records[1].cost, '700');
  assert.equal(records[1].price_retail, '1250');
  assert.equal(mapped.find((m) => m.header === 'Otra cosa').field, null);
  assert.throws(() => importer.toRecords([['Precio', 'Marca'], ['10', 'x']]), /Nombre/);
});

test('lee la primera hoja de un Excel (.xlsx) con textos compartidos, en línea y celdas vacías', () => {
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Existencia</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1500.5</v></c><c r="D2"><v>7</v></c></row>
    <row r="3"/>
    <row r="4"><c r="A4" t="inlineStr"><is><r><t>Gorra </t></r><r><t>A&amp;B</t></r></is></c><c r="B4"><v>900</v></c></row>
  </sheetData></worksheet>`;
  const buf = zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="Productos" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Nombre</t></si><si><t>Precio</t></si><si><t>Gorra Ñandú</t></si></sst>',
    'xl/worksheets/sheet1.xml': sheet,
  });
  const { records } = importer.readProducts(buf, 'lista.xlsx');
  assert.deepEqual(records, [
    { _line: 2, name: 'Gorra Ñandú', price_retail: '1500.5', initial_stock: '7' },
    { _line: 4, name: 'Gorra A&B', price_retail: '900' },
  ]);
  assert.throws(() => importer.readProducts(Buffer.from('xx'), 'vieja.xls'), /97-2003/);
});

test('importar: vista previa, filas con error, crear y actualizar por SKU', async () => {
  const { call, db } = await setup();
  const existing = call('products.save', { name: 'Gorra vieja', sku: 'GV-1', cost: 100, price_retail: 300, initial_stock: 4 });
  const rows = [
    { _line: 2, name: 'Gorra nueva', price_retail: '500', cost: '200', initial_stock: '6', min_stock: '2' },
    { _line: 3, name: 'Sin precio' },
    { _line: 4, sku: 'GV-1', price_retail: '350', initial_stock: '99' },
    { _line: 5, name: 'Precio malo', price_retail: 'abc' },
    { _line: 6, name: 'Código repetido', price_retail: '10', barcode: '111' },
    { _line: 7, name: 'Código repetido 2', price_retail: '10', barcode: '111' },
  ];
  const before = db.value('SELECT COUNT(*) FROM products');
  const preview = call('products.import', { rows, dryRun: true });
  assert.equal(db.value('SELECT COUNT(*) FROM products'), before, 'la vista previa no guarda nada');
  assert.deepEqual([preview.created, preview.updated, preview.errors], [2, 1, 3]);
  assert.match(preview.results.find((r) => r.line === 3).message, /Precio al detalle/);
  assert.match(preview.results.find((r) => r.line === 7).message, /código de barras se repite: ya está en la fila 6/);
  assert.match(preview.results.find((r) => r.line === 3).message, /Precio al detalle es obligatorio/);
  assert.match(preview.results.find((r) => r.line === 4).note, /Ajustar existencia/);

  const done = call('products.import', { rows });
  assert.deepEqual([done.created, done.updated, done.errors], [2, 1, 3]);
  const nueva = call('products.list', { search: 'Gorra nueva' })[0];
  assert.equal(nueva.stock, 6);
  assert.equal(nueva.price_retail, 500);
  const vieja = call('products.get', { id: existing });
  assert.equal(vieja.price_retail, 350);
  assert.equal(vieja.name, 'Gorra vieja', 'lo que no viene en el archivo no se toca');
  assert.equal(vieja.stock, 4, 'la existencia de un producto que ya estaba no cambia');
  assert.equal(db.value("SELECT COUNT(*) FROM products WHERE name LIKE 'Sin precio%' OR name LIKE 'Precio malo%'"), 0);
  assert.equal(call('reports.audit', { action: 'importar_productos' }).length, 1);
  assert.throws(() => call('products.import', { rows: [] }), /no tiene productos/);
});

test('Code 128: dígito de control, fin y caracteres no válidos', () => {
  // "PJJ123C": (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 879 mod 103 = 55.
  const v = barcode.code128Values('PJJ123C');
  assert.deepEqual(v.slice(0, 8), [104, 48, 42, 42, 17, 18, 19, 35]);
  assert.equal(v[v.length - 2], 55);
  assert.equal(v[v.length - 1], 106);
  const w = barcode.code128Widths('CS-00001');
  assert.equal(w.reduce((a, b) => a + b, 0), 11 * (1 + 8 + 1) + 13);
  assert.match(barcode.barcodeSvg('CS-00001'), /^<svg[^>]+viewBox="0 0 143 40"/);
  assert.throws(() => barcode.code128Values('Ñ'), /no se puede imprimir/);
  assert.throws(() => barcode.code128Values(''), /vacío/);
});

test('impresora de recibos: por PC, 58 u 80 mm, directa solo con impresora elegida', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-prn-'));
  assert.deepEqual(printer.load(dir), { name: '', width: 80, auto: false });
  printer.save(dir, { name: 'POS-80', width: '58', auto: 1, extra: 'x' });
  assert.deepEqual(printer.load(dir), { name: 'POS-80', width: 58, auto: true });
  assert.equal(printer.normalize({ width: 72 }).width, 80);
  const direct = printer.printOptions({ name: 'POS-80' }, { receipt: true });
  assert.equal(direct.silent, true);
  assert.equal(direct.deviceName, 'POS-80');
  assert.equal(printer.printOptions({ name: '' }, { receipt: true }).silent, false, 'sin impresora elegida, pregunta');
  assert.equal(printer.printOptions({ name: 'POS-80' }).silent, false, 'etiquetas y otros documentos siempre preguntan');
});
