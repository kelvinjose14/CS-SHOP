'use strict';
// Envoltura sobre node:sqlite (SQLite incluido en Node y Electron, sin módulos nativos).
// La base vive en un archivo en modo WAL: cada transacción escribe solo lo que cambió.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('./schema');

const MAX_STATEMENTS = 300; // tope de la caché de consultas preparadas (hay consultas armadas con filtros)

class Database {
  constructor(file) {
    this.file = file || null;
    this.sql = new DatabaseSync(this.file || ':memory:');
    this.depth = 0;
    this.stmts = new Map();
    this.sql.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
    if (this.file) this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL');
  }

  prepare(query) {
    let stmt = this.stmts.get(query);
    if (!stmt) {
      if (this.stmts.size >= MAX_STATEMENTS) this.stmts.clear();
      stmt = this.sql.prepare(query);
      this.stmts.set(query, stmt);
    }
    return stmt;
  }

  all(query, params = []) {
    return this.prepare(query).all(...normalize(params));
  }

  get(query, params = []) {
    return this.prepare(query).get(...normalize(params));
  }

  value(query, params = []) {
    const row = this.get(query, params);
    return row ? Object.values(row)[0] : undefined;
  }

  run(query, params = []) {
    const r = this.prepare(query).run(...normalize(params));
    return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }

  // Varias sentencias sin parámetros (migraciones).
  exec(query) {
    this.sql.exec(query);
  }

  insert(table, data) {
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    return this.run(sql, keys.map((k) => data[k])).id;
  }

  update(table, id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return;
    this.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), id]);
  }

  // Transacción anidable: sólo la más externa hace COMMIT.
  tx(fn) {
    if (this.depth === 0) this.sql.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      if (this.depth === 0) this.sql.exec('COMMIT');
      return result;
    } catch (err) {
      this.depth--;
      // Si SQLite ya deshizo la transacción, un ROLLBACK taparía el error original.
      if (this.depth === 0 && this.sql.isTransaction) this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  // Punto de guardado dentro de una transacción: si fn falla, se deshace solo lo que hizo fn
  // (por ejemplo, una fila con error en una importación) y el resto de la transacción sigue.
  savepoint(fn) {
    if (this.depth === 0) throw new Error('savepoint() solo dentro de tx()');
    this.sql.exec('SAVEPOINT sp');
    try {
      const result = fn();
      this.sql.exec('RELEASE sp');
      return result;
    } catch (err) {
      this.sql.exec('ROLLBACK TO sp');
      this.sql.exec('RELEASE sp');
      throw err;
    }
  }

  // Copia consistente de la base en un archivo nuevo (respaldos).
  backupTo(target) {
    const tmp = target + '.tmp';
    fs.rmSync(tmp, { force: true });
    this.sql.prepare('VACUUM INTO ?').run(tmp);
    fs.renameSync(tmp, target);
  }

  close() {
    this.stmts.clear();
    this.sql.close();
  }
}

function normalize(params) {
  return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
}

async function openDatabase(file) {
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  try {
    db.tx(() => migrate(db));
  } catch (err) {
    db.close(); // no dejar el archivo abierto (en Windows quedaría bloqueado)
    throw err;
  }
  return db;
}

// Borra el archivo de la base junto con sus archivos WAL.
function removeDatabaseFiles(file) {
  for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
}

// Valida que un archivo sea una base de datos de CAPS Shop antes de restaurarla.
// Se revisa una copia para no tocar el archivo elegido.
async function validateDatabaseFile(file) {
  const probe = path.join(os.tmpdir(), `capsshop-validar-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(file, probe);
  let sql = null;
  try {
    sql = new DatabaseSync(probe);
    const tables = sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('products','sales','users')").get().n;
    return tables === 3 && sql.prepare('PRAGMA quick_check').get().quick_check === 'ok';
  } catch {
    return false;
  } finally {
    if (sql) sql.close();
    removeDatabaseFiles(probe);
  }
}

module.exports = { openDatabase, validateDatabaseFile };
