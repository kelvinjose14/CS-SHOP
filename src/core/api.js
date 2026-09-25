'use strict';
// Punto de entrada único de la lógica del negocio. Cada método declara quién puede usarlo;
// el usuario de la sesión lo mantiene el proceso principal, no la interfaz.
const { AppError } = require('./util');
const users = require('./services/users');
const products = require('./services/products');
const purchases = require('./services/purchases');
const sales = require('./services/sales');
const finance = require('./services/finance');
const reports = require('./services/reports');

const ALL = ['admin', 'vendedor'];
const ADMIN = ['admin'];

const METHODS = {
  'auth.changePassword': [ALL, users.changeOwnPassword],
  'users.list': [ADMIN, users.list],
  'users.save': [ADMIN, users.save],
  'settings.get': [ALL, users.settingsGet],
  'settings.save': [ADMIN, users.settingsSave],

  'products.list': [ALL, products.list],
  'products.get': [ALL, products.get],
  'products.findByCode': [ALL, products.findByCode],
  'products.summary': [ALL, products.summary],
  'products.movements': [ALL, products.movements],
  'products.save': [ADMIN, products.save],
  'products.adjust': [ADMIN, products.adjust],

  'suppliers.list': [ADMIN, purchases.supplierList],
  'suppliers.get': [ADMIN, purchases.supplierGet],
  'suppliers.save': [ADMIN, purchases.supplierSave],
  'suppliers.pay': [ADMIN, purchases.pay],
  'purchases.create': [ADMIN, purchases.create],
  'purchases.list': [ADMIN, purchases.list],
  'purchases.get': [ADMIN, purchases.get],
  'purchases.pay': [ADMIN, purchases.pay],
  'purchases.void': [ADMIN, purchases.voidPurchase],
  'payables.list': [ADMIN, purchases.payables],

  'customers.list': [ALL, sales.customerList],
  'customers.get': [ALL, sales.customerGet],
  'customers.save': [ALL, sales.customerSave],
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
};

function createApi(db) {
  users.ensureDefaultUsers(db);
  db.save();
  let current = null;

  return {
    get user() {
      return current;
    },
    login(params) {
      current = users.login({ db }, params || {});
      return current;
    },
    logout() {
      current = null;
    },
    call(name, params) {
      const entry = METHODS[name];
      if (!entry) throw new AppError(`Operación desconocida: ${name}`, 'NOT_FOUND');
      if (!current) throw new AppError('Debe iniciar sesión.', 'AUTH');
      // Refresca el usuario (pudo ser desactivado o cambiar de rol).
      const fresh = db.get('SELECT * FROM users WHERE id = ?', [current.id]);
      if (!fresh || !fresh.active) {
        current = null;
        throw new AppError('Su usuario fue desactivado.', 'AUTH');
      }
      current = users.publicUser(fresh);
      const [roles, fn] = entry;
      if (!roles.includes(current.role)) throw new AppError('No tiene permiso para realizar esta operación.', 'FORBIDDEN');
      const result = fn({ db, user: current }, params || {});
      if (name === 'auth.changePassword') current = result;
      return result;
    },
  };
}

module.exports = { createApi, METHODS };
