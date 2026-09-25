'use strict';
const crypto = require('crypto');
const { AppError, now, text } = require('../util');
const { audit, getSettings, setSetting, DEFAULT_SETTINGS } = require('./common');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

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

function validatePassword(p) {
  if (!p || String(p).length < 6) throw new AppError('La contraseña debe tener al menos 6 caracteres.');
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
      audit(ctx, 'editar_usuario', 'usuario', data.id, { name, username, role, active, password_reset: !!data.password });
      return data.id;
    }
    validatePassword(data.password);
    const { hash, salt } = hashPassword(data.password);
    const id = ctx.db.insert('users', { username, name, role, password_hash: hash, password_salt: salt, must_change: 1, active, created_at: now() });
    audit(ctx, 'crear_usuario', 'usuario', id, { name, username, role });
    return id;
  });
}

function settingsGet(ctx) {
  return getSettings(ctx.db);
}

function settingsSave(ctx, values) {
  ctx.db.tx(() => {
    for (const [k, v] of Object.entries(values || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      setSetting(ctx.db, k, v);
    }
    audit(ctx, 'editar_configuracion', 'configuracion', null, values);
  });
  return getSettings(ctx.db);
}

module.exports = { hashPassword, verifyPassword, ensureDefaultUsers, login, changeOwnPassword, list, save, settingsGet, settingsSave, publicUser };
