'use strict';

class AppError extends Error {
  constructor(message, code = 'VALIDATION') {
    super(message);
    this.code = code;
    this.userFacing = true;
  }
}

const METHODS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

function pad(n) {
  return String(n).padStart(2, '0');
}

// Fecha y hora local en formato 'YYYY-MM-DD HH:MM:SS'.
function now(d = new Date()) {
  return `${today(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return today(new Date(y, m - 1, d + days));
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// decimals: un monto escrito a mano (precio, costo) lleva a lo sumo 2 decimales: 1500 y 1500.50 sí,
// 1500.00000001 no. Sin esa opción se redondea (montos calculados).
function money(value, field = 'Monto', { allowZero = true, decimals = false } = {}) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) throw new AppError(`${field}: valor inválido.`);
  if (n < 0 || (!allowZero && n === 0)) throw new AppError(`${field} debe ser ${allowZero ? 'mayor o igual a' : 'mayor que'} cero.`);
  if (decimals && !/^\d+(\.\d{0,2})?$/.test(String(typeof value === 'number' ? n : value).trim())) throw new AppError(`${field}: use como máximo 2 decimales (por ejemplo 1500 o 1500.50).`);
  return round2(n);
}

function int(value, field = 'Cantidad', { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new AppError(`${field} debe ser un número entero${min > 0 ? ' mayor que cero' : ''}.`);
  return n;
}

// Un texto más largo que el máximo se rechaza con un mensaje: cortarlo en silencio perdía datos (auditoría 2.6).
function text(value, field, { required = false, max = 500 } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (required && !s) throw new AppError(`${field} es obligatorio.`);
  if (s.length > max) throw new AppError(`${field} es demasiado largo: tiene ${s.length} caracteres y el máximo es ${max}.`);
  return s || null;
}

// Fecha 'YYYY-MM-DD' que exista en el calendario (auditoría 2.5: se aceptaba 2026-02-31).
// notFuture: no puede ser posterior a hoy (gastos, compras, pagos). min: no puede ser anterior a esa fecha.
function date(value, field = 'Fecha', { required = true, notFuture = false, min } = {}) {
  if (!value) {
    if (required) throw new AppError(`${field} es obligatoria.`);
    return null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!m || d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    throw new AppError(`${field}: la fecha ${value} no existe.`);
  }
  if (m[1] < '2000') throw new AppError(`${field}: el año ${m[1]} no es válido.`);
  if (notFuture && value > today()) throw new AppError(`${field} no puede ser posterior a hoy.`);
  if (min && value < min) throw new AppError(`${field} no puede ser anterior al ${min.split('-').reverse().join('/')}.`);
  return value;
}

function method(value) {
  if (!METHODS.includes(value)) throw new AppError('Método de pago inválido.');
  return value;
}

function accountStatus(total, paid) {
  const balance = round2(total - paid);
  if (balance <= 0.004) return 'pagado';
  if (paid > 0.004) return 'parcial';
  return 'pendiente';
}

// Clave de un modelo (1.5): nombre, marca y modelo sin importar mayúsculas ni espacios de más. Las
// variantes (color y talla) con la misma clave son del mismo modelo.
function modelKey({ name, brand, model } = {}) {
  return [name, brand, model].map((s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()).join('|');
}

// Nombre de marca, categoría, color o talla para compararlo sin importar mayúsculas ni espacios (1.7).
function catalogKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Orden de una talla: las de gorra por su medida (6 1/2 … 8), luego XS…XXL, luego Ajustable,
// Snapback y One Size, y al final cualquier otra.
const LETTER_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
const FREE_SIZES = ['ajustable', 'snapback', 'one size'];
function sizeOrder(name) {
  const s = catalogKey(name);
  const m = /^(\d+)(?:\s+(\d+)\/(\d+))?(?:["”]|\s*cm)?$/.exec(s);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  if (LETTER_SIZES.includes(s)) return 50 + LETTER_SIZES.indexOf(s);
  if (FREE_SIZES.includes(s)) return 100 + FREE_SIZES.indexOf(s);
  return 200;
}

// Rango de fechas a partir de un período: dia, semana, mes, anio o personalizado.
function periodRange({ period = 'mes', from, to, ref } = {}) {
  const base = ref ? new Date(`${ref}T12:00:00`) : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  switch (period) {
    case 'dia':
      return { from: today(base), to: today(base) };
    case 'semana': {
      const dow = (base.getDay() + 6) % 7; // lunes = 0
      const start = new Date(y, m, base.getDate() - dow);
      return { from: today(start), to: addDays(today(start), 6) };
    }
    case 'mes':
      return { from: today(new Date(y, m, 1)), to: today(new Date(y, m + 1, 0)) };
    case 'anio':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'rango':
    default:
      return { from: date(from, 'Desde'), to: date(to, 'Hasta') };
  }
}

module.exports = { AppError, METHODS, now, today, addDays, round2, money, int, text, date, method, accountStatus, periodRange, modelKey, catalogKey, sizeOrder };
