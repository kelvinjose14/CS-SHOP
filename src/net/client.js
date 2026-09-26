'use strict';
// Cliente de las computadoras conectadas: habla con el servidor de la PC principal.
const dgram = require('dgram');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { AppError } = require('../core/util');
const { PORT, DISCOVERY_PORT, DISCOVER_MSG } = require('./server');
const secure = require('./secure');

const CONNECT_TIMEOUT = 4000; // si la principal está apagada, no se espera más que esto por intento
const TIMEOUT = 15000; // respuesta, una vez conectado
const RETRIES = 2;
const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dirección de difusión de cada red de esta PC, más la general.
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((n, i) => (n & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...out];
}

// Busca PCs principales en la red local. Devuelve [{ host, port, name, business_name, server_id, version }].
async function discover({ timeout = 2000, port = DISCOVERY_PORT, targets = broadcastAddresses() } = {}) {
  const sock = dgram.createSocket('udp4');
  const found = new Map();
  sock.on('message', (msg, rinfo) => {
    try {
      const d = JSON.parse(msg.toString());
      if (d.app === 'caps-shop') found.set(`${d.server_id}@${rinfo.address}`, { ...d, host: rinfo.address });
    } catch { /* respuesta ajena */ }
  });
  sock.on('error', () => {});
  await new Promise((resolve) => sock.bind(0, resolve));
  sock.setBroadcast(true);
  for (const t of targets) sock.send(DISCOVER_MSG, port, t, () => {});
  await sleep(timeout);
  sock.close();
  // Una principal puede responder por varias redes; se deja una respuesta por principal.
  const byServer = new Map();
  for (const d of found.values()) if (!byServer.has(d.server_id)) byServer.set(d.server_id, d);
  return [...byServer.values()];
}

// Petición HTTP. Los errores de red llevan "sent": la conexión llegó a abrirse, así que la
// principal pudo haber recibido la operación.
function httpRequest(method, url, headers, body, { connectTimeout = CONNECT_TIMEOUT, timeout = TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    let connected = false;
    let req;
    try {
      req = http.request(url, { method, headers, agent });
    } catch {
      reject(new AppError('La dirección de la PC principal no es válida.', 'VALIDATION'));
      return;
    }
    const fail = (err) => reject(Object.assign(err, { network: true, sent: connected }));
    const timer = setTimeout(() => {
      if (!connected) req.destroy(Object.assign(new Error('No se pudo conectar a tiempo.'), { code: 'ECONNTIMEOUT' }));
    }, connectTimeout);
    req.on('socket', (sock) => {
      if (!sock.connecting) connected = true;
      else sock.once('connect', () => { connected = true; });
    });
    req.setTimeout(timeout, () => req.destroy(Object.assign(new Error('La PC principal no respondió a tiempo.'), { code: 'ETIMEDOUT' })));
    req.on('error', (err) => {
      clearTimeout(timer);
      fail(err);
    });
    req.on('response', (res) => {
      clearTimeout(timer);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], data: Buffer.concat(chunks) }));
      res.on('error', fail);
    });
    req.end(body);
  });
}

/**
 * @param {object} o
 * @param {string} o.host
 * @param {number} [o.port]
 * @param {string} o.key        clave de conexión (no se envía: se usa para cifrar)
 * @param {string} o.version    versión de este programa
 * @param {string} [o.serverId] identificador de la principal: forma parte de la llave de cifrado y, si la
 *                              dirección deja de responder, se vuelve a buscar la principal con él. Si falta,
 *                              se toma del saludo (hello).
 * @param {(host: string) => void} [o.onMoved]  avisa la nueva dirección encontrada
 * @param {object} [o.discoverOptions]
 */
function createClient({ host, port = PORT, key, version, serverId, onMoved, discoverOptions, timeout = TIMEOUT, connectTimeout = CONNECT_TIMEOUT }) {
  const state = { host, port, serverId };
  const url = (path) => `http://${state.host}:${state.port}${path}`;

  async function send(method, path, payload) {
    const raw = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
    const headers = { 'x-caps-version': version, ...(raw ? { 'content-type': 'application/json', 'content-length': raw.length } : {}) };
    const r = await httpRequest(method, url(path), headers, raw, { timeout, connectTimeout });
    try {
      return JSON.parse(r.data.toString('utf8'));
    } catch {
      throw new AppError(`Respuesta inválida de la PC principal (${r.status}).`, 'ERROR');
    }
  }

  const unwrap = (data) => {
    if (!data.ok) throw new AppError(data.error, data.code || 'ERROR');
    return data.data;
  };

  async function once(method, path, body) {
    if (path === '/v1/hello') {
      const hello = unwrap(await send('GET', path));
      if (!state.serverId) state.serverId = hello.server_id;
      return hello;
    }
    if (!state.serverId) await once('GET', '/v1/hello');
    // Todo lo demás va cifrado con la llave derivada de la clave. La hora y el nonce van dentro.
    const k = secure.deriveKey(key, state.serverId);
    const nonce = crypto.randomUUID();
    const reply = await send('POST', path, secure.seal(k, { ...body, ts: Date.now(), nonce }));
    if (!secure.isSealed(reply)) return unwrap(reply); // error antes de descifrar: versión o clave
    const data = secure.open(k, reply);
    if (!data || data.nonce !== nonce) throw new AppError('La respuesta de la PC principal no es válida.', 'ERROR');
    return unwrap(data);
  }

  // Si la principal cambió de dirección (por ejemplo, el router le dio otra IP), se busca de nuevo.
  async function relocate() {
    if (!state.serverId) return false;
    const list = await discover({ timeout: 1500, ...discoverOptions });
    const hit = list.find((d) => d.server_id === state.serverId);
    if (!hit || (hit.host === state.host && hit.port === state.port)) return false;
    state.host = hit.host;
    state.port = hit.port;
    if (onMoved) onMoved(hit.host, hit.port);
    return true;
  }

  async function request(method, path, body, { retries = RETRIES } = {}) {
    let sent = false;
    for (let attempt = 0; attempt <= retries + 1; attempt++) {
      try {
        return await once(method, path, body);
      } catch (err) {
        if (!err.network) throw err;
        sent = sent || err.sent;
        if (attempt === retries && (await relocate().catch(() => false))) continue;
        if (attempt >= retries) break;
        await sleep(400 * (attempt + 1));
      }
    }
    if (sent && path === '/v1/call') {
      throw new AppError('No se pudo confirmar la operación con la PC principal. Cuando vuelva la conexión, revise si quedó registrada antes de repetirla.', 'OFFLINE');
    }
    throw new AppError(`Sin conexión con la PC principal (${state.host}). Verifique que esté encendida y conectada a la red.`, 'OFFLINE');
  }

  return {
    get host() {
      return state.host;
    },
    get port() {
      return state.port;
    },
    hello: () => request('GET', '/v1/hello', undefined, { retries: 0 }),
    pair: (name) => request('POST', '/v1/pair', { name }, { retries: 0 }),
    login: (username, password, terminal) => request('POST', '/v1/login', { username, password, terminal }, { retries: 0 }),
    logout: (token) => request('POST', '/v1/logout', { token }, { retries: 0 }),
    // El mismo request_id en cada reintento: la principal no repite la operación.
    call: (token, name, params) => request('POST', '/v1/call', { token, name, params, request_id: crypto.randomUUID() }),
    async photo(name, token) {
      const img = await request('POST', '/v1/foto', { name, token }, { retries: 0 });
      return img ? { type: img.type, data: Buffer.from(img.data, 'base64') } : null;
    },
  };
}

module.exports = { createClient, discover, broadcastAddresses };
