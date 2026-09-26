'use strict';
// Lo que hay detrás de la interfaz, según el modo de esta computadora:
//  - local: PC principal. La base y la lógica corren en este proceso; si se comparte, atiende a las demás PCs.
//  - remoto: PC conectada. Todo se pide a la PC principal por la red.
// Las dos variantes ofrecen las mismas funciones a main.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, validateDatabaseFile } = require('../core/db');
const { createApi } = require('../core/api');
const { AppError, today, now } = require('../core/util');
const { getSetting } = require('../core/services/common');
const net = require('../net/server');
const { createClient } = require('../net/client');
const log = require('./log');

const PRINCIPAL = 1;
const EXTERNAL_FOLDER = 'CAPS Shop respaldos';
const EXTERNAL_KEEP = 30;
const EXTERNAL_WARN_DAYS = 7;
const DAILY_DB = /^capsshop-\d{4}-\d{2}-\d{2}\.db$/;

// Copia a "to" los archivos de "from" que falten o hayan cambiado de tamaño. Devuelve cuántos copió.
function syncFolder(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f);
    const dst = path.join(to, f);
    const st = fs.statSync(src);
    if (!st.isFile()) continue;
    if (fs.existsSync(dst) && fs.statSync(dst).size === st.size) continue;
    fs.copyFileSync(src, dst);
    copied++;
  }
  return copied;
}

// Direcciones IPv4 de esta PC en la red local (para escribirlas en las demás PCs).
function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

async function createLocal({ dataDir, version, config, saveConfig }) {
  const dbFile = path.join(dataDir, 'capsshop.db');
  const photosDir = path.join(dataDir, 'fotos');
  const backupsDir = path.join(dataDir, 'respaldos');
  let db = await openDatabase(dbFile);
  let api = createApi(db);
  let token = null;
  let server = null;
  let discovery = null;
  let networkError = null;
  const logins = net.limiter(5); // mismo límite de intentos que por la red

  const terminalName = () => db.value('SELECT name FROM terminals WHERE id = ?', [PRINCIPAL]);
  const info = () => ({ business_name: getSetting(db, 'business_name'), server_id: config.server_id, name: terminalName() });

  async function startSharing() {
    if (server) return;
    networkError = null;
    try {
      server = net.createServer({ getApi: () => api, getKey: () => config.key, info, version, photosDir, log });
      const port = await net.listen(server, config.port || net.PORT);
      log.info('red', `Compartiendo en la red, puerto ${port}`);
      discovery = await net.startDiscovery({ info, httpPort: () => port, log }).catch((err) => {
        log.error('red', 'No se pudo iniciar el descubrimiento en la red', err);
        return null;
      });
    } catch (err) {
      server = null;
      networkError = err.code === 'EADDRINUSE'
        ? `El puerto ${config.port || net.PORT} está ocupado por otro programa. Cierre el otro programa o reinicie la computadora.`
        : `No se pudo compartir en la red: ${err.message}`;
      log.error('red', networkError, err);
    }
  }

  async function stopSharing() {
    if (discovery) discovery.close();
    if (server) await net.close(server);
    server = null;
    discovery = null;
  }

  function requireAdmin() {
    const u = api.user(token);
    if (!u || u.role !== 'admin') throw new AppError('No tiene permiso para realizar esta operación.', 'FORBIDDEN');
  }

  if (config.share) await startSharing();
  let externalTimer = null;

  const self = {
    mode: 'principal',
    info() {
      return {
        mode: 'principal',
        terminal: { id: PRINCIPAL, name: terminalName() },
        user: api.user(token),
        network: {
          share: !!config.share,
          sharing: !!server,
          error: networkError,
          key: config.key,
          port: config.port || net.PORT,
          addresses: localAddresses(),
          hostname: os.hostname(),
        },
      };
    },
    async login(username, password) {
      const who = String(username || '').toLowerCase();
      if (logins.blocked(who)) throw new AppError('Demasiados intentos fallidos. Espere un minuto e intente de nuevo.', 'RATE');
      let r;
      try {
        r = api.login({ username, password }, { terminal: PRINCIPAL });
      } catch (err) {
        if (err.code === 'AUTH') logins.fail(who);
        throw err;
      }
      logins.clear(who);
      token = r.token;
      return r.user;
    },
    // Código de recuperación del administrador (RF-NUE-06). Mismo límite de intentos que la entrada.
    async recover({ username, code, password }) {
      const who = `recuperar:${String(username || '').toLowerCase()}`;
      if (logins.blocked(who)) throw new AppError('Demasiados intentos fallidos. Espere un minuto e intente de nuevo.', 'RATE');
      try {
        api.recover({ username, code, password }, { terminal: PRINCIPAL });
      } catch (err) {
        if (err.code === 'AUTH') logins.fail(who);
        throw err;
      }
      logins.clear(who);
      log.info('usuarios', `Contraseña de "${username}" recuperada con el código`);
      return true;
    },
    async logout() {
      api.logout(token);
      token = null;
    },
    user: () => api.user(token),
    requireAdmin,
    async call(name, params) {
      return net.callApi(api, token, name, params, photosDir);
    },
    async photo(name) {
      return net.readPhoto(photosDir, name);
    },
    async ping() {
      return true;
    },

    // Datos para el soporte (Guardar diagnóstico). Sin la clave ni datos personales.
    diagnostics() {
      const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const size = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
      const backups = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((f) => f.endsWith('.db')).sort().slice(-5) : [];
      return [
        `Base: versión de esquema ${db.value('PRAGMA user_version')}, ${Math.round(size(dbFile) / 1024)} KB (+ WAL ${Math.round(size(dbFile + '-wal') / 1024)} KB)`,
        `Integridad: ${db.value('PRAGMA quick_check')}`,
        `Tablas: ${tables.map((t) => `${t.name}=${db.value(`SELECT COUNT(*) FROM "${t.name}"`)}`).join(', ')}`,
        `Red: compartir=${!!config.share}, activa=${!!server}, puerto=${config.port || net.PORT}, direcciones=${localAddresses().join(' ') || 'ninguna'}${networkError ? `, error: ${networkError}` : ''}`,
        `Computadoras: ${db.all('SELECT name, active, last_seen_at FROM terminals ORDER BY id').map((t) => `${t.name}${t.active ? '' : ' (desactivada)'} ${t.last_seen_at || ''}`.trim()).join('; ')}`,
        `Últimos respaldos: ${backups.join(', ') || 'ninguno'}`,
      ];
    },

    // ---------- Red (solo administrador) ----------
    async setShare(on) {
      requireAdmin();
      config.share = !!on;
      saveConfig(config);
      if (on) await startSharing();
      else await stopSharing();
    },
    async newKey() {
      requireAdmin();
      config.key = net.newKey();
      saveConfig(config);
      return config.key;
    },

    // ---------- Respaldos ----------
    backupsDir,

    // Copia fuera de esta PC (memoria USB o carpeta de OneDrive / Google Drive): base del día y fotos.
    externalStatus() {
      const ext = config.external_backup || {};
      const days = ext.last_at ? Math.floor((Date.now() - new Date(ext.last_at.replace(' ', 'T')).getTime()) / 86400000) : null;
      return {
        dir: ext.dir || null,
        last_at: ext.last_at || null,
        last_error: ext.last_error || null,
        days_since: days,
        // Aviso: nunca configurada, nunca copiada, o más de 7 días sin copia.
        overdue: !ext.dir || days === null || days >= EXTERNAL_WARN_DAYS,
      };
    },
    externalBackup({ force = false } = {}) {
      const ext = config.external_backup || {};
      if (!ext.dir) return null;
      if (!force && ext.last_at && ext.last_at.slice(0, 10) === today()) return null; // ya se copió hoy
      const target = path.join(ext.dir, EXTERNAL_FOLDER);
      const save = (changes) => {
        config.external_backup = { ...ext, ...changes };
        saveConfig(config);
      };
      if (!fs.existsSync(ext.dir)) {
        const msg = `No se encontró la carpeta ${ext.dir}. Si es una memoria USB, conéctela; la copia se hará sola.`;
        if (ext.last_error !== msg) log.warn('respaldo', msg);
        save({ last_error: msg });
        return null;
      }
      try {
        fs.mkdirSync(target, { recursive: true });
        db.backupTo(path.join(target, `capsshop-${today()}.db`));
        const photos = syncFolder(photosDir, path.join(target, 'fotos'));
        const files = fs.readdirSync(target).filter((f) => DAILY_DB.test(f)).sort();
        while (files.length > EXTERNAL_KEEP) fs.unlinkSync(path.join(target, files.shift()));
        save({ last_at: now(), last_error: null });
        log.info('respaldo', `Copia externa en ${target} (${photos} fotos nuevas)`);
        return { dir: target, photos };
      } catch (err) {
        const msg = `No se pudo copiar a ${ext.dir}: ${err.message}`;
        log.error('respaldo', msg, err);
        save({ last_error: msg });
        return null;
      }
    },
    setExternalDir(dir) {
      requireAdmin();
      if (dir) {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new AppError('La carpeta elegida no existe.');
        const probe = path.join(dir, `.capsshop-prueba-${process.pid}`);
        try {
          fs.writeFileSync(probe, 'ok');
          fs.rmSync(probe);
        } catch {
          throw new AppError('No se puede escribir en esa carpeta. Elija otra (por ejemplo, la memoria USB o la carpeta de OneDrive).');
        }
      }
      config.external_backup = dir ? { dir, last_at: null, last_error: null } : null;
      saveConfig(config);
      log.info('respaldo', dir ? `Copia externa configurada en ${dir}` : 'Copia externa desactivada');
      if (dir) self.externalBackup({ force: true });
      return self.externalStatus();
    },
    backupNow() {
      requireAdmin();
      if (!(config.external_backup || {}).dir) throw new AppError('Elija primero la carpeta de la copia externa.');
      self.externalBackup({ force: true });
      const st = self.externalStatus();
      if (st.last_error) throw new AppError(st.last_error);
      return st;
    },
    // Copia automática diaria (se conservan las últimas 30).
    autoBackup() {
      try {
        fs.mkdirSync(backupsDir, { recursive: true });
        const target = path.join(backupsDir, `capsshop-${today()}.db`);
        if (!fs.existsSync(target)) db.backupTo(target);
        const files = fs.readdirSync(backupsDir).filter((f) => /^capsshop-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        while (files.length > 30) fs.unlinkSync(path.join(backupsDir, files.shift()));
      } catch (err) {
        log.error('respaldo', 'Falló la copia automática diaria', err);
      }
    },
    backupTo(file) {
      requireAdmin();
      db.backupTo(file);
    },
    async validate(file) {
      requireAdmin();
      return validateDatabaseFile(file);
    },
    // Reemplaza la base por un respaldo. Todas las sesiones (de todas las PCs) se cierran.
    async restore(file) {
      requireAdmin();
      fs.mkdirSync(backupsDir, { recursive: true });
      db.backupTo(path.join(backupsDir, `antes-de-restaurar-${Date.now()}.db`));
      log.info('respaldo', `Restaurando la base desde ${file}`);
      // Se copia al lado antes de tocar la base: si la copia falla, los datos actuales siguen intactos.
      const incoming = dbFile + '.restaurando';
      fs.copyFileSync(file, incoming);
      api.closeAll();
      db.close(); // al cerrar, SQLite vuelca el WAL al archivo principal
      const previous = dbFile + '.anterior';
      try {
        for (const f of [dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true });
        fs.renameSync(dbFile, previous);
        try {
          fs.renameSync(incoming, dbFile);
        } catch (err) {
          fs.renameSync(previous, dbFile); // se devuelven los datos que había
          throw err;
        }
        fs.rmSync(previous, { force: true });
      } finally {
        fs.rmSync(incoming, { force: true });
        db = await openDatabase(dbFile);
        api = createApi(db);
        token = null;
      }
      // Una copia externa trae sus fotos al lado: se recuperan las que falten.
      const photos = path.join(path.dirname(file), 'fotos');
      if (fs.existsSync(photos)) {
        const n = syncFolder(photos, photosDir);
        if (n) log.info('respaldo', `Se recuperaron ${n} fotos de ${photos}`);
      }
    },
    async close() {
      clearInterval(externalTimer);
      await stopSharing();
      db.close();
    },
  };
  // La copia externa se intenta cada hora: si la memoria USB no estaba conectada, se hace al conectarla.
  externalTimer = setInterval(() => self.externalBackup(), 60 * 60 * 1000);
  externalTimer.unref();
  return self;
}

function createRemote({ version, config, saveConfig }) {
  const client = createClient({
    host: config.server.host,
    port: config.server.port,
    key: config.key,
    version,
    serverId: config.server.server_id,
    onMoved(host, port) {
      config.server = { ...config.server, host, port };
      saveConfig(config);
    },
  });
  let token = null;
  let user = null;

  // Se registra solo cuando cambia el estado de la conexión, no en cada reintento.
  let online = true;
  const connection = (ok, err) => {
    if (ok === online) return;
    online = ok;
    if (ok) log.info('red', `Conexión recuperada con la PC principal (${client.host})`);
    else log.warn('red', err.message);
  };

  const forget = (err) => {
    if (err.code === 'OFFLINE') connection(false, err);
    if (['AUTH', 'TERMINAL', 'KEY', 'VERSION'].includes(err.code)) {
      token = null;
      user = null;
    }
    throw err;
  };

  return {
    mode: 'terminal',
    info() {
      return {
        mode: 'terminal',
        terminal: { id: config.terminal_id, name: config.name },
        user,
        server: { host: client.host, port: client.port, name: config.server.name },
      };
    },
    async login(username, password) {
      const r = await client.login(username, password, config.terminal_id).catch(forget);
      token = r.token;
      user = r.user;
      return user;
    },
    async recover() {
      throw new AppError('La contraseña se recupera en la PC principal, con el código de recuperación.', 'VALIDATION');
    },
    async logout() {
      await client.logout(token).catch(() => {});
      token = null;
      user = null;
    },
    user: () => user,
    requireAdmin() {
      if (!user || user.role !== 'admin') throw new AppError('No tiene permiso para realizar esta operación.', 'FORBIDDEN');
    },
    async call(name, params) {
      const r = await client.call(token, name, params).catch(forget);
      connection(true);
      if (name === 'auth.changePassword') user = r;
      return r;
    },
    photo: (name) => client.photo(name).catch(() => null),
    diagnostics() {
      return [
        `Conectada a: ${config.server.name || ''} ${client.host}:${client.port} (server_id ${config.server.server_id})`,
        `Esta computadora: ${config.name} (id ${config.terminal_id}); conexión ${online ? 'activa' : 'caída'}`,
      ];
    },
    async ping() {
      await client.hello().catch(forget);
      connection(true);
      return true;
    },
    async close() {},
  };
}

module.exports = { createLocal, createRemote, localAddresses };
