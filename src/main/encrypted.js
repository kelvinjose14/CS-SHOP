'use strict';
// Copia externa protegida con contraseña (auditoría 4.3): si se pierde la memoria USB, quien la encuentre
// no puede leer clientes, ventas, costos ni usuarios.
//  - De la contraseña se deriva una llave AES-256 con scrypt (igual de costoso que la red).
//  - El archivo va con AES-256-GCM, que además detecta cualquier cambio o daño.
//  - Formato: "CAPSCIF1" + sal (16 bytes) + iv (12) + datos cifrados + etiqueta (16).
// La sal va en el archivo: en otra PC basta la contraseña para abrirlo.
const crypto = require('crypto');
const fs = require('fs');
const { AppError } = require('../core/util');

const MAGIC = Buffer.from('CAPSCIF1');
const EXT = '.cifrado';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_PASSWORD = 8;

function deriveKey(password, salt) {
  return crypto.scryptSync(String(password), salt, 32, SCRYPT);
}

// Lo que se guarda en la configuración de la PC principal para cifrar cada día sin pedir la contraseña.
function newSecret(password) {
  if (!password || String(password).length < MIN_PASSWORD) throw new AppError(`La contraseña de las copias debe tener al menos ${MIN_PASSWORD} caracteres.`);
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('hex'), key: deriveKey(password, salt).toString('hex') };
}

function isEncrypted(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length);
    return fs.readSync(fd, head, 0, head.length, 0) === head.length && head.equals(MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

function encryptFile(src, dst, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(secret.key, 'hex'), iv);
  const data = Buffer.concat([c.update(fs.readFileSync(src)), c.final()]);
  const tmp = `${dst}.tmp`;
  fs.writeFileSync(tmp, Buffer.concat([MAGIC, Buffer.from(secret.salt, 'hex'), iv, data, c.getAuthTag()]));
  fs.renameSync(tmp, dst);
}

function decryptFile(src, dst, password) {
  const buf = fs.readFileSync(src);
  if (buf.length < MAGIC.length + 44 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new AppError('El archivo no es una copia cifrada de CAPS Shop.');
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(password || '', salt), iv);
  d.setAuthTag(buf.subarray(buf.length - 16));
  let out;
  try {
    out = Buffer.concat([d.update(buf.subarray(36, buf.length - 16)), d.final()]);
  } catch {
    throw new AppError('La contraseña de la copia no es correcta, o el archivo está dañado.', 'BACKUP_PASSWORD');
  }
  fs.writeFileSync(dst, out);
}

module.exports = { EXT, newSecret, isEncrypted, encryptFile, decryptFile };
