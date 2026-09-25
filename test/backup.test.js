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

test('copia fuera de la PC: base y fotos, solo lo nuevo, 30 copias y aviso de 7 días', async (t) => {
  const { b, dataDir } = await principal(t);
  assert.equal(b.externalStatus().overdue, true, 'sin configurar hay aviso');
  const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-usb-'));
  const photos = path.join(dataDir, 'fotos');
  fs.mkdirSync(photos, { recursive: true });
  fs.writeFileSync(path.join(photos, 'a.jpg'), 'foto a');

  const st = b.setExternalDir(usb);
  const target = path.join(usb, 'CAPS Shop respaldos');
  assert.equal(st.overdue, false);
  assert.ok(st.last_at);
  assert.ok(fs.existsSync(path.join(target, `capsshop-${today()}.db`)));
  assert.equal(await validateDatabaseFile(path.join(target, `capsshop-${today()}.db`)), true);
  assert.equal(fs.readFileSync(path.join(target, 'fotos', 'a.jpg'), 'utf8'), 'foto a');

  // El mismo día no se repite sola; "Copiar ahora" sí, y solo copia las fotos nuevas.
  assert.equal(b.externalBackup(), null);
  fs.writeFileSync(path.join(photos, 'b.jpg'), 'foto b');
  for (let d = 1; d <= 31; d++) fs.writeFileSync(path.join(target, `capsshop-2020-03-${String(d).padStart(2, '0')}.db`), '');
  b.backupNow();
  assert.ok(fs.existsSync(path.join(target, 'fotos', 'b.jpg')));
  assert.equal(fs.readdirSync(target).filter((f) => /^capsshop-.*\.db$/.test(f)).length, 30);

  // Memoria desconectada: queda el error y el aviso, sin romper nada.
  fs.rmSync(usb, { recursive: true });
  assert.equal(b.externalBackup({ force: true }), null);
  assert.match(b.externalStatus().last_error, /No se encontró la carpeta/);
  assert.throws(() => b.backupNow(), /No se encontró la carpeta/);
  assert.throws(() => b.setExternalDir(path.join(usb, 'no-existe')), /no existe/);
});

test('restaurar una copia externa trae también las fotos', async (t) => {
  const { b, dataDir } = await principal(t);
  const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-usb-'));
  const photos = path.join(dataDir, 'fotos');
  fs.mkdirSync(photos, { recursive: true });
  fs.writeFileSync(path.join(photos, 'gorra.jpg'), 'foto');
  b.setExternalDir(usb);
  fs.rmSync(photos, { recursive: true }); // el disco se dañó: se perdieron las fotos
  await b.restore(path.join(usb, 'CAPS Shop respaldos', `capsshop-${today()}.db`));
  assert.equal(fs.readFileSync(path.join(photos, 'gorra.jpg'), 'utf8'), 'foto');
});

test('la copia externa se considera vencida después de 7 días', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-resp-'));
  const old = new Date(Date.now() - 8 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const lastAt = `${old.getFullYear()}-${pad(old.getMonth() + 1)}-${pad(old.getDate())} 10:00:00`;
  const config = { mode: 'principal', share: false, key: 'AAAA-BBBB', server_id: 'srv', external_backup: { dir: dataDir, last_at: lastAt } };
  const b = await createLocal({ dataDir, version: '9.9.9', config, saveConfig: () => {} });
  t.after(() => b.close());
  const st = b.externalStatus();
  assert.ok(st.days_since >= 7);
  assert.equal(st.overdue, true);
});
