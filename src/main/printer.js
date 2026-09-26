'use strict';
// Impresora de recibos de esta computadora (RF-NUE-03, DT-23). Cada PC tiene la suya, así que se
// guarda en impresora.json de esta PC y no en la base de datos (que en red es de la principal).
//   { name: '' = preguntar cada vez | nombre de la impresora de Windows, width: 58 | 80, auto: bool }
const fs = require('fs');
const path = require('path');

const DEFAULTS = { name: '', width: 80, auto: false };
const file = (dir) => path.join(dir, 'impresora.json');

function normalize(p = {}) {
  return {
    name: typeof p.name === 'string' ? p.name.slice(0, 200) : DEFAULTS.name,
    width: Number(p.width) === 58 ? 58 : 80,
    auto: !!p.auto,
  };
}

function load(dir) {
  try {
    return normalize(JSON.parse(fs.readFileSync(file(dir), 'utf8')));
  } catch {
    return { ...DEFAULTS };
  }
}

function save(dir, p) {
  const out = normalize(p);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir) + '.tmp', JSON.stringify(out, null, 2));
  fs.renameSync(file(dir) + '.tmp', file(dir));
  return out;
}

// Opciones de webContents.print. Un recibo con impresora elegida sale directo, sin ventana.
// Todo lo demás (o si no hay impresora elegida) abre el cuadro de impresión de Windows.
function printOptions(settings, { receipt = false } = {}) {
  if (receipt && settings.name) {
    return { silent: true, deviceName: settings.name, printBackground: true, margins: { marginType: 'none' } };
  }
  return { silent: false, printBackground: true };
}

module.exports = { DEFAULTS, normalize, load, save, printOptions };
