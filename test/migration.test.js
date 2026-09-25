'use strict';
// La versión 1.0.0 guardaba la base con sql.js. La nueva versión debe abrir ese mismo archivo sin perder nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase, validateDatabaseFile } = require('../src/core/db');
const reports = require('../src/core/services/reports');

const FIXTURE = path.join(__dirname, 'fixtures', 'v1.0.0.db');
const TABLES = ['users', 'products', 'inventory_movements', 'suppliers', 'customers', 'purchases', 'purchase_items', 'purchase_payments',
  'sales', 'sale_items', 'sale_payments', 'returns', 'return_items', 'expenses', 'incomes', 'cash_sessions', 'money_movements', 'audit_log'];
const SUMS = {
  ventas: "SELECT ROUND(SUM(total), 2) FROM sales WHERE status <> 'anulada'",
  por_cobrar: "SELECT ROUND(SUM(balance), 2) FROM sales WHERE status <> 'anulada'",
  por_pagar: "SELECT ROUND(SUM(balance), 2) FROM purchases WHERE status <> 'anulada'",
  existencia: 'SELECT SUM(stock) FROM products',
  valor_costo: 'SELECT ROUND(SUM(stock * cost), 2) FROM products',
  entradas: "SELECT ROUND(SUM(amount), 2) FROM money_movements WHERE direction = 'in'",
  salidas: "SELECT ROUND(SUM(amount), 2) FROM money_movements WHERE direction = 'out'",
};

function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-mig-'));
  const file = path.join(dir, 'capsshop.db');
  fs.copyFileSync(FIXTURE, file);
  return { dir, file };
}

function snapshot(read) {
  const out = {};
  for (const t of TABLES) out[t] = read(`SELECT COUNT(*) FROM ${t}`);
  for (const [k, q] of Object.entries(SUMS)) out[k] = read(q);
  return out;
}

test('abre la base de la versión 1.0.0 y conserva todos los datos', async () => {
  const { file } = tempCopy();
  const raw = new DatabaseSync(file, { readOnly: true });
  const readRaw = (q) => Object.values(raw.prepare(q).get())[0];
  assert.equal(readRaw('PRAGMA user_version'), 1);
  const before = snapshot(readRaw);
  const openCash = readRaw("SELECT COUNT(*) FROM cash_sessions WHERE status = 'abierta'");
  raw.close();
  assert.ok(before.sales > 100, 'la base de muestra tiene datos');

  const db = await openDatabase(file);
  assert.equal(db.value('PRAGMA user_version'), 2);
  assert.equal(db.value('PRAGMA integrity_check'), 'ok');
  assert.equal(db.value('PRAGMA journal_mode'), 'wal');
  assert.deepEqual(snapshot((q) => db.value(q)), before);

  // Las cajas de la 1.0.0 quedan en la PC principal, que sigue funcionando igual.
  assert.deepEqual(db.all('SELECT id, name, active FROM terminals').map((r) => ({ ...r })), [{ id: 1, name: 'Principal', active: 1 }]);
  assert.equal(db.value('SELECT COUNT(*) FROM cash_sessions WHERE terminal_id IS NOT 1'), 0);
  const ctx = { db, user: { id: 1, role: 'admin' }, terminal: 1 };
  const dash = reports.dashboard(ctx);
  assert.equal(dash.cash_open, openCash === 1);
  assert.equal(dash.receivables, before.por_cobrar);
  assert.equal(dash.payables, before.por_pagar);
  db.close();

  // Se vuelve a abrir sin aplicar la migración otra vez.
  const again = await openDatabase(file);
  assert.equal(again.value('PRAGMA user_version'), 2);
  assert.equal(again.value('SELECT COUNT(*) FROM terminals'), 1);
  again.close();
});

test('los respaldos son archivos válidos y se rechazan los que no lo son', async () => {
  const { dir, file } = tempCopy();
  const db = await openDatabase(file);
  const backup = path.join(dir, 'respaldo.db');
  db.backupTo(backup);
  db.close();
  assert.equal(await validateDatabaseFile(backup), true);
  assert.equal(await validateDatabaseFile(FIXTURE), true, 'un respaldo de la 1.0.0 se puede restaurar');
  const bad = path.join(dir, 'otro.db');
  fs.writeFileSync(bad, 'no es una base de datos');
  assert.equal(await validateDatabaseFile(bad), false);
  const restored = await openDatabase(backup);
  assert.equal(restored.value('SELECT COUNT(*) FROM terminals'), 1);
  restored.close();
});
