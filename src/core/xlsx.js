'use strict';
// Libros de Excel (.xlsx) con formato, sin bibliotecas: un .xlsx es un ZIP con XML (DT-43).
// Una hoja con la franja de la tienda (nombre, título y período), los títulos de las columnas en rojo,
// filas alternadas, montos con la moneda, fechas de verdad, totales, filtros, títulos fijos al bajar
// e impresión en una página de ancho.
const zlib = require('zlib');

const BRAND = 'E3102F';
const INK = '16161A';
const LINE = 'E6E6EA';
const ZEBRA = 'F7F7F9';
const SOFT = 'FDE8EB';
const MUTED = 'C9C9CF';

/* ---------- ZIP ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((Math.max(when.getFullYear(), 1980) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const packed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    locals.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

/* ---------- Valores ---------- */

// Texto seguro para XML: sin caracteres de control (Excel no abre el archivo si los tiene).
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').slice(0, 32767);
const esc = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// "2026-09-29" o "2026-09-29 14:30:00" → número de serie de Excel (días desde el 30/12/1899).
function serial(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v ?? ''));
  if (!m) return null;
  const days = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  const secs = (+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0));
  return days + secs / 86400;
}

const TYPES = ['text', 'money', 'int', 'dec', 'pct', 'date', 'datetime'];

// Tipo final de la columna y valor de cada celda: número, fecha (serie) o texto.
function prepare(col, values) {
  let type = col.type || 'auto';
  // Sin tipo: fechas "AAAA-MM-DD" (con o sin hora) son fechas; números, números; lo demás, texto.
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (type === 'auto' && present.length && present.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) type = 'date';
  else if (type === 'auto' && present.length && present.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(v))) type = 'datetime';
  if (type === 'num' || type === 'auto') {
    const nums = values.filter((v) => v !== null && v !== undefined && v !== '');
    if (type === 'auto' && !nums.every((v) => typeof v === 'number' && Number.isFinite(v))) type = 'text';
    else type = nums.every((v) => Number.isInteger(Number(v))) ? 'int' : 'dec';
  }
  const cells = values.map((v) => {
    if (v === null || v === undefined || v === '') return null;
    if (type === 'text') return { s: v };
    if (type === 'date' || type === 'datetime') {
      const n = serial(v);
      return n === null ? { s: v } : { n: type === 'date' ? Math.floor(n) : n };
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return { s: v };
    return { n: type === 'pct' ? n / 100 : n };
  });
  return { type, cells };
}

// Ancho de columna (en caracteres) según lo que se ve: títulos y valores ya con formato.
function shown(type, cell, currency) {
  if (!cell) return 0;
  if (cell.s !== undefined) return Math.max(...clean(cell.s).split('\n').map((l) => l.length));
  const n = cell.n;
  if (type === 'date') return 10;
  if (type === 'datetime') return 16;
  if (type === 'pct') return (n * 100).toFixed(1).length + 1;
  const digits = Math.abs(n).toFixed(type === 'int' ? 0 : 2);
  const groups = Math.floor((digits.split('.')[0].length - 1) / 3);
  return digits.length + groups + (n < 0 ? 1 : 0) + (type === 'money' ? currency.length + 1 : 0);
}

/* ---------- Estilos ---------- */

// Índices de estilo: 0 normal, 1 franja del título, 2 franja del subtítulo, 3 títulos de columnas; luego
// cada tipo en tres variantes: fila normal, fila alternada y fila de totales.
const VARIANTS = ['row', 'zebra', 'total'];
const xf = (type, variant) => 4 + TYPES.indexOf(type) * 3 + VARIANTS.indexOf(variant);

function stylesXml(currency) {
  const cur = String(currency || '').replace(/"/g, '');
  const moneyCode = `"${cur}" #,##0.00;[Red]-"${cur}" #,##0.00`;
  const fmt = { text: 0, money: 164, int: 3, dec: 4, pct: 165, date: 166, datetime: 167 };
  const fonts = [
    `<font><sz val="11"/><color rgb="FF${INK}"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="10"/><color rgb="FF${MUTED}"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FF${INK}"/><name val="Calibri"/><family val="2"/></font>`,
  ];
  const solid = (c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', solid(INK), solid(BRAND), solid(ZEBRA), solid(SOFT)];
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    `<border><left/><right/><top/><bottom style="thin"><color rgb="FF${LINE}"/></bottom><diagonal/></border>`,
    `<border><left/><right/><top style="medium"><color rgb="FF${INK}"/></top><bottom style="thin"><color rgb="FF${LINE}"/></bottom><diagonal/></border>`,
  ];
  // Un espacio a cada lado (indent) para que un número alineado a la derecha no quede pegado al texto
  // de la columna siguiente.
  const align = (t) => (t === 'text' ? '<alignment horizontal="left" vertical="center" indent="1"/>'
    : t === 'date' || t === 'datetime' ? '<alignment horizontal="center" vertical="center"/>' : '<alignment horizontal="right" vertical="center" indent="1"/>');
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  ];
  for (const t of TYPES) {
    for (const v of VARIANTS) {
      const font = v === 'total' ? 4 : 0;
      const fill = v === 'zebra' ? 4 : v === 'total' ? 5 : 0;
      const border = v === 'total' ? 2 : 1;
      xfs.push(`<xf numFmtId="${fmt[t]}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align(t)}</xf>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="${esc(moneyCode)}"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/><numFmt numFmtId="167" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

/* ---------- Hoja ---------- */

// Nombre de hoja válido para Excel: hasta 31 caracteres, sin : \ / ? * [ ].
const sheetName = (s) => clean(s).replace(/[:\\/?*[\]]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Hoja1';

/**
 * Arma el libro.
 *   title, subtitle, business (nombre de la tienda), currency ("RD$")
 *   columns: [{ label, type: 'text'|'money'|'num'|'pct'|'date'|'datetime'|'auto' }]
 *   rows: [[valor, …]]   (fechas "AAAA-MM-DD"; porcentajes como 35.2)
 *   totals: [valor | null, …]   (opcional; la primera columna dice "Totales" si no trae valor)
 *   banner: false para una hoja sin franja (la plantilla de importación)
 */
function buildXlsx({ title = 'Reporte', subtitle = '', business = '', currency = 'RD$', columns, rows = [], totals = null, banner = true, now = new Date() }) {
  const cols = columns.map((c, i) => ({ ...c, ...prepare(c, rows.map((r) => r[i])) }));
  const headRow = banner ? 4 : 1;
  const first = headRow + 1;
  const last = headRow + rows.length;
  const lastCol = colName(Math.max(cols.length, 1) - 1);
  const totalCells = totals && rows.length ? cols.map((c, i) => {
    const v = totals[i];
    if (v === null || v === undefined || v === '') return i === 0 ? { s: 'Totales' } : null;
    return prepare({ type: c.type === 'int' || c.type === 'dec' ? 'num' : c.type }, [v]).cells[0];
  }) : null;

  // Anchos: lo más largo que se ve en la columna (más el margen de cada lado), entre 9 y 50 caracteres.
  // Los títulos largos se parten en dos líneas.
  const widths = cols.map((c, i) => {
    let w = Math.min(clean(c.label).length, 20) + 3;
    for (const cell of c.cells) w = Math.max(w, shown(c.type, cell, currency) + 4);
    if (totalCells && totalCells[i]) w = Math.max(w, shown(c.type, totalCells[i], currency) + 5);
    return Math.min(Math.max(w, 9), 50);
  });
  // La franja del título debe caber en las columnas (el texto grande ocupa más).
  if (banner && cols.length) {
    const need = Math.max((clean(business).length + clean(title).length + 5) * 1.5, clean(subtitle).length * 0.95);
    const have = widths.reduce((s, w) => s + w, 0);
    if (have < need) widths[widths.length - 1] += Math.ceil(need - have);
  }

  const cellXml = (ref, cell, style) => {
    if (!cell) return `<c r="${ref}" s="${style}"/>`;
    if (cell.s !== undefined) return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.s)}</t></is></c>`;
    return `<c r="${ref}" s="${style}"><v>${cell.n}</v></c>`;
  };
  const band = (r, style, content, ht) => `<row r="${r}" ht="${ht}" customHeight="1">${content}${cols.slice(1).map((_, i) => `<c r="${colName(i + 1)}${r}" s="${style}"/>`).join('')}</row>`;
  const out = [];
  if (banner) {
    const run = (color, text) => `<r><rPr><b/><sz val="16"/><color rgb="FF${color}"/><rFont val="Calibri"/><family val="2"/></rPr><t xml:space="preserve">${esc(text)}</t></r>`;
    const titleRuns = business ? run(BRAND, business) + run('FFFFFF', `   ${title}`) : run('FFFFFF', title);
    out.push(band(1, 1, `<c r="A1" s="1" t="inlineStr"><is>${titleRuns}</is></c>`, 32));
    out.push(band(2, 2, cellXml('A2', subtitle ? { s: subtitle } : null, 2), 20));
    out.push('<row r="3" ht="6" customHeight="1"/>');
  }
  out.push(`<row r="${headRow}" ht="30" customHeight="1">${cols.map((c, i) => cellXml(`${colName(i)}${headRow}`, { s: c.label }, 3)).join('')}</row>`);
  rows.forEach((_, j) => {
    const r = first + j;
    const variant = j % 2 ? 'zebra' : 'row';
    out.push(`<row r="${r}">${cols.map((c, i) => cellXml(`${colName(i)}${r}`, c.cells[j], xf(c.type, variant))).join('')}</row>`);
  });
  if (totalCells) {
    const r = last + 1;
    out.push(`<row r="${r}" ht="22" customHeight="1">${cols.map((c, i) => cellXml(`${colName(i)}${r}`, totalCells[i], xf(i === 0 && totalCells[i] && totalCells[i].s !== undefined ? 'text' : c.type, 'total'))).join('')}</row>`);
  }

  const name = sheetName(title);
  const quoted = `'${name.replace(/'/g, "''")}'`;
  const filter = rows.length && cols.length ? `A${headRow}:${lastCol}${last}` : '';
  const endRow = last + (totalCells ? 1 : 0);
  const landscape = cols.length > 6;
  // En el pie de página, "&" es un código de Excel: el texto lo lleva doble.
  const footer = `&amp;L&amp;8${esc((business ? `${business} · ${title}` : title).replace(/&/g, '&&'))}&amp;R&amp;8Página &amp;P de &amp;N`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF${BRAND}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastCol}${Math.max(endRow, headRow)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headRow}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${first}" sqref="A${first}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18" customHeight="1"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${out.join('')}</sheetData>
${filter ? `<autoFilter ref="${filter}"/>` : ''}
<printOptions horizontalCentered="1"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="1" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>${footer}</oddFooter></headerFooter>
</worksheet>`;

  const defined = [
    filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${esc(`${quoted}!$A$${headRow}:$${lastCol}$${last}`)}</definedName>` : '',
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">${esc(`${quoted}!$${headRow}:$${headRow}`)}</definedName>`,
  ].join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews>
<sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames>${defined}</definedNames>
</workbook>`;
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(business || 'CAPS Shop')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CAPS Shop</Application></Properties>`],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml(currency)],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  return zip(files, now);
}

module.exports = { buildXlsx, serial, colName, sheetName, crc32 };
