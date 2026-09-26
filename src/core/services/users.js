'use strict';
const crypto = require('crypto');
const { AppError, now, text } = require('../util');
const { audit, getSetting, getSettings, setSetting, DEFAULT_SETTINGS } = require('./common');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

const ROLE_LABELS = { admin: 'Administrador', vendedor: 'Vendedor' };

function publicUser(u) {
  return u && { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, must_change: u.must_change, created_at: u.created_at };
}

// Crea los dos usuarios iniciales la primera vez que se abre el sistema.
function ensureDefaultUsers(db) {
  if (db.value('SELECT COUNT(*) FROM users') > 0) return;
  const defaults = [
    { username: 'admin', name: 'Administrador', role: 'admin', password: 'admin123' },
    { username: 'vendedor', name: 'Vendedor', role: 'vendedor', password: 'vendedor123' },
  ];
  for (const u of defaults) {
    const { hash, salt } = hashPassword(u.password);
    db.insert('users', { username: u.username, name: u.name, role: u.role, password_hash: hash, password_salt: salt, must_change: 1, active: 1, created_at: now() });
  }
}

function login(ctx, { username, password }) {
  const u = ctx.db.get('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  if (!u || !u.active || !verifyPassword(password || '', u.password_hash, u.password_salt)) {
    throw new AppError('Usuario o contraseña incorrectos.', 'AUTH');
  }
  ctx.db.tx(() => audit({ ...ctx, user: u }, 'inicio_sesion', 'usuario', u.id));
  return publicUser(u);
}

// Mínimo 8 caracteres (auditoría 4.7). Las contraseñas que ya existen siguen sirviendo; la regla se
// aplica al ponerlas o cambiarlas.
const MIN_PASSWORD = 8;
function validatePassword(p) {
  if (!p || String(p).length < MIN_PASSWORD) throw new AppError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
}

function changeOwnPassword(ctx, { current, password }) {
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
  if (!verifyPassword(current || '', u.password_hash, u.password_salt)) throw new AppError('La contraseña actual no es correcta.');
  validatePassword(password);
  const { hash, salt } = hashPassword(password);
  ctx.db.tx(() => {
    ctx.db.update('users', u.id, { password_hash: hash, password_salt: salt, must_change: 0 });
    audit(ctx, 'cambio_contrasena', 'usuario', u.id);
  });
  return publicUser({ ...u, must_change: 0 });
}

// ---------- Código de recuperación del administrador (RF-NUE-06) ----------
// Sin internet no hay correo para recuperar la contraseña. El administrador genera un código de un
// solo uso, lo anota o imprime y lo guarda fuera de la tienda. Solo se guarda su huella (scrypt).

const RECOVERY_KEY = '_recovery';
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function recoveryStatus(ctx) {
  const raw = getSetting(ctx.db, RECOVERY_KEY);
  if (!raw) return { exists: false };
  const r = JSON.parse(raw);
  return { exists: true, created_at: r.created_at, created_by: r.created_by };
}

// Pide la contraseña actual: una sesión abierta y olvidada no basta para crear un código.
function recoveryCreate(ctx, { password }) {
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
  if (!verifyPassword(password || '', u.password_hash, u.password_salt)) throw new AppError('La contraseña actual no es correcta.');
  const bytes = crypto.randomBytes(16);
  const plain = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  const { hash, salt } = hashPassword(plain);
  ctx.db.tx(() => {
    setSetting(ctx.db, RECOVERY_KEY, JSON.stringify({ hash, salt, created_at: now(), created_by: u.name }));
    audit(ctx, 'crear_codigo_recuperacion', 'usuario', u.id);
  });
  return { code: plain.match(/.{4}/g).join('-') };
}

// Sin sesión: restablece la contraseña de un administrador con el código, que deja de servir.
function recover(ctx, { username, code, password }) {
  const raw = getSetting(ctx.db, RECOVERY_KEY);
  const u = ctx.db.get('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  const r = raw ? JSON.parse(raw) : null;
  // Se verifica aunque falte algo, para no delatar por el tiempo de respuesta qué parte falló.
  const ok = verifyPassword(normalizeCode(code), r ? r.hash : '00', r ? r.salt : 'x');
  if (!r || !ok || !u || u.role !== 'admin' || !u.active) throw new AppError('El usuario o el código de recuperación no son correctos.', 'AUTH');
  validatePassword(password);
  const { hash, salt } = hashPassword(password);
  ctx.db.tx(() => {
    ctx.db.update('users', u.id, { password_hash: hash, password_salt: salt, must_change: 0 });
    ctx.db.run('DELETE FROM settings WHERE key = ?', [RECOVERY_KEY]);
    audit({ ...ctx, user: u }, 'recuperar_contrasena', 'usuario', u.id);
  });
  return publicUser({ ...u, must_change: 0 });
}

function list(ctx) {
  return ctx.db.all('SELECT * FROM users ORDER BY id').map(publicUser);
}

function save(ctx, data) {
  const name = text(data.name, 'Nombre', { required: true });
  const username = text(data.username, 'Usuario', { required: true, max: 40 });
  const role = data.role === 'admin' ? 'admin' : 'vendedor';
  const active = data.active === undefined ? 1 : data.active ? 1 : 0;
  const dup = ctx.db.get('SELECT id FROM users WHERE username = ? AND id <> ?', [username, data.id || 0]);
  if (dup) throw new AppError('Ya existe un usuario con ese nombre de usuario.');
  return ctx.db.tx(() => {
    if (data.id) {
      if (data.id === ctx.user.id && (role !== 'admin' || !active)) throw new AppError('No puede quitarse a sí mismo el rol de administrador ni desactivarse.');
      ctx.db.update('users', data.id, { name, username, role, active });
      if (data.password) {
        validatePassword(data.password);
        const { hash, salt } = hashPassword(data.password);
        ctx.db.update('users', data.id, { password_hash: hash, password_salt: salt, must_change: 1 });
      }
      audit(ctx, 'editar_usuario', 'usuario', data.id, { nombre: name, usuario: username, perfil: ROLE_LABELS[role], activo: active ? 'sí' : 'no', contrasena_restablecida: data.password ? 'sí' : 'no' });
      return data.id;
    }
    validatePassword(data.password);
    const { hash, salt } = hashPassword(data.password);
    const id = ctx.db.insert('users', { username, name, role, password_hash: hash, password_salt: salt, must_change: 1, active, created_at: now() });
    audit(ctx, 'crear_usuario', 'usuario', id, { nombre: name, usuario: username, perfil: ROLE_LABELS[role] });
    return id;
  });
}

function settingsGet(ctx) {
  return getSettings(ctx.db);
}

// Nombres legibles para el historial (RF-NUE-08).
const SETTING_LABELS = {
  business_name: 'Nombre del negocio',
  business_tagline: 'Eslogan',
  business_phone: 'Teléfono',
  business_address: 'Dirección',
  currency: 'Moneda',
  credit_days: 'Días de crédito',
  require_open_cash: 'Exigir caja abierta',
  allow_negative_stock: 'Permitir existencia negativa',
  seller_can_receive_payments: 'Vendedor cobra abonos',
  seller_can_discount: 'Vendedor aplica descuentos',
  seller_max_discount_pct: 'Descuento máximo del vendedor (%)',
  block_overdue_credit: 'Crédito con deuda vencida solo con autorización',
  csv_format: 'Formato del CSV',
  receipt_footer: 'Pie del recibo',
  expense_categories: 'Categorías de gastos',
  income_categories: 'Categorías de otros ingresos',
};

function settingValue(key, v) {
  if (['require_open_cash', 'allow_negative_stock', 'seller_can_receive_payments', 'seller_can_discount', 'block_overdue_credit'].includes(key)) return String(v) === '1' ? 'sí' : 'no';
  if (key === 'csv_format') return { auto: 'según la región de Windows', coma: 'coma', punto_y_coma: 'punto y coma' }[v] || String(v);
  if (key.endsWith('_categories')) {
    try { return JSON.parse(v).join(', '); } catch { return String(v); }
  }
  return String(v ?? '');
}

function settingsSave(ctx, values) {
  ctx.db.tx(() => {
    const before = getSettings(ctx.db);
    const changes = {};
    for (const [k, v] of Object.entries(values || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      if (k === 'csv_format' && !['auto', 'coma', 'punto_y_coma'].includes(v)) throw new AppError('Formato del CSV inválido.');
      setSetting(ctx.db, k, v);
      if (String(before[k] ?? '') !== String(v ?? '')) changes[SETTING_LABELS[k] || k] = { antes: settingValue(k, before[k]), despues: settingValue(k, v) };
    }
    if (Object.keys(changes).length) audit(ctx, 'editar_configuracion', 'configuracion', null, changes);
  });
  return getSettings(ctx.db);
}

module.exports = { recoveryStatus, recoveryCreate, recover, hashPassword, verifyPassword, ensureDefaultUsers, login, changeOwnPassword, list, save, settingsGet, settingsSave, publicUser };
