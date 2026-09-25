'use strict';
// Lo que hay detrás de la interfaz, según el modo de esta computadora:
//  - local: PC principal. La base y la lógica corren en este proceso; si se comparte, atiende a las demás PCs.
//  - remoto: PC conectada. Todo se pide a la PC principal por la red.
// Las dos variantes ofrecen las mismas funciones a main.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, validateDatabaseFile, removeDatabaseFiles } = require('../core/db');
const { createApi } = require('../core/api');
const { AppError, today } = require('../core/util');
const { getSetting } = require('../core/services/common');
const net = require('../net/server');
const { createClient } = require('../net/client');

const PRINCIPAL = 1;

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

  const terminalName = () => db.value('SELECT name FROM terminals WHERE id = ?', [PRINCIPAL]);
  const info = () => ({ business_name: getSetting(db, 'business_name'), server_id: config.server_id, name: terminalName() });

  async function startSharing() {
    if (server) return;
    networkError = null;
    try {
      server = net.createServer({ getApi: () => api, getKey: () => config.key, info, version, photosDir });
      const port = await net.listen(server, config.port || net.PORT);
      discovery = await net.startDiscovery({ info, httpPort: () => port }).catch((err) => {
        console.error('Descubrimiento en la red:', err.message);
        return null;
      });
    } catch (err) {
      server = null;
      networkError = err.code === 'EADDRINUSE'
        ? `El puerto ${config.port || net.PORT} está ocupado por otro programa. Cierre el otro programa o reinicie la computadora.`
        : `No se pudo compartir en la red: ${err.message}`;
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

  return {
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
      const r = api.login({ username, password }, { terminal: PRINCIPAL });
      token = r.token;
      return r.user;
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
    // Copia automática diaria (se conservan las últimas 30).
    autoBackup() {
      try {
        fs.mkdirSync(backupsDir, { recursive: true });
        const target = path.join(backupsDir, `capsshop-${today()}.db`);
        if (!fs.existsSync(target)) db.backupTo(target);
        const files = fs.readdirSync(backupsDir).filter((f) => /^capsshop-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        while (files.length > 30) fs.unlinkSync(path.join(backupsDir, files.shift()));
      } catch (err) {
        console.error('Respaldo automático falló:', err);
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
      api.closeAll();
      db.close();
      removeDatabaseFiles(dbFile);
      fs.copyFileSync(file, dbFile);
      db = await openDatabase(dbFile);
      api = createApi(db);
      token = null;
    },
    async close() {
      await stopSharing();
      db.close();
    },
  };
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

  const forget = (err) => {
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
      if (name === 'auth.changePassword') user = r;
      return r;
    },
    photo: (name) => client.photo(name).catch(() => null),
    async ping() {
      await client.hello();
      return true;
    },
    async close() {},
  };
}

module.exports = { createLocal, createRemote, localAddresses };
