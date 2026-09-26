'use strict';
// Lectura de listas de productos en Excel (.xlsx) o CSV para importarlas (RF-NUE-05). Sin bibliotecas:
// un .xlsx es un ZIP con XML; se lee la primera hoja. Devuelve filas con los nombres de campo del
// sistema, a partir de los títulos de la primera fila, escritos como los escribiría el dueño.
const zlib = require('zlib');
const { AppError } = require('./util');

// Títulos aceptados para cada campo (sin acentos, en minúsculas y sin signos).
const HEADERS = {
  name: ['nombre', 'producto', 'descripcion', 'articulo'],
  brand: ['marca'],
  model: ['modelo'],
  color: ['color'],
  size: ['talla', 'tamano', 'medida'],
  sku: ['sku', 'codigo', 'codigo interno', 'referencia', 'ref'],
  barcode: ['codigo de barras', 'codigo barras', 'barras', 'barcode', 'ean', 'upc'],
  cost: ['costo', 'costo unitario', 'precio de compra', 'precio compra'],
  price_retail: ['precio', 'precio detalle', 'precio al detalle', 'precio de venta', 'precio venta', 'detalle'],
  price_wholesale: ['precio mayor', 'precio por mayor', 'precio al por mayor', 'por mayor', 'mayor', 'mayoreo'],
  initial_stock: ['existencia', 'existencia inicial', 'cantidad', 'stock', 'inventario', 'unidades'],
  min_stock: ['minimo', 'stock minimo', 'existencia minima', 'minima'],
  notes: ['notas', 'nota', 'observaciones', 'comentario'],
};
const NUMERIC = ['cost', 'price_retail', 'price_wholesale', 'initial_stock', 'min_stock'];

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function fieldFor(header) {
  const h = plain(header);
  if (!h) return null;
  for (const [field, names] of Object.entries(HEADERS)) if (names.includes(h)) return field;
  return null;
}

// "1.200,50", "1,200.50", "RD$ 1,200" o "1200" → "1200.50". Si no parece número, se deja como vino
// para que la validación diga cuál fila está mal.
function parseNumber(v) {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return String(v ?? '').trim();
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    // Una sola coma con 1 o 2 decimales es decimal (1200,5); si no, separa miles (1,200).
    s = /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.split(',').join('');
  } else if (lastDot >= 0 && !/^-?\d+\.\d+$/.test(s)) {
    s = s.split('.').join(''); // 1.200.000
  }
  // Un solo punto ("1200.50" o "1.200") se toma como decimal, que es como Excel guarda los números.
  return s;
}

/* ---------- CSV ---------- */

function parseCsv(text) {
  const t = String(text).replace(/^﻿/, '');
  // Excel en español separa con punto y coma; en inglés, con coma. Se elige el que más aparece en la primera línea.
  const first = t.split(/\r?\n/, 1)[0];
  const sep = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- XLSX ---------- */

// Entradas de un ZIP a partir del directorio central.
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new AppError('El archivo no es un Excel (.xlsx) válido. Guárdelo de nuevo desde Excel o como CSV.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files[name] = () => {
      const raw = buf.subarray(dataStart, dataStart + size);
      if (method === 0) return raw.toString('utf8');
      if (method === 8) return zlib.inflateRawSync(raw).toString('utf8');
      throw new AppError('El Excel usa una compresión que no se puede leer. Guárdelo como CSV.');
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const xmlText = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const joinRuns = (xml) => xmlText((xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<t[^>]*>|<\/t>/g, '')).join(''));

function colIndex(ref) {
  const letters = String(ref).replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXlsx(buf) {
  const files = unzip(buf);
  const read = (name) => (files[name] ? files[name]() : null);
  const shared = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(joinRuns(si));
  // Primera hoja del libro, según workbook.xml y sus relaciones.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = (wb.match(/<sheet\b[^>]*>/) || [''])[0];
    const rid = (first.match(/r:id="([^"]+)"/) || [])[1];
    const rel = rid && (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`)) || [''])[0];
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new AppError('No se encontró la primera hoja del Excel.');
  const rows = [];
  for (const rowXml of sheet.match(/<row\b[^>]*\/>|<row\b(?:[^>]*[^/])?>[\s\S]*?<\/row>/g) || []) {
    // La fila va en su número de Excel (r="4"), para que los errores digan la fila que ve el dueño.
    const num = Number((rowXml.match(/^<row\b[^>]*\br="(\d+)"/) || [])[1]) || rows.length + 1;
    while (rows.length < num - 1) rows.push([]);
    const row = [];
    for (const c of rowXml.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) || []) {
      const attrs = c.match(/^<c\b[^>]*>/)[0];
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = joinRuns(c);
      else if (type === 'b') value = v === '1' ? 'sí' : 'no';
      else if (v !== undefined) value = xmlText(v);
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

/* ---------- Filas → productos ---------- */

// Convierte la tabla (primera fila con títulos) en filas con los campos del sistema.
function toRecords(table) {
  const nonEmpty = table.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!nonEmpty.length) throw new AppError('El archivo está vacío.');
  const headerRow = table.indexOf(nonEmpty[0]);
  const headers = nonEmpty[0].map((h) => String(h ?? '').trim());
  const fields = headers.map(fieldFor);
  const used = new Set();
  fields.forEach((f, i) => { if (f && used.has(f)) fields[i] = null; else if (f) used.add(f); }); // si se repite un título, vale el primero
  if (!used.has('name')) throw new AppError('No se encontró la columna "Nombre" en la primera fila. Use la plantilla de importación.');
  const records = [];
  for (let i = headerRow + 1; i < table.length; i++) {
    const r = table[i];
    if (!r.some((c) => String(c ?? '').trim() !== '')) continue;
    const rec = { _line: i + 1 };
    fields.forEach((f, j) => {
      if (!f) return;
      const v = String(r[j] ?? '').trim();
      if (v !== '') rec[f] = NUMERIC.includes(f) ? parseNumber(v) : v;
    });
    records.push(rec);
  }
  return { headers, mapped: headers.map((h, i) => ({ header: h, field: fields[i] })), records };
}

// Lee un archivo .xlsx o .csv (Buffer) y devuelve los productos.
function readProducts(buf, fileName = '') {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (/\.xls$/i.test(fileName) && !isZip) throw new AppError('Los archivos .xls (Excel 97-2003) no se pueden leer. En Excel use Archivo → Guardar como → Libro de Excel (.xlsx) o CSV.');
  const table = isZip ? parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  return toRecords(table);
}

// Plantilla CSV con los títulos que se reconocen.
const TEMPLATE = [
  'Nombre;Marca;Modelo;Color;Talla;SKU;Código de barras;Costo;Precio detalle;Precio por mayor;Existencia;Mínimo;Notas',
  'Gorra New York;New Era;59FIFTY;Negro;7 1/4;;;850;1500;1200;10;3;',
].join('\r\n');

module.exports = { HEADERS, fieldFor, parseNumber, parseCsv, parseXlsx, toRecords, readProducts, TEMPLATE };
