'use strict';
// Registro de errores y eventos en <datos>/registros, un archivo por día (se conservan 14).
// Nunca se registran contraseñas, tokens ni la clave de conexión: solo mensajes y pilas de error.
const fs = require('fs');
const path = require('path');
const { now, today } = require('../core/util');

const KEEP_FILES = 14;
const MAX_BYTES = 5 * 1024 * 1024; // por día; si se llena, se deja de escribir hasta el día siguiente
const FILE = /^capsshop-\d{4}-\d{2}-\d{2}\.log$/;

let dir = null;

function init(dataDir) {
  dir = path.join(dataDir, 'registros');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => FILE.test(f)).sort();
    while (files.length > KEEP_FILES) fs.unlinkSync(path.join(dir, files.shift()));
  } catch (err) {
    console.error('No se pudo preparar la carpeta de registros:', err.message);
  }
  return dir;
}

function detail(err) {
  if (!err) return '';
  const text = err.stack || String(err.message || err);
  return '\n' + text.split('\n').map((l) => '    ' + l).join('\n');
}

function write(level, origin, message, err) {
  const line = `${now()} ${level.padEnd(5)} [${origin}] ${message}${detail(err)}\n`;
  if (level === 'ERROR') console.error(line.trimEnd());
  if (!dir) return;
  try {
    const file = path.join(dir, `capsshop-${today()}.log`);
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) return;
    fs.appendFileSync(file, line);
  } catch {
    /* sin disco no hay registro; el programa sigue */
  }
}

// Últimas líneas del registro (de los archivos más recientes), para el diagnóstico.
function tail(lines = 500) {
  if (!dir || !fs.existsSync(dir)) return '';
  const out = [];
  const files = fs.readdirSync(dir).filter((f) => FILE.test(f)).sort().reverse();
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
    out.unshift(...content);
    if (out.length >= lines) break;
  }
  return out.slice(-lines).join('\n');
}

module.exports = {
  init,
  tail,
  get dir() {
    return dir;
  },
  info: (origin, message) => write('INFO', origin, message),
  warn: (origin, message, err) => write('WARN', origin, message, err),
  error: (origin, message, err) => write('ERROR', origin, message, err),
};
