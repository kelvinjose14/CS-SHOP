'use strict';
// Punto de entrada único de la lógica del negocio. Cada método declara quién puede usarlo.
// Cada computadora inicia su propia sesión y recibe un token; el usuario de la sesión
// lo guarda este módulo, no la interfaz.
const crypto = require('crypto');
const { AppError } = require('./util');
const users = require('./services/users');
const products = require('./services/products');
const purchases = require('./services/purchases');
const sales = require('./services/sales');
const finance = require('./services/finance');
const reports = require('./services/reports');
const terminals = require('./services/terminals');

const ALL = ['admin', 'vendedor'];
const ADMIN = ['admin'];

const METHODS = {
  'auth.changePassword': [ALL, users.changeOwnPassword],
  'users.list': [ADMIN, users.list],
  'users.save': [ADMIN, users.save],
  'settings.get': [ALL, users.settingsGet],
  'settings.save': [ADMIN, users.settingsSave],
  'recovery.status': [ADMIN, users.recoveryStatus],
  'recovery.create': [ADMIN, users.recoveryCreate],

  'products.list': [ALL, products.list],
  'products.get': [ALL, products.get],
  'products.findByCode': [ALL, products.findByCode],
  'products.summary': [ALL, products.summary],
  'products.movements': [ALL, products.movements],
  'products.save': [ADMIN, products.save],
  'products.import': [ADMIN, products.importRows],
  'products.adjust': [ADMIN, products.adjust],
  'products.count': [ADMIN, products.count],

  'suppliers.list': [ADMIN, purchases.supplierList],
  'suppliers.get': [ADMIN, purchases.supplierGet],
  'suppliers.save': [ADMIN, purchases.supplierSave],
  'suppliers.pay': [ADMIN, purchases.pay],
  'suppliers.opening': [ADMIN, purchases.supplierOpening],
  'purchases.create': [ADMIN, purchases.create],
  'purchases.list': [ADMIN, purchases.list],
  'purchases.get': [ADMIN, purchases.get],
  'purchases.pay': [ADMIN, purchases.pay],
  'purchases.void': [ADMIN, purchases.voidPurchase],
  'payables.list': [ADMIN, purchases.payables],

  'customers.list': [ALL, sales.customerList],
  'customers.get': [ALL, sales.customerGet],
  'customers.save': [ALL, sales.customerSave],
  'customers.opening': [ADMIN, sales.customerOpening],
  'sales.create': [ALL, sales.create],
  'sales.list': [ALL, sales.list],
  'sales.get': [ALL, sales.get],
  'sales.pay': [ALL, sales.pay],
  'sales.return': [ADMIN, sales.createReturn],
  'sales.void': [ADMIN, sales.voidSale],
  'receivables.list': [ALL, sales.receivables],

  'expenses.list': [ADMIN, finance.expenses.list],
  'expenses.create': [ADMIN, finance.expenses.create],
  'expenses.void': [ADMIN, finance.expenses.void],
  'incomes.list': [ADMIN, finance.incomes.list],
  'incomes.create': [ADMIN, finance.incomes.create],
  'incomes.void': [ADMIN, finance.incomes.void],
  'capital.list': [ADMIN, finance.capital.list],
  'capital.create': [ADMIN, finance.capital.create],
  'capital.void': [ADMIN, finance.capital.void],

  'cash.status': [ALL, finance.cashStatus],
  'cash.open': [ALL, finance.cashOpen],
  'cash.movement': [ALL, finance.cashMovement],
  'cash.close': [ALL, finance.cashClose],
  'cash.history': [ADMIN, finance.cashHistory],
  'cash.session': [ADMIN, finance.cashSession],

  'reports.dashboard': [ALL, reports.dashboard],
  'reports.profit': [ADMIN, reports.profit],
  'reports.cashflow': [ADMIN, reports.cashflow],
  'reports.topProducts': [ADMIN, reports.topProducts],
  'reports.audit': [ADMIN, reports.auditLog],
  'reports.range': [ALL, reports.range],

  'terminals.list': [ADMIN, terminals.list],
  'terminals.save': [ADMIN, terminals.save],
};

const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 horas sin actividad
// Lo único permitido mientras el usuario debe cambiar su contraseña.
const BEFORE_PASSWORD_CHANGE = new Set(['auth.changePassword', 'settings.get']);
const TOUCH_EVERY = 60 * 1000;

function createApi(db) {
  users.ensureDefaultUsers(db);
  const sessions = new Map(); // token -> { user, terminal, lastSeen, touched }

  function find(token) {
    const s = token ? sessions.get(token) : null;
    if (s && Date.now() - s.lastSeen > SESSION_TTL) {
      sessions.delete(token);
      return null;
    }
    return s || null;
  }

  return {
    // Registra (o reutiliza) una computadora que se conecta a la principal.
    pair(name) {
      const t = terminals.register(db, name);
      return { id: t.id, name: t.name };
    },
    setTerminalName(id, name) {
      return terminals.rename(db, id, name);
    },
    login(params, { terminal = terminals.PRINCIPAL } = {}) {
      terminals.check(db, terminal);
      const user = users.login({ db, terminal }, params || {});
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { user, terminal, lastSeen: Date.now(), touched: 0 });
      return { token, user };
    },
    // Recuperación con el código de un solo uso (sin sesión). Cierra las sesiones de ese usuario.
    recover(params, { terminal = terminals.PRINCIPAL } = {}) {
      const user = users.recover({ db, terminal }, params || {});
      for (const [token, s] of sessions) if (s.user.id === user.id) sessions.delete(token);
      return user;
    },
    logout(token) {
      sessions.delete(token);
    },
    user(token) {
      const s = find(token);
      return s ? s.user : null;
    },
    // Al restaurar un respaldo o cerrar la base, todas las PCs vuelven a entrar.
    closeAll() {
      sessions.clear();
    },
    call(token, name, params) {
      const entry = METHODS[name];
      if (!entry) throw new AppError(`Operación desconocida: ${name}`, 'NOT_FOUND');
      if (!token) throw new AppError('Debe iniciar sesión.', 'AUTH');
      const s = find(token);
      if (!s) throw new AppError('Su sesión terminó. Vuelva a entrar.', 'AUTH');
      try {
        terminals.check(db, s.terminal);
      } catch (err) {
        sessions.delete(token);
        throw err;
      }
      // Refresca el usuario (pudo ser desactivado o cambiar de rol).
      const fresh = db.get('SELECT * FROM users WHERE id = ?', [s.user.id]);
      if (!fresh || !fresh.active) {
        sessions.delete(token);
        throw new AppError('Su usuario fue desactivado.', 'AUTH');
      }
      s.user = users.publicUser(fresh);
      s.lastSeen = Date.now();
      if (s.lastSeen - s.touched > TOUCH_EVERY) {
        terminals.touch(db, s.terminal);
        s.touched = s.lastSeen;
      }
      const [roles, fn] = entry;
      if (!roles.includes(s.user.role)) throw new AppError('No tiene permiso para realizar esta operación.', 'FORBIDDEN');
      // La contraseña inicial (o restablecida) se cambia antes de usar el sistema, también desde la red.
      if (s.user.must_change && !BEFORE_PASSWORD_CHANGE.has(name)) throw new AppError('Debe cambiar su contraseña antes de continuar.', 'PASSWORD');
      const result = fn({ db, user: s.user, terminal: s.terminal }, params || {});
      if (name === 'auth.changePassword') s.user = result;
      return result;
    },
  };
}

module.exports = { createApi, METHODS };
