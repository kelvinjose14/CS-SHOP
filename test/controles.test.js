'use strict';
// Controles de la auditoría de producción, secciones 2 y 4 (docs/tecnico/auditoria.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { today, addDays } = require('../src/core/util');
const { parseRegistry } = require('../src/main/region');
const { client } = require('./helpers');

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-ctl-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const core = createApi(db);
  const api = client(core);
  api.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => api.call(n, p);
  const sup = call('suppliers.save', { name: 'Proveedor' });
  return { db, core, api, call, sup };
}
const as = (api, who) => {
  api.logout();
  api.login(who === 'admin' ? { username: 'admin', password: 'admin123' } : { username: 'vendedor', password: 'vendedor123' });
};
const code = (c, re) => (e) => e.code === c && (!re || re.test(e.message));

test('2.1: abrir la caja con otro monto que el del último cierre pide el motivo', async () => {
  const { call } = await setup();
  call('cash.open', { amount: 500 }); // la primera vez no hay con qué comparar
  call('cash.close', { counted: 1000 });
  assert.throws(() => call('cash.open', { amount: 200 }), code('OPENING_REASON', /\(200\.00\).*\(1000\.00\)/));
  const id = call('cash.open', { amount: 200, reason: 'El dueño se llevó 800 al banco' });
  const s = call('cash.status').open;
  assert.equal(s.id, id);
  assert.equal(s.opening_difference, -800);
  assert.equal(s.opening_reason, 'El dueño se llevó 800 al banco');
  const a = JSON.parse(call('reports.audit', { action: 'apertura_caja' })[0].details);
  assert.deepEqual(a, { efectivo_inicial: 200, contado_al_cerrar: 1000, diferencia: -800, motivo: 'El dueño se llevó 800 al banco' });
  assert.equal(call('cash.history')[0].opening_difference, -800);
  // Con el mismo monto no hace falta motivo, y si se escribe no se guarda.
  call('cash.close', { counted: 200 });
  call('cash.open', { amount: 200, reason: 'nada' });
  assert.equal(call('cash.status').open.opening_difference, 0);
  assert.equal(call('cash.status').open.opening_reason, null);
});

test('4.2: depósitos al banco por verificar, verificados y que no llegaron', async () => {
  const { api, call } = await setup();
  call('cash.open', { amount: 5000 });
  as(api, 'vendedor');
  call('cash.movement', { type: 'deposito_banco', amount: 2000, description: 'Popular, boleta 111' });
  call('cash.movement', { type: 'deposito_banco', amount: 500, description: 'Popular, boleta 222' });
  assert.throws(() => call('deposits.list'), code('FORBIDDEN'));
  assert.equal(call('reports.dashboard').deposits_pending, undefined, 'el vendedor no ve el aviso');
  as(api, 'admin');
  const [d500, d2000] = call('deposits.list', { status: 'pendiente' });
  assert.equal(d2000.amount, 2000);
  assert.equal(d2000.user_name, 'Vendedor');
  assert.equal(d2000.terminal_name, 'Principal');
  assert.deepEqual(call('reports.dashboard').deposits_pending, { count: 2, amount: 2500, oldest: today() });

  // Está en el banco.
  call('deposits.check', { movement_id: d2000.id, status: 'verificado', note: 'Estado de cuenta' });
  assert.throws(() => call('deposits.check', { movement_id: d2000.id, status: 'verificado' }), /ya se revisó/);
  assert.equal(call('deposits.list', { status: 'verificado' })[0].check_note, 'Estado de cuenta');
  assert.equal(call('reports.dashboard').deposits_pending.count, 1);
  // Verificado por error: se desmarca.
  call('deposits.uncheck', { movement_id: d2000.id });
  assert.equal(call('reports.dashboard').deposits_pending.count, 2);
  call('deposits.check', { movement_id: d2000.id, status: 'verificado' });

  // No llegó: se quita del banco y cuenta como dinero que salió del negocio.
  const before = call('reports.cashflow', { period: 'dia' });
  assert.throws(() => call('deposits.check', { movement_id: d500.id, status: 'no_recibido' }), /Motivo es obligatorio/);
  call('deposits.check', { movement_id: d500.id, status: 'no_recibido', note: 'No aparece en el estado de cuenta' });
  assert.throws(() => call('deposits.uncheck', { movement_id: d500.id }), /Solo se puede desmarcar/);
  const after = call('reports.cashflow', { period: 'dia' });
  assert.equal(after.total_out - before.total_out, 500);
  assert.equal(after.outflows.find((o) => o.category === 'deposito_no_recibido').label, 'Depósitos que no llegaron al banco');
  const bank = (cf) => cf.by_method.find((m) => m.method === 'transferencia').net;
  assert.equal(bank(before) - bank(after), 500);
  assert.equal(call('reports.dashboard').deposits_pending.count, 0);
  assert.equal(call('reports.audit', { action: 'deposito_no_recibido' }).length, 1);
  assert.equal(call('reports.audit', { action: 'verificar_deposito' }).length, 2);

  // Un depósito revisado ya no se anula; uno anulado no se revisa.
  assert.throws(() => call('cash.voidMovement', { movement_id: d2000.id, reason: 'x' }), /ya se revisó/);
  as(api, 'vendedor');
  const d3 = call('cash.movement', { type: 'deposito_banco', amount: 100, description: 'Equivocado' });
  as(api, 'admin');
  call('cash.voidMovement', { movement_id: d3, reason: 'Se registró dos veces' });
  assert.equal(call('deposits.list').find((d) => d.id === d3).status, 'anulado');
  assert.throws(() => call('deposits.check', { movement_id: d3, status: 'verificado' }), /anulado/);
  assert.equal(call('reports.dashboard').deposits_pending.count, 0);
});

test('2.2: un producto desactivado con existencia sigue en el valor del inventario', async () => {
  const { call } = await setup();
  const a = call('products.save', { name: 'A', cost: 100, price_retail: 300, initial_stock: 10 });
  call('products.save', { name: 'B', cost: 50, price_retail: 150, initial_stock: 4 });
  const before = call('products.summary');
  call('products.save', { ...call('products.get', { id: a }), active: false });
  const after = call('products.summary');
  assert.equal(after.value_cost, before.value_cost);
  assert.equal(after.value_cost, 1200);
  assert.equal(after.units, 14);
  assert.equal(after.products, before.products - 1, 'no cuenta como producto a la venta');
  assert.equal(after.inactive_units, 10);
  assert.equal(after.inactive_with_stock, 1);
});

test('2.3: clientes desactivados: solo el administrador, sin deuda y sin ventas', async () => {
  const { db, api, call } = await setup();
  call('cash.open', { amount: 0 });
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 500, initial_stock: 20 });
  const cu = call('customers.save', { name: 'Luis' });
  call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] });
  assert.throws(() => call('customers.save', { id: cu, name: 'Luis', active: false }), /Luis debe 500\.00: no se puede desactivar/);
  as(api, 'vendedor');
  assert.throws(() => call('customers.save', { id: cu, name: 'Luis', active: false }), code('FORBIDDEN'));
  call('customers.save', { id: cu, name: 'Luis Pérez', phone: '809' }); // editar sí puede
  call('sales.pay', { customer_id: cu, amount: 500, method: 'efectivo' });
  as(api, 'admin');
  call('customers.save', { id: cu, name: 'Luis Pérez', active: false });
  assert.equal(call('customers.list').some((c) => c.id === cu), false);
  assert.equal(call('customers.list', { includeInactive: true }).find((c) => c.id === cu).active, 0);
  for (const payment_type of ['contado', 'credito']) {
    assert.throws(() => call('sales.create', { customer_id: cu, payment_type, items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 500 }] }), /está desactivado/);
  }
  assert.throws(() => call('customers.opening', { customer_id: cu, amount: 100 }), /está desactivado/);
  // Un cliente desactivado con deuda (de antes de la 1.3) sigue en cuentas por cobrar.
  const old = call('customers.save', { name: 'Viejo' });
  call('customers.opening', { customer_id: old, amount: 300 });
  db.run('UPDATE customers SET active = 0 WHERE id = ?', [old]);
  assert.ok(call('customers.list', { withBalance: true }).some((c) => c.id === old));
  call('customers.save', { id: cu, name: 'Luis Pérez', active: true });
  assert.ok(call('customers.list').some((c) => c.id === cu));
});

test('2.4: límite de crédito y deuda vencida; el administrador autoriza', async () => {
  const { api, call } = await setup();
  call('cash.open', { amount: 0 });
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 400, initial_stock: 50 });
  const cu = call('customers.save', { name: 'Ana', credit_limit: 1000 });
  const credit = (qty, extra = {}) => call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty }], ...extra });
  as(api, 'vendedor');
  call('customers.save', { id: cu, name: 'Ana', credit_limit: 999999 }); // el vendedor no cambia el límite
  assert.equal(call('customers.get', { id: cu }).credit_limit, 1000);
  credit(2); // debe 800
  assert.throws(() => credit(1), code('CREDIT_BLOCKED', /debería 1200\.00 y su límite de crédito es 1000\.00.*Solo el administrador/));
  // Con abono inicial suficiente, lo que queda a crédito sí cabe.
  call('sales.create', { customer_id: cu, payment_type: 'credito', items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 300 }] });
  as(api, 'admin');
  assert.throws(() => credit(1), code('CREDIT_CONFIRM', /¿Autoriza/));
  const id = credit(1, { authorize_credit: true });
  assert.match(JSON.parse(call('reports.audit', { action: 'registrar_venta' }).find((r) => r.entity_id === id).details).credito_autorizado, /límite de crédito/);
  // De contado no hay control de crédito.
  call('sales.create', { customer_id: cu, items: [{ product_id: p, qty: 1 }], payments: [{ method: 'efectivo', amount: 400 }] });

  // Deuda vencida (sin límite).
  const luis = call('customers.save', { name: 'Luis' });
  call('customers.opening', { customer_id: luis, amount: 200, date: '2026-01-02', due_date: '2026-01-31' });
  assert.equal(call('customers.get', { id: luis }).overdue_balance, 200);
  as(api, 'vendedor');
  assert.throws(() => call('sales.create', { customer_id: luis, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] }), code('CREDIT_BLOCKED', /Luis tiene 200\.00 vencido/));
  as(api, 'admin');
  call('settings.save', { block_overdue_credit: '0' });
  as(api, 'vendedor');
  call('sales.create', { customer_id: luis, payment_type: 'credito', items: [{ product_id: p, qty: 1 }] });
});

test('2.5 y 2.6: fechas que no existen o futuras, vencimientos anteriores y textos largos', async () => {
  const { call, sup } = await setup();
  call('cash.open', { amount: 0 });
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 400, initial_stock: 5 });
  const tomorrow = addDays(today(), 1);
  assert.throws(() => call('expenses.create', { category: 'Alquiler', amount: 10, method: 'efectivo', date: '2026-02-31' }), /la fecha 2026-02-31 no existe/);
  assert.throws(() => call('expenses.create', { category: 'Alquiler', amount: 10, method: 'efectivo', date: tomorrow }), /no puede ser posterior a hoy/);
  assert.throws(() => call('incomes.create', { category: 'Servicios', amount: 10, method: 'efectivo', date: '2099-01-01' }), /posterior a hoy/);
  assert.throws(() => call('capital.create', { amount: 10, method: 'efectivo', date: tomorrow }), /posterior a hoy/);
  assert.throws(() => call('purchases.create', { supplier_id: sup, date: tomorrow, payment_type: 'contado', payment_method: 'efectivo', items: [{ product_id: p, qty: 1, unit_cost: 100 }] }), /Fecha de la compra no puede ser posterior/);
  assert.throws(() => call('purchases.create', { supplier_id: sup, payment_type: 'credito', due_date: '2020-01-01', items: [{ product_id: p, qty: 1, unit_cost: 100 }] }), /vencimiento no puede ser anterior/);
  const cu = call('customers.save', { name: 'Ana' });
  assert.throws(() => call('sales.create', { customer_id: cu, payment_type: 'credito', due_date: '2020-01-01', items: [{ product_id: p, qty: 1 }] }), /vencimiento no puede ser anterior/);
  assert.throws(() => call('customers.opening', { customer_id: cu, amount: 10, date: '2026-01-10', due_date: '2026-01-05' }), /anterior al 10\/01\/2026/);
  assert.throws(() => call('reports.profit', { period: 'rango', from: '2026-02-30', to: '2026-03-01' }), /no existe/);
  call('expenses.create', { category: 'Alquiler', amount: 10, method: 'efectivo', date: '2024-02-29' }); // bisiesto

  assert.throws(() => call('products.save', { name: 'x'.repeat(300), price_retail: 100 }), /Nombre es demasiado largo: tiene 300 caracteres y el máximo es 120/);
  assert.throws(() => call('customers.save', { name: 'Ana', notes: 'n'.repeat(1001) }), /Notas es demasiado largo/);
  call('customers.save', { name: 'a'.repeat(120) }); // justo el máximo
});

test('2.7 y 2.8: costo 0 o muy distinto se confirma; categorías solo de la lista', async () => {
  const { call, sup } = await setup();
  call('cash.open', { amount: 0 });
  const p = call('products.save', { name: 'Gorra', cost: 300, price_retail: 900, initial_stock: 10 });
  const buy = (unit_cost, extra) => call('purchases.create', { supplier_id: sup, payment_type: 'credito', items: [{ product_id: p, qty: 5, unit_cost }], ...extra });
  assert.throws(() => buy(0), code('COST_CONFIRM', /"Gorra" a costo 0 \(el actual es 300\.00\)/));
  assert.throws(() => buy(1000), code('COST_CONFIRM', /a 1000\.00/));
  assert.throws(() => buy(100), code('COST_CONFIRM'));
  assert.equal(call('products.get', { id: p }).cost, 300, 'sin confirmar no cambia nada');
  buy(400); // dentro de la mitad y el doble: sin preguntar
  const id = buy(0, { confirm_costs: true });
  assert.match(JSON.parse(call('reports.audit', { action: 'registrar_compra' }).find((r) => r.entity_id === id).details).costos_confirmados[0], /costo 0/);

  assert.throws(() => call('expenses.create', { category: 'Inventada', amount: 10, method: 'efectivo' }), /La categoría "Inventada" no está en la lista/);
  assert.throws(() => call('incomes.create', { category: 'Alquiler', amount: 10, method: 'efectivo' }), /no está en la lista/);
  call('settings.save', { expense_categories: JSON.stringify(['Alquiler', 'Inventada']) });
  call('expenses.create', { category: 'Inventada', amount: 10, method: 'efectivo' });
});

test('2.11: la base rechaza por sí misma montos y movimientos imposibles', async () => {
  const { db, call } = await setup();
  const p = call('products.save', { name: 'Gorra', cost: 100, price_retail: 400, initial_stock: 5 });
  const rejected = /La base de datos rechazó el cambio/;
  assert.throws(() => db.run("INSERT INTO money_movements (date, direction, amount, method, category, created_at) VALUES ('2026-01-01', 'in', 0, 'efectivo', 'venta', 'x')"), rejected);
  assert.throws(() => db.run("INSERT INTO expenses (category, date, amount, method, created_at) VALUES ('Alquiler', '2026-01-01', -5, 'efectivo', 'x')"), rejected);
  assert.throws(() => db.run('UPDATE products SET price_retail = -1 WHERE id = ?', [p]), /costo, precio ni mínimo negativos/);
  assert.throws(() => db.run("INSERT INTO inventory_movements (product_id, type, qty, stock_before, stock_after, created_at) VALUES (?, 'ajuste', 3, 5, 9, 'x')", [p]), /no cuadra con la existencia/);
  assert.throws(() => db.run("INSERT INTO sale_payments (sale_id, date, amount, method, kind, created_at) VALUES (1, '2026-01-01', 0, 'efectivo', 'abono', 'x')"), rejected);
  db.run('UPDATE products SET stock = -2 WHERE id = ?', [p]); // la existencia negativa puede estar permitida
});

test('4.7: las contraseñas nuevas piden 8 caracteres', async () => {
  const { call } = await setup();
  assert.throws(() => call('users.save', { name: 'Ana', username: 'ana', role: 'vendedor', password: 'corta12' }), /al menos 8/);
  call('users.save', { name: 'Ana', username: 'ana', role: 'vendedor', password: 'larga123' });
  assert.throws(() => call('auth.changePassword', { current: 'admin123', password: '1234567' }), /al menos 8/);
});

test('2.10: separador del CSV según la región de Windows', () => {
  const reg = (list, dec) => `\r\nHKEY_CURRENT_USER\\Control Panel\\International\r\n    Locale    REG_SZ    00001C0A\r\n    sDecimal    REG_SZ    ${dec}\r\n    sList    REG_SZ    ${list}\r\n`;
  assert.deepEqual(parseRegistry(reg(',', '.')), { sep: ',', dec: '.' }); // República Dominicana
  assert.deepEqual(parseRegistry(reg(';', ',')), { sep: ';', dec: ',' }); // España
  assert.deepEqual(parseRegistry(reg(',', ',')), { sep: ';', dec: ',' }, 'si coinciden, las columnas van con punto y coma');
  assert.deepEqual(parseRegistry(''), { sep: ',', dec: '.' });
});
