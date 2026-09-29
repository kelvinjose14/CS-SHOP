'use strict';
// Excel con formato (DT-43): el libro se abre, trae los valores con su tipo y se puede volver a importar.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { buildXlsx, serial, colName, sheetName, crc32 } = require('../src/core/xlsx');
const { parseXlsx, readProducts, templateXlsx } = require('../src/core/importer');

// Archivos del ZIP, descomprimidos, para revisar el XML.
function entries(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 30, p + 30 + nameLen);
    const start = p + 30 + nameLen + extra;
    const data = zlib.inflateRawSync(buf.subarray(start, start + size));
    assert.equal(crc32(data), buf.readUInt32LE(p + 14), `CRC de ${name}`);
    out[name] = data.toString('utf8');
    p = start + size;
  }
  return out;
}

test('piezas: CRC, columnas, fechas de Excel y nombre de la hoja', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(serial('2000-01-01'), 36526);
  assert.equal(serial('2026-09-29 18:00:00'), serial('2026-09-29') + 0.75);
  assert.equal(serial('29/09/2026'), null, 'lo que no es una fecha AAAA-MM-DD queda como texto');
  assert.equal(sheetName('Ventas: [septiembre] / 2026'), 'Ventas- -septiembre- - 2026');
  assert.equal(sheetName('Utilidad por producto, marca y categoría'.repeat(2)).length, 31);
});

test('reporte: franja, títulos, tipos, totales, filtros y títulos fijos', () => {
  const buf = buildXlsx({
    title: 'Ventas', subtitle: 'Período: 01/09/2026 – 29/09/2026', business: 'CAPS._.SHOP', currency: 'RD$',
    columns: [{ label: 'No.' }, { label: 'Fecha', type: 'date' }, { label: 'Cliente' }, { label: 'Unid.', type: 'num' }, { label: 'Total', type: 'money' }, { label: 'Margen', type: 'pct' }, { label: 'Código' }],
    rows: [
      ['V-000001', '2026-09-01', 'Ana', 2, 3000, 35.5, '7501234567890'],
      ['V-000002', '2026-09-02 10:30:00', '=HYPERLINK("http://x")', 1, -150.25, null, '00123'],
    ],
    totals: [null, null, null, 3, 2849.75, 34.2, null],
  });
  const t = parseXlsx(buf);
  assert.match(t[0][0], /^CAPS\._\.SHOP\s+Ventas$/);
  assert.equal(t[1][0], 'Período: 01/09/2026 – 29/09/2026');
  assert.deepEqual(t[3], ['No.', 'Fecha', 'Cliente', 'Unid.', 'Total', 'Margen', 'Código']);
  assert.deepEqual(t[4], ['V-000001', String(serial('2026-09-01')), 'Ana', '2', '3000', '0.355', '7501234567890']);
  assert.equal(t[5][1], String(serial('2026-09-02')), 'en una columna de fechas va el día');
  assert.equal(t[5][4], '-150.25');
  assert.equal(t[5][5], '', 'sin valor, celda vacía');
  assert.deepEqual(t[6].slice(0, 6), ['Totales', '', '', '3', '2849.75', '0.342']);

  const x = entries(buf);
  const sheet = x['xl/worksheets/sheet1.xml'];
  // Los textos van como texto: Excel nunca los ejecuta como fórmula, y los códigos no pierden los ceros.
  assert.ok(!sheet.includes('<f>'));
  assert.match(sheet, /<c r="C6" s="\d+" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/x&quot;\)<\/t>/);
  assert.match(sheet, /<c r="G6" s="\d+" t="inlineStr"><is><t xml:space="preserve">00123<\/t>/);
  assert.match(sheet, /<autoFilter ref="A4:G6"\/>/);
  assert.match(sheet, /<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /orientation="landscape" fitToWidth="1" fitToHeight="0"/);
  assert.match(sheet, /Página &amp;P de &amp;N/);
  assert.match(x['xl/styles.xml'], /formatCode="&quot;RD\$&quot; #,##0\.00;\[Red\]-&quot;RD\$&quot; #,##0\.00"/);
  assert.match(x['xl/styles.xml'], /formatCode="dd\/mm\/yyyy"/);
  assert.match(x['xl/workbook.xml'], /<sheet name="Ventas" sheetId="1" r:id="rId1"\/>/);
  assert.match(x['xl/workbook.xml'], /_xlnm\.Print_Titles" localSheetId="0">'Ventas'!\$4:\$4</);
  assert.ok(Object.keys(x).includes('[Content_Types].xml'));
});

test('textos raros y tablas vacías no dañan el archivo', () => {
  const buf = buildXlsx({ title: 'Clientes', columns: [{ label: 'Nombre' }, { label: 'Nota' }], rows: [['Ana\u0001 & <Luis>', 'línea 1\nlínea 2']] });
  const t = parseXlsx(buf);
  assert.deepEqual(t[4], ['Ana & <Luis>', 'línea 1\nlínea 2']);
  // Sin tipo, una columna con fechas "AAAA-MM-DD" (como la última compra) se escribe como fecha.
  const auto = parseXlsx(buildXlsx({ title: 'Clientes', columns: [{ label: 'Última compra' }, { label: 'Mixta' }], rows: [['2026-09-03', '2026-09-03'], ['', 'ayer']] }));
  assert.deepEqual(auto[4], [String(serial('2026-09-03')), '2026-09-03']);
  const empty = entries(buildXlsx({ title: 'Nada', columns: [{ label: 'A', type: 'money' }], rows: [], totals: [0] }))['xl/worksheets/sheet1.xml'];
  assert.ok(!empty.includes('autoFilter'), 'sin filas no hay filtro');
  assert.ok(!empty.includes('Totales'), 'sin filas no hay totales');
});

test('la plantilla en Excel se importa, y un inventario exportado también (sin la franja ni los totales)', () => {
  const tpl = readProducts(templateXlsx(), 'plantilla-productos.xlsx');
  assert.equal(tpl.records.length, 1);
  assert.equal(tpl.records[0].name, 'Gorra New York');
  assert.equal(tpl.records[0].price_retail, '1500');
  assert.equal(tpl.records[0].size, '7 1/4');
  assert.match(entries(templateXlsx())['xl/worksheets/sheet1.xml'], /<pane ySplit="1" topLeftCell="A2"/);

  const inv = buildXlsx({
    title: 'Inventario', business: 'CAPS._.SHOP', subtitle: '2 registros',
    columns: [{ label: 'Producto' }, { label: 'SKU' }, { label: 'Precio detalle', type: 'money' }, { label: 'Existencia', type: 'num' }],
    rows: [['Gorra NY', 'NY-01', 1500, 3], ['Trucker', 'TR-01', 600, 5]],
    totals: [null, null, null, 8],
  });
  const r = readProducts(inv, 'inventario.xlsx');
  assert.deepEqual(r.records.map((x) => [x.name, x.sku, x.price_retail, x.initial_stock]), [['Gorra NY', 'NY-01', '1500', '3'], ['Trucker', 'TR-01', '600', '5']]);
  assert.equal(r.records[0]._line, 5, 'la fila que ve el dueño en Excel');
});
