'use strict';
// Cliente de las computadoras conectadas: habla con el servidor de la PC principal.
const dgram = require('dgram');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { AppError } = require('../core/util');
const { PORT, DISCOVERY_PORT, DISCOVER_MSG } = require('./server');

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
    const req = http.request(url, { method, headers, agent });
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
 * @param {string} o.key        clave de conexión
 * @param {string} o.version    versión de este programa
 * @param {string} [o.serverId] si la dirección deja de responder, se vuelve a buscar la principal con este id
 * @param {(host: string) => void} [o.onMoved]  avisa la nueva dirección encontrada
 * @param {object} [o.discoverOptions]
 */
function createClient({ host, port = PORT, key, version, serverId, onMoved, discoverOptions, timeout = TIMEOUT, connectTimeout = CONNECT_TIMEOUT }) {
  const state = { host, port };
  const url = (path) => `http://${state.host}:${state.port}${path}`;
  const headers = (extra) => ({ 'x-caps-key': key || '', 'x-caps-version': version, ...extra });

  async function once(method, path, body) {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const r = await httpRequest(method, url(path), headers(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), payload, { timeout, connectTimeout });
    let data;
    try {
      data = JSON.parse(r.data.toString('utf8'));
    } catch {
      throw new AppError(`Respuesta inválida de la PC principal (${r.status}).`, 'ERROR');
    }
    if (!data.ok) throw new AppError(data.error, data.code || 'ERROR');
    return data.data;
  }

  // Si la principal cambió de dirección (por ejemplo, el router le dio otra IP), se busca de nuevo.
  async function relocate() {
    if (!serverId) return false;
    const list = await discover({ timeout: 1500, ...discoverOptions });
    const hit = list.find((d) => d.server_id === serverId);
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
    async photo(name) {
      const r = await httpRequest('GET', url(`/v1/foto/${encodeURIComponent(name)}`), headers(), undefined, { timeout, connectTimeout });
      return r.status === 200 ? { type: r.type, data: r.data } : null;
    },
  };
}

module.exports = { createClient, discover, broadcastAddresses };
