'use strict';
// Brechas funcionales (O5): saldos iniciales, depósito al banco, aportes del dueño, precio obligatorio,
// historial legible y recuperación de la contraseña del administrador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-o5-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const core = createApi(db);
  const api = client(core);
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  call('cash.open', { amount: 1000 });
  return { db, core, api, call };
}

test('RF-NUE-01: saldos iniciales de clientes y proveedores', async () => {
  const { call } = await setup();
  const customer = call('customers.save', { name: 'Juan Pérez' });
  const supplier = call('suppliers.save', { name: 'Distribuidora' });
  call('customers.opening', { customer_id: customer, amount: 3500, date: '2026-01-15', note: 'Cuaderno de fiado' });
  call('suppliers.opening', { supplier_id: supplier, amount: 8000, date: '2026-01-15' });

  // Cuentan como deudas…
  const c = call('customers.get', { id: customer });
  assert.equal(c.balance, 3500);
  assert.equal(c.total_bought, 0, 'no es una compra del cliente');
  assert.equal(call('receivables.list').length, 1);
  assert.equal(call('suppliers.get', { id: supplier }).balance, 8000);
  assert.equal(call('payables.list').length, 1);
  const dash = call('reports.dashboard');
  assert.equal(dash.receivables, 3500);
  assert.equal(dash.payables, 8000);
  // …pero no son ventas ni compras del período, ni mueven dinero ni inventario.
  const profit = call('reports.profit', { period: 'rango', from: '2026-01-01', to: '2026-12-31' });
  assert.equal(profit.sales.count, 0);
  assert.equal(profit.net_profit, 0);
  assert.equal(call('sales.list', {}).length, 0);
  assert.equal(call('purchases.list', {}).length, 0);
  assert.equal(call('reports.cashflow', { period: 'rango', from: '2026-01-01', to: '2026-12-31' }).purchased, 0);

  // Se cobran y se pagan como cualquier otra deuda, y ese dinero sí entra y sale.
  call('sales.pay', { customer_id: customer, amount: 1500, method: 'efectivo' });
  call('suppliers.pay', { supplier_id: supplier, amount: 8000, method: 'transferencia' });
  assert.equal(call('customers.get', { id: customer }).balance, 2000);
  assert.equal(call('payables.list').length, 0);
  assert.equal(call('cash.status').open.expected, 2500);

  assert.throws(() => call('customers.opening', { customer_id: customer, amount: 0 }), /mayor que cero/);
  assert.throws(() => call('customers.opening', { customer_id: 999, amount: 10 }), /no encontrado/);
});

test('RF-NUE-02 y DT-22: depósito al banco, entrada y retiro', async () => {
  const { api, call } = await setup();
  call('cash.movement', { type: 'deposito_banco', amount: 400, description: 'Banco Popular, recibo 123' });
  call('cash.movement', { type: 'retiro', amount: 100, description: 'Para el dueño' });
  const s = call('cash.status').open;
  assert.equal(s.expected, 500);
  assert.equal(s.bank_deposits, 400);
  assert.equal(s.withdrawals, 100);
  assert.equal(s.other_out, 0);
  assert.throws(() => call('cash.movement', { type: 'deposito_banco', amount: 501, description: 'x' }), /suficiente efectivo/);
  assert.throws(() => call('cash.movement', { type: 'deposito_banco', amount: 10, description: '' }), /Descripción es obligatorio/);

  // En el flujo de dinero, el depósito no es una salida: el dinero pasa de efectivo a banco.
  const flow = call('reports.cashflow', { period: 'dia' });
  assert.equal(flow.total_out, 100);
  assert.equal(flow.total_in, 0);
  assert.equal(flow.bank_deposits, 400);
  assert.ok(!flow.outflows.some((o) => o.category === 'deposito_banco'));
  const byMethod = Object.fromEntries(flow.by_method.map((m) => [m.method, m.net]));
  assert.equal(byMethod.efectivo, -500);
  assert.equal(byMethod.transferencia, 400);

  // El vendedor deposita al banco, pero no retira.
  api.logout();
  api.login({ username: 'vendedor', password: 'vendedor123' });
  call('cash.movement', { type: 'deposito_banco', amount: 50, description: 'Depósito de la tarde' });
  call('cash.movement', { type: 'entrada', amount: 20, description: 'Sencillo' });
  assert.throws(() => call('cash.movement', { type: 'retiro', amount: 10, description: 'x' }), (e) => e.code === 'FORBIDDEN' && /Depósito al banco/.test(e.message));
  assert.throws(() => call('cash.movement', { type: 'otra', amount: 10, description: 'x' }), /inválido/);
});

test('DT-21: los aportes del dueño entran al flujo pero no son ganancia', async () => {
  const { api, call } = await setup();
  const id = call('capital.create', { amount: 20000, method: 'transferencia', description: 'Capital para mercancía' });
  call('incomes.create', { category: 'Otros ingresos', amount: 300, method: 'efectivo' });
  const profit = call('reports.profit', { period: 'mes' });
  assert.equal(profit.other_income, 300);
  assert.equal(profit.net_profit, 300);
  const flow = call('reports.cashflow', { period: 'mes' });
  assert.equal(flow.total_in, 20300);
  assert.equal(flow.capital, 20000);
  assert.equal(flow.inflows.find((i) => i.category === 'aporte_capital').label, 'Aportes del dueño');
  assert.equal(call('capital.list', {}).length, 1);

  call('capital.void', { id, reason: 'Se registró dos veces' });
  assert.equal(call('capital.list', {}).length, 0);
  assert.equal(call('reports.cashflow', { period: 'mes' }).capital, 0);
  assert.throws(() => call('capital.void', { id, reason: 'otra vez' }), /ya está anulado/);
  assert.ok(!JSON.parse(call('settings.get').income_categories).includes('Aporte del dueño'));

  api.logout();
  api.login({ username: 'vendedor', password: 'vendedor123' });
  assert.throws(() => call('capital.create', { amount: 1, method: 'efectivo' }), /permiso/);
});

test('RF-NUE-07: el precio al detalle es obligatorio', async () => {
  const { call } = await setup();
  assert.throws(() => call('products.save', { name: 'Gorra sin precio', cost: 100 }), /Precio al detalle/);
  assert.throws(() => call('products.save', { name: 'Gorra en cero', cost: 100, price_retail: 0 }), /mayor que cero/);
  const id = call('products.save', { name: 'Gorra', cost: 100, price_retail: 250 });
  assert.throws(() => call('products.save', { id, name: 'Gorra', cost: 100, price_retail: '' }), /Precio al detalle/);
});

test('RF-NUE-08: el historial no muestra claves en inglés', async () => {
  const { call } = await setup();
  call('expenses.create', { category: 'Alquiler', description: 'Septiembre', amount: 5000, method: 'transferencia' });
  call('users.save', { name: 'Ana', username: 'ana', role: 'vendedor', password: 'secreta1' });
  call('settings.save', { business_phone: '809-555-0000', require_open_cash: '0', currency: 'RD$' });
  call('terminals.save', { id: 1, name: 'Caja 1' });
  const english = /"(category|description|date|amount|method|name|username|role|active|password_reset|business_\w+|require_open_cash|despues":\{)"/;
  for (const row of call('reports.audit', {})) {
    if (row.details) assert.doesNotMatch(row.details, english, `${row.action}: ${row.details}`);
  }
  const settings = call('reports.audit', { action: 'editar_configuracion' })[0];
  const d = JSON.parse(settings.details);
  assert.deepEqual(d['Exigir caja abierta'], { antes: 'sí', despues: 'no' });
  assert.equal(d.Moneda, undefined, 'solo lo que cambió');
});

test('RF-NUE-06: recuperar la contraseña del administrador con el código', async () => {
  const { core, api, call, db } = await setup();
  assert.equal(call('recovery.status').exists, false);
  assert.throws(() => call('recovery.create', { password: 'mala' }), /no es correcta/);
  const { code } = call('recovery.create', { password: 'admin123' });
  assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  assert.equal(call('recovery.status').exists, true);
  // El código no se guarda en claro ni sale en la configuración.
  assert.equal(call('settings.get')._recovery, undefined);
  assert.ok(!db.value("SELECT value FROM settings WHERE key = '_recovery'").includes(code.replace(/-/g, '')));

  assert.throws(() => core.recover({ username: 'admin', code: 'AAAA-BBBB-CCCC-DDDD', password: 'nueva123' }), (e) => e.code === 'AUTH');
  assert.throws(() => core.recover({ username: 'vendedor', code, password: 'nueva123' }), (e) => e.code === 'AUTH', 'solo administradores');
  assert.throws(() => core.recover({ username: 'admin', code, password: '123' }), /al menos 6/);

  // Minúsculas y sin guiones también sirven. La sesión abierta se cierra.
  core.recover({ username: 'admin', code: code.toLowerCase().replace(/-/g, ' '), password: 'nueva123' });
  assert.throws(() => call('products.list'), (e) => e.code === 'AUTH');
  assert.throws(() => core.login({ username: 'admin', password: 'admin123' }), /incorrectos/);
  const r = core.login({ username: 'admin', password: 'nueva123' });
  assert.equal(r.user.must_change, 0);
  // Es de un solo uso.
  assert.throws(() => core.recover({ username: 'admin', code, password: 'otra123' }), (e) => e.code === 'AUTH');
  api.login({ username: 'admin', password: 'nueva123' });
  assert.equal(call('recovery.status').exists, false);
  assert.ok(call('reports.audit', { action: 'recuperar_contrasena' }).length === 1);
});
