'use strict';
// Registro de errores para el soporte (src/main/log.js; no depende de Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../src/main/log');

test('guarda errores con su pila, conserva 14 días y entrega las últimas líneas', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-log-'));
  const dir = path.join(data, 'registros');
  fs.mkdirSync(dir);
  for (let d = 1; d <= 20; d++) fs.writeFileSync(path.join(dir, `capsshop-2020-01-${String(d).padStart(2, '0')}.log`), `viejo ${d}\n`);
  fs.writeFileSync(path.join(dir, 'otro-archivo.txt'), 'no se toca');

  log.init(data);
  const kept = fs.readdirSync(dir).filter((f) => f.startsWith('capsshop-'));
  assert.equal(kept.length, 14);
  assert.ok(!kept.includes('capsshop-2020-01-01.log'), 'se borran los más viejos');
  assert.ok(fs.existsSync(path.join(dir, 'otro-archivo.txt')));

  const original = console.error;
  console.error = () => {};
  try {
    log.info('prueba', 'arranque');
    log.error('prueba', 'algo falló', new Error('detalle del error'));
  } finally {
    console.error = original;
  }
  const tail = log.tail(3);
  assert.equal(tail.split('\n').length, 3);
  const all = log.tail(500);
  assert.match(all, /INFO {2}\[prueba\] arranque/);
  assert.match(all, /ERROR \[prueba\] algo falló\n {4}Error: detalle del error/);
  assert.match(all, /viejo 20/, 'incluye archivos anteriores si hacen falta líneas');
});
