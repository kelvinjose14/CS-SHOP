'use strict';
// Servidor de la PC principal: atiende a las demás computadoras de la tienda por la red local.
// No depende de Electron: se prueba con Node (test/network.test.js).
const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('../core/util');
const secure = require('./secure');

const PORT = 47810;
const DISCOVERY_PORT = 47811;
const DISCOVER_MSG = 'CAPS-SHOP-DISCOVER';
const MAX_BODY = 15 * 1024 * 1024; // fotos incluidas
const REPLAY_TTL = 5 * 60 * 1000;
const LIMIT_WINDOW = 60 * 1000;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

// Clave de conexión de la tienda, por ejemplo "K7M2P-9QXA4" (10 caracteres, unos 50 bits).
// 256 es múltiplo de 32, así que cada carácter sale con la misma probabilidad.
function newKey() {
  const chars = [...crypto.randomBytes(10)].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

// Guarda la foto que envía la interfaz y la reemplaza por el nombre del archivo.
function withPhoto(params, photosDir) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(params.photo_data || '');
  if (!m) throw new AppError('Imagen inválida.');
  fs.mkdirSync(photosDir, { recursive: true });
  const name = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(photosDir, name), Buffer.from(m[2], 'base64'));
  const out = { ...params, photo: name };
  delete out.photo_data;
  return out;
}

// Llamada a la lógica del negocio, igual desde la PC principal o desde la red.
function callApi(api, token, name, params, photosDir) {
  if (name === 'products.save' && params && params.photo_data) {
    const user = api.user(token);
    if (!user) throw new AppError('Debe iniciar sesión.', 'AUTH');
    if (user.role !== 'admin') throw new AppError('No tiene permiso para realizar esta operación.', 'FORBIDDEN');
    params = withPhoto(params, photosDir);
  }
  return api.call(token, name, params);
}

const PHOTO_NAME = /^[\w-]+\.(jpg|png|webp)$/;
const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Lee una foto de productos por su nombre. null si no existe o el nombre no es válido.
function readPhoto(photosDir, name) {
  name = String(name);
  if (!PHOTO_NAME.test(name)) return null;
  const file = path.join(photosDir, name);
  if (!fs.existsSync(file)) return null;
  return { type: PHOTO_TYPES[name.split('.').pop()], data: fs.readFileSync(file) };
}

// decodeURIComponent sin lanzar: un nombre mal codificado es simplemente inválido.
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

function versionMismatch(principal, mine) {
  return new AppError(`La PC principal tiene la versión ${principal} y esta computadora la ${mine || 'desconocida'}. Instale la misma versión en todas las computadoras.`, 'VERSION');
}

// Cuenta intentos fallidos por clave (IP + usuario) dentro de una ventana de tiempo.
function limiter(max) {
  const hits = new Map();
  return {
    blocked(k) {
      const list = (hits.get(k) || []).filter((t) => Date.now() - t < LIMIT_WINDOW);
      if (list.length) hits.set(k, list);
      else hits.delete(k);
      return list.length >= max;
    },
    fail(k) {
      hits.set(k, [...(hits.get(k) || []), Date.now()]);
    },
    clear(k) {
      hits.delete(k);
    },
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new AppError('Los datos enviados son demasiado grandes.', 'TOO_LARGE'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new AppError('Solicitud inválida.', 'BAD_REQUEST'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length });
  res.end(data);
}

/**
 * @param {object} o
 * @param {() => object} o.getApi  api actual (cambia al restaurar un respaldo)
 * @param {() => string} o.getKey  clave de conexión vigente
 * @param {() => object} o.info    datos públicos: business_name, server_id, name
 * @param {string} o.version       versión del programa; las PCs deben tener la misma
 * @param {string} o.photosDir
 * @param {object} [o.log]         registro de errores (por defecto, la consola)
 */
function createServer({ getApi, getKey, info, version, photosDir, log = consoleLog }) {
  const replays = new Map(); // `${token}:${request_id}` -> { at, body }
  const logins = limiter(5);
  const keys = limiter(10);

  function remember(k, body) {
    const t = Date.now();
    for (const [key, v] of replays) if (t - v.at > REPLAY_TTL) replays.delete(key);
    replays.set(k, { at: t, body });
  }

  // Operaciones de la red, ya descifradas. Devuelve la respuesta (que después se cifra).
  function handle(pathname, body, ip) {
    const api = getApi();
    switch (pathname) {
      case '/v1/pair':
        return { ok: true, data: api.pair(body.name) };
      case '/v1/login': {
        const who = `${ip}|${String(body.username || '').toLowerCase()}`;
        if (logins.blocked(who)) throw new AppError('Demasiados intentos fallidos. Espere un minuto e intente de nuevo.', 'RATE');
        // Por la red solo entran las PCs conectadas; la principal (1) entra en su propio proceso.
        const terminal = Number(body.terminal);
        if (!Number.isInteger(terminal) || terminal <= 1) throw new AppError('Esta computadora no está registrada en la PC principal. Vuelva a conectarla.', 'TERMINAL');
        try {
          const data = api.login({ username: body.username, password: body.password }, { terminal });
          logins.clear(who);
          return { ok: true, data };
        } catch (err) {
          if (err.code === 'AUTH') logins.fail(who);
          throw err;
        }
      }
      case '/v1/logout':
        api.logout(body.token);
        return { ok: true, data: null };
      case '/v1/call': {
        // Un reintento (mismo request_id) recibe el mismo resultado: la operación no se repite.
        const replayKey = body.request_id ? `${body.token}:${body.request_id}` : null;
        const seen = replayKey && replays.get(replayKey);
        if (seen) return seen.body;
        let out;
        try {
          out = { ok: true, data: callApi(api, body.token, body.name, body.params, photosDir) };
        } catch (err) {
          out = errorBody(err, log);
        }
        if (replayKey) remember(replayKey, out);
        return out;
      }
      case '/v1/foto': {
        // Solo con sesión iniciada, como todo lo demás (auditoría 4.7).
        if (!api.user(body.token)) throw new AppError('Debe iniciar sesión.', 'AUTH');
        const img = readPhoto(photosDir, body.name);
        return { ok: true, data: img ? { type: img.type, data: img.data.toString('base64') } : null };
      }
      default:
        throw Object.assign(new AppError('Ruta desconocida.', 'NOT_FOUND'), { status: 404 });
    }
  }

  async function route(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/v1/hello') {
      return send(res, 200, { ok: true, data: { app: 'caps-shop', version, ...info() } });
    }
    const theirs = req.headers['x-caps-version'];
    if (theirs !== version) throw Object.assign(versionMismatch(version, theirs), { status: 409 });
    if (req.method !== 'POST') throw Object.assign(new AppError('Ruta desconocida.', 'NOT_FOUND'), { status: 404 });
    const ip = req.socket.remoteAddress;
    if (keys.blocked(ip)) throw Object.assign(new AppError('Demasiados intentos con una clave incorrecta. Espere un minuto.', 'RATE'), { status: 429 });

    // Si el mensaje no se puede descifrar, la otra PC tiene otra clave (o alguien lo alteró).
    const k = secure.deriveKey(getKey(), info().server_id);
    const envelope = await readJson(req);
    const body = secure.isSealed(envelope) ? secure.open(k, envelope) : null;
    if (!body) {
      keys.fail(ip);
      throw Object.assign(new AppError('Clave de conexión incorrecta. Revísela en la PC principal: Configuración → Red.', 'KEY'), { status: 401 });
    }
    keys.clear(ip);

    let out;
    if (!Number.isFinite(body.ts) || Math.abs(Date.now() - body.ts) > secure.MAX_SKEW) {
      out = { ok: false, error: 'La fecha y hora de esta computadora no coinciden con las de la PC principal (más de 10 minutos de diferencia). Corrija la fecha y hora de Windows.', code: 'CLOCK' };
    } else {
      try {
        out = handle(url.pathname, body, ip);
      } catch (err) {
        out = errorBody(err, log);
      }
    }
    // La respuesta repite el nonce del pedido: así no se puede cambiar por la de otro pedido.
    return send(res, 200, secure.seal(k, { ...out, nonce: body.nonce }));
  }

  const server = http.createServer((req, res) => {
    // Todo error queda dentro de la promesa: una petición rara no debe tumbar la PC principal.
    Promise.resolve()
      .then(() => route(req, res, new URL(req.url, 'http://localhost')))
      .catch((err) => {
        if (!res.headersSent) send(res, err.status || 200, errorBody(err, log));
        else res.destroy();
      });
  });
  server.keepAliveTimeout = 30000;
  return server;
}

const consoleLog = { error: (origin, message, err) => console.error(`[${origin}] ${message}`, err || '') };

// Error para enviar a la otra PC. Los inesperados (fallas del programa) quedan en el registro.
function errorBody(err, log = consoleLog) {
  if (!err.userFacing) log.error('red', `Error inesperado atendiendo a otra computadora: ${err.message}`, err);
  return { ok: false, error: err.userFacing ? err.message : `Error inesperado: ${err.message}`, code: err.code || 'ERROR' };
}

function listen(server, port = PORT, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

// Responde a las PCs que buscan la principal en la red ("Buscar" en la pantalla de configuración).
function startDiscovery({ info, httpPort, port = DISCOVERY_PORT, log = consoleLog }) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', (msg, rinfo) => {
    if (msg.toString() !== DISCOVER_MSG) return;
    const reply = Buffer.from(JSON.stringify({ app: 'caps-shop', port: httpPort(), ...info() }));
    sock.send(reply, rinfo.port, rinfo.address);
  });
  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(port, () => {
      sock.off('error', reject);
      sock.on('error', (err) => log.error('red', 'Falla en el descubrimiento en la red', err));
      resolve({ port: sock.address().port, close: () => sock.close() });
    });
  });
}

module.exports = { PORT, DISCOVERY_PORT, DISCOVER_MSG, newKey, callApi, readPhoto, safeDecode, versionMismatch, limiter, createServer, listen, close, startDiscovery };
