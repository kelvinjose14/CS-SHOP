'use strict';
// Copias de seguridad y restauración de la PC principal (src/main/backend.js, sin Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocal } = require('../src/main/backend');
const { openDatabase, validateDatabaseFile } = require('../src/core/db');
const { today } = require('../src/core/util');

async function principal(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-resp-'));
  const config = { mode: 'principal', share: false, key: 'AAAA-BBBB', server_id: 'srv' };
  const b = await createLocal({ dataDir, version: '9.9.9', config, saveConfig: () => {} });
  t.after(() => b.close());
  await b.login('admin', 'admin123');
  await b.call('auth.changePassword', { current: 'admin123', password: 'admin123' }); // contraseña inicial
  return { b, dataDir, backups: path.join(dataDir, 'respaldos') };
}

const names = async (b) => (await b.call('products.list', { includeInactive: true })).map((p) => p.name);

test('copia automática diaria: una por día y se conservan las 30 más recientes', async (t) => {
  const { b, backups } = await principal(t);
  fs.mkdirSync(backups, { recursive: true });
  for (let d = 1; d <= 35; d++) fs.writeFileSync(path.join(backups, `capsshop-2020-02-${String(d).padStart(2, '0')}.db`), '');
  b.autoBackup();
  const files = fs.readdirSync(backups).filter((f) => /^capsshop-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  assert.equal(files.length, 30);
  assert.equal(files.at(-1), `capsshop-${today()}.db`);
  assert.equal(await validateDatabaseFile(path.join(backups, files.at(-1))), true);
  const stamp = fs.statSync(path.join(backups, files.at(-1))).mtimeMs;
  b.autoBackup();
  assert.equal(fs.statSync(path.join(backups, files.at(-1))).mtimeMs, stamp, 'no se repite el mismo día');
});

test('la copia incluye lo último registrado aunque siga en el WAL', async (t) => {
  const { b, dataDir } = await principal(t);
  await b.call('products.save', { name: 'Recién creada', price_retail: 100 });
  const copy = path.join(dataDir, 'copia.db');
  b.backupTo(copy);
  const db = await openDatabase(copy);
  assert.equal(db.value("SELECT COUNT(*) FROM products WHERE name = 'Recién creada'"), 1);
  db.close();
});

test('restaurar reemplaza los datos, cierra las sesiones y guarda los datos anteriores', async (t) => {
  const { b, dataDir, backups } = await principal(t);
  await b.call('products.save', { name: 'Antes', price_retail: 100 });
  const snapshot = path.join(dataDir, 'copia.db');
  b.backupTo(snapshot);
  await b.call('products.save', { name: 'Después', price_retail: 100 });

  await b.restore(snapshot);
  assert.equal(b.user(), null, 'hay que volver a entrar');
  await assert.rejects(b.call('products.list'), (e) => e.code === 'AUTH');
  await b.login('admin', 'admin123');
  const now = await names(b);
  assert.ok(now.includes('Antes'));
  assert.ok(!now.includes('Después'));
  assert.ok(fs.readdirSync(backups).some((f) => f.startsWith('antes-de-restaurar-')), 'queda copia de lo que había');
  assert.ok(!fs.existsSync(path.join(dataDir, 'capsshop.db.restaurando')));
  assert.ok(!fs.existsSync(path.join(dataDir, 'capsshop.db.anterior')));
});

test('si la copia elegida no se puede leer, los datos actuales siguen intactos', async (t) => {
  const { b, dataDir } = await principal(t);
  await b.call('products.save', { name: 'Se queda', price_retail: 100 });
  await assert.rejects(b.restore(path.join(dataDir, 'no-existe.db')));
  assert.ok((await names(b)).includes('Se queda'), 'la sesión y los datos siguen');
  const bad = path.join(dataDir, 'otro.db');
  fs.writeFileSync(bad, 'no es una base');
  assert.equal(await b.validate(bad), false);
});

test('solo el administrador copia y restaura; la PC principal limita los intentos de contraseña', async (t) => {
  const { b, dataDir } = await principal(t);
  await b.logout();
  await b.login('vendedor', 'vendedor123');
  await b.call('auth.changePassword', { current: 'vendedor123', password: 'vendedor123' });
  assert.throws(() => b.backupTo(path.join(dataDir, 'x.db')), /permiso/);
  await assert.rejects(b.restore(path.join(dataDir, 'x.db')), /permiso/);
  await b.logout();
  for (let i = 0; i < 5; i++) await assert.rejects(b.login('admin', 'mala'), /incorrectos/);
  await assert.rejects(b.login('admin', 'admin123'), /Demasiados intentos/);
  await b.login('vendedor', 'vendedor123'); // otro usuario no queda bloqueado
});
