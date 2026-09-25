'use strict';
// Envoltura sobre sql.js (SQLite en WebAssembly, sin dependencias nativas).
// La base de datos vive en memoria y se guarda en disco después de cada transacción.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { migrate } = require('./schema');

function wasmPath() {
  const p = require.resolve('sql.js/dist/sql-wasm.wasm');
  // En la app empaquetada el .wasm se extrae fuera del asar.
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

class Database {
  constructor(sqlDb, file) {
    this.sql = sqlDb;
    this.file = file;
    this.depth = 0;
    this.dirty = false;
    this.pragmas();
  }

  pragmas() {
    this.sql.run('PRAGMA foreign_keys = ON');
  }

  all(query, params = []) {
    const stmt = this.sql.prepare(query);
    try {
      stmt.bind(normalize(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(query, params = []) {
    return this.all(query, params)[0];
  }

  value(query, params = []) {
    const row = this.get(query, params);
    return row ? Object.values(row)[0] : undefined;
  }

  run(query, params = []) {
    this.sql.run(query, normalize(params));
    this.dirty = true;
    return {
      id: this.value('SELECT last_insert_rowid() AS id'),
      changes: this.sql.getRowsModified(),
    };
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

  // Transacción anidable: sólo la más externa hace COMMIT y guarda en disco.
  tx(fn) {
    if (this.depth === 0) this.sql.run('BEGIN');
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      if (this.depth === 0) {
        this.sql.run('COMMIT');
        this.save();
      }
      return result;
    } catch (err) {
      this.depth--;
      if (this.depth === 0) this.sql.run('ROLLBACK');
      throw err;
    }
  }

  save() {
    if (!this.file || !this.dirty) return;
    const data = this.sql.export();
    this.pragmas(); // export() reinicia los pragmas
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }

  exportBuffer() {
    const data = this.sql.export();
    this.pragmas();
    return Buffer.from(data);
  }

  close() {
    this.save();
    this.sql.close();
  }
}

function normalize(params) {
  if (Array.isArray(params)) return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  return params;
}

let SQL = null;
async function openDatabase(file) {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmPath() });
  let sqlDb;
  if (file && fs.existsSync(file)) {
    sqlDb = new SQL.Database(fs.readFileSync(file));
  } else {
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
    sqlDb = new SQL.Database();
  }
  const db = new Database(sqlDb, file);
  db.tx(() => migrate(db));
  db.dirty = true;
  db.save();
  return db;
}

// Valida que un archivo sea una base de datos de CAPS Shop antes de restaurarla.
async function validateDatabaseFile(file) {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const probe = new SQL.Database(fs.readFileSync(file));
  try {
    const ok = probe.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','sales','users')");
    return ok.length > 0 && ok[0].values.length === 3;
  } finally {
    probe.close();
  }
}

module.exports = { openDatabase, validateDatabaseFile };
