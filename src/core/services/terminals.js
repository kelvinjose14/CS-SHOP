'use strict';
// Computadoras de la tienda. La 1 es la PC principal; las demás se registran al conectarse.
const { AppError, now, text } = require('../util');
const { audit, openCashSession } = require('./common');

const PRINCIPAL = 1;

// Devuelve la PC activa o lanza un error que obliga a volver a conectarla.
function check(db, id) {
  const t = db.get('SELECT * FROM terminals WHERE id = ?', [id]);
  if (!t) throw new AppError('Esta computadora no está registrada en la PC principal. Vuelva a conectarla.', 'TERMINAL');
  if (!t.active) throw new AppError('Esta computadora fue desactivada por el administrador.', 'TERMINAL');
  return t;
}

// Registra una PC por su nombre, o reutiliza la que ya tiene ese nombre.
function register(db, name) {
  const n = text(name, 'Nombre de la computadora', { required: true, max: 40 });
  return db.tx(() => {
    const found = db.get('SELECT * FROM terminals WHERE name = ?', [n]);
    if (found) {
      if (found.id === PRINCIPAL) throw new AppError('Ese nombre es el de la PC principal. Use otro nombre para esta computadora.');
      // Una PC desactivada no se reactiva sola: lo decide el administrador.
      if (!found.active) throw new AppError('Esa computadora está desactivada. El administrador debe activarla en Configuración → Red.', 'TERMINAL');
      audit({ db, terminal: found.id }, 'conectar_pc', 'pc', found.id, { nombre: n });
      return found;
    }
    const id = db.insert('terminals', { name: n, active: 1, created_at: now() });
    audit({ db, terminal: id }, 'conectar_pc', 'pc', id, { nombre: n });
    return db.get('SELECT * FROM terminals WHERE id = ?', [id]);
  });
}

function touch(db, id) {
  db.run('UPDATE terminals SET last_seen_at = ? WHERE id = ?', [now(), id]);
}

function list(ctx) {
  return ctx.db.all('SELECT * FROM terminals ORDER BY id').map((t) => ({
    ...t,
    principal: t.id === PRINCIPAL,
    cash_open: !!openCashSession(ctx.db, t.id),
  }));
}

function validName(db, name, id) {
  const n = text(name, 'Nombre de la computadora', { required: true, max: 40 });
  if (db.get('SELECT id FROM terminals WHERE name = ? AND id <> ?', [n, id])) throw new AppError('Ya existe una computadora con ese nombre.');
  return n;
}

// Nombre de la PC principal, elegido al configurarla.
function rename(db, id, name) {
  const n = validName(db, name, id);
  db.tx(() => db.update('terminals', id, { name: n }));
  return n;
}

function save(ctx, { id, name, active }) {
  const t = ctx.db.get('SELECT * FROM terminals WHERE id = ?', [id]);
  if (!t) throw new AppError('Computadora no encontrada.');
  const data = {};
  if (name !== undefined) data.name = validName(ctx.db, name, id);
  if (active !== undefined) {
    data.active = active ? 1 : 0;
    if (!data.active && t.id === PRINCIPAL) throw new AppError('La PC principal no se puede desactivar.');
    if (!data.active && openCashSession(ctx.db, t.id)) throw new AppError('Cierre la caja de esa computadora antes de desactivarla.');
  }
  return ctx.db.tx(() => {
    ctx.db.update('terminals', id, data);
    audit(ctx, 'editar_pc', 'pc', id, { antes: { nombre: t.name, activa: t.active }, despues: data });
    return id;
  });
}

module.exports = { PRINCIPAL, check, register, touch, list, save, rename };
