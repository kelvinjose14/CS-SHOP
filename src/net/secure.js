'use strict';
// Cifrado de la red de la tienda con la clave de conexión compartida (sin certificados).
//  - De la clave se deriva una llave AES-256 con scrypt, costoso a propósito: adivinar la clave
//    a partir de tráfico grabado tomaría años.
//  - Cada mensaje va con AES-256-GCM, que cifra y además detecta cualquier alteración.
//  - La clave nunca viaja por la red.
const crypto = require('crypto');

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const AAD = Buffer.from('caps-shop/v1');
const MAX_SKEW = 10 * 60 * 1000; // diferencia de hora aceptada entre computadoras

function normalizeKey(k) {
  return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const cache = new Map();
// Llave derivada de la clave y del identificador de la PC principal (se calcula una vez).
function deriveKey(key, serverId) {
  const id = `${normalizeKey(key)}\u0000${serverId}`;
  let k = cache.get(id);
  if (!k) {
    k = crypto.scryptSync(normalizeKey(key), `caps-shop:${serverId}`, 32, SCRYPT);
    if (cache.size > 20) cache.clear();
    cache.set(id, k);
  }
  return k;
}

function seal(k, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(AAD);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { iv: iv.toString('base64'), data: data.toString('base64') };
}

// Devuelve el objeto, o null si la clave no es la correcta o el mensaje fue alterado.
function open(k, envelope) {
  try {
    const iv = Buffer.from(String(envelope.iv), 'base64');
    const raw = Buffer.from(String(envelope.data), 'base64');
    if (iv.length !== 12 || raw.length < 17) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
    d.setAAD(AAD);
    d.setAuthTag(raw.subarray(raw.length - 16));
    const text = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const isSealed = (body) => !!body && typeof body.iv === 'string' && typeof body.data === 'string';

module.exports = { normalizeKey, deriveKey, seal, open, isSealed, MAX_SKEW };
