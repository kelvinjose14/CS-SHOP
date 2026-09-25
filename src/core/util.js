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

function money(value, field = 'Monto', { allowZero = true } = {}) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) throw new AppError(`${field}: valor inválido.`);
  if (n < 0 || (!allowZero && n === 0)) throw new AppError(`${field} debe ser ${allowZero ? 'mayor o igual a' : 'mayor que'} cero.`);
  return round2(n);
}

function int(value, field = 'Cantidad', { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new AppError(`${field} debe ser un número entero${min > 0 ? ' mayor que cero' : ''}.`);
  return n;
}

function text(value, field, { required = false, max = 500 } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (required && !s) throw new AppError(`${field} es obligatorio.`);
  return s.slice(0, max) || null;
}

function date(value, field = 'Fecha', { required = true } = {}) {
  if (!value) {
    if (required) throw new AppError(`${field} es obligatoria.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(`${field}: formato inválido.`);
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

module.exports = { AppError, METHODS, now, today, addDays, round2, money, int, text, date, method, accountStatus, periodRange };
