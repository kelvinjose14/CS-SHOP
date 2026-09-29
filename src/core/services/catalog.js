'use strict';
// Catálogos de productos (versión 1.7): marcas, categorías, colores y tallas en tablas propias (DT-45).
// Los productos guardan la clave (brand_id…) y, además, el nombre, para buscar, imprimir etiquetas y
// reportar como siempre. Renombrar en el catálogo renombra también los productos.
const { AppError, now, text, catalogKey, sizeOrder } = require('../util');
const { audit } = require('./common');

const TYPES = {
  brands: { label: 'Marca', column: 'brand', idColumn: 'brand_id', max: 80 },
  categories: { label: 'Categoría', column: 'category', idColumn: 'category_id', max: 60 },
  colors: { label: 'Color', column: 'color', idColumn: 'color_id', max: 60 },
  sizes: { label: 'Talla', column: 'size', idColumn: 'size_id', max: 30 },
};

function typeOf(type) {
  const t = TYPES[type];
  if (!t) throw new AppError('Catálogo desconocido.');
  return t;
}

const cleanName = (v, t) => text(v, t.label, { required: true, max: t.max }).replace(/\s+/g, ' ');

function cleanHex(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s);
  if (!m) throw new AppError('Código de color inválido: use el formato #RRGGBB, por ejemplo #000000.');
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
}

function find(db, type, name) {
  const k = catalogKey(name);
  if (!k) return null;
  return db.all(`SELECT * FROM ${type}`).find((r) => catalogKey(r.name) === k) || null;
}

function list(ctx, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  const used = (t) => new Map(ctx.db.all(`SELECT ${TYPES[t].idColumn} AS id, COUNT(*) AS n FROM products WHERE ${TYPES[t].idColumn} IS NOT NULL GROUP BY 1`).map((r) => [r.id, r.n]));
  const withUse = (t, rows) => { const u = used(t); return rows.map((r) => ({ ...r, products: u.get(r.id) || 0 })); };
  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  return {
    brands: withUse('brands', ctx.db.all(`SELECT * FROM brands ${where}`)).sort(byName),
    categories: withUse('categories', ctx.db.all(`SELECT * FROM categories ${where}`)).sort(byName),
    colors: withUse('colors', ctx.db.all(`SELECT * FROM colors ${where} ORDER BY id`)),
    sizes: withUse('sizes', ctx.db.all(`SELECT * FROM sizes ${where}`)).sort((a, b) => a.sort - b.sort || byName(a, b)),
  };
}

// Crear desde el formulario ("+ Crear nueva marca"). Si ya existe con otras mayúsculas, se usa esa; si
// estaba desactivada, se vuelve a activar.
function create(ctx, { type, name, hex }) {
  const t = typeOf(type);
  const n = cleanName(name, t);
  return ctx.db.tx(() => {
    const old = find(ctx.db, type, n);
    if (old) {
      if (!old.active) ctx.db.run(`UPDATE ${type} SET active = 1 WHERE id = ?`, [old.id]);
      return { ...old, active: 1, existed: true };
    }
    const row = { name: n, active: 1, created_at: now() };
    if (type === 'colors') row.hex = cleanHex(hex);
    if (type === 'sizes') row.sort = sizeOrder(n);
    const id = ctx.db.insert(type, row);
    audit(ctx, 'crear_catalogo', type, id, { [t.label.toLowerCase()]: n });
    return { ...row, id, existed: false };
  });
}

// Renombrar, cambiar el color o desactivar. Desactivar solo lo quita de las opciones: los productos
// que ya lo tienen no cambian.
function update(ctx, { type, id, name, hex, active }) {
  const t = typeOf(type);
  return ctx.db.tx(() => {
    const old = ctx.db.get(`SELECT * FROM ${type} WHERE id = ?`, [id]);
    if (!old) throw new AppError(`${t.label} no encontrada.`);
    const next = {};
    if (name !== undefined) {
      const n = cleanName(name, t);
      const other = find(ctx.db, type, n);
      if (other && other.id !== old.id) throw new AppError(`Ya existe "${other.name}".`);
      next.name = n;
      if (type === 'sizes') next.sort = sizeOrder(n);
    }
    if (hex !== undefined && type === 'colors') next.hex = cleanHex(hex);
    if (active !== undefined) next.active = active ? 1 : 0;
    if (!Object.keys(next).length) return old.id;
    ctx.db.run(`UPDATE ${type} SET ${Object.keys(next).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(next), id]);
    if (next.name && next.name !== old.name) {
      ctx.db.run(`UPDATE products SET ${t.column} = ?, updated_at = ? WHERE ${t.idColumn} = ?`, [next.name, now(), id]);
      if (type === 'brands') ctx.db.run('UPDATE product_models SET brand = ? WHERE brand_id = ?', [next.name, id]);
    }
    audit(ctx, 'editar_catalogo', type, id, { antes: old.name, ...next });
    return old.id;
  });
}

// Clave y nombre para un producto: por clave (el formulario) o por nombre (importar desde Excel, que
// agrega al catálogo lo que no exista). Vacío: sin marca, sin categoría, sin color o sin talla.
function resolve(ctx, type, { id, name }) {
  const t = typeOf(type);
  if (id !== undefined && id !== null && id !== '') {
    const row = ctx.db.get(`SELECT id, name FROM ${type} WHERE id = ?`, [Number(id)]);
    if (!row) throw new AppError(`${t.label} no encontrada. Elíjala de nuevo.`);
    return row;
  }
  const n = text(name, t.label, { max: t.max });
  if (!n) return { id: null, name: null };
  const r = create(ctx, { type, name: n });
  return { id: r.id, name: r.name };
}

module.exports = { TYPES, list, create, update, resolve, cleanHex };
