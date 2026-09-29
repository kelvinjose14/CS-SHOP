'use strict';
// Dashboard ejecutivo (1.4): comparaciones, indicadores, utilidad por grupo, inventario y pronóstico.
// Usa un reloj simulado para registrar ventas en fechas pasadas con la API real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { client } = require('./helpers');
const { comparisons, yearBefore, monthBefore } = require('../src/core/services/executive');

const RealDate = Date;
let simulated = null;
class SimDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(simulated ?? RealDate.now());
  }
  static now() { return simulated ?? RealDate.now(); }
}
const at = (d, time = '11:00:00') => { simulated = new RealDate(`${d}T${time}`).getTime(); };

async function store() {
  globalThis.Date = SimDate;
  at('2025-09-01');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-ejecutivo-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  const admin = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  const call = (n, p) => admin.call(n, p);
  call('users.save', { username: 'ana', name: 'Ana', role: 'vendedor', password: 'vendedora1' });
  const ana = client(api);
  ana.login({ username: 'ana', password: 'vendedora1' });
  call('cash.open', { amount: 0 });
  const p = {
    ny: call('products.save', { name: 'Gorra NY', brand: 'New Era', category: 'Fitted', cost: 500, price_retail: 1000, initial_stock: 50 }),
    la: call('products.save', { name: 'Gorra LA', brand: 'New Era', category: 'Snapback', cost: 300, price_retail: 800, initial_stock: 50 }),
    tr: call('products.save', { name: 'Trucker', brand: '47 Brand', cost: 200, price_retail: 400, initial_stock: 50 }),
    old: call('products.save', { name: 'Gorra vieja', brand: 'Otra', category: 'Snapback', cost: 250, price_retail: 600, initial_stock: 4 }),
  };
  // Al saltar días la sesión vence, como en la tienda: se vuelve a entrar.
  const go = (d, time) => {
    at(d, time);
    admin.login({ username: 'admin', password: 'admin123' });
    ana.login({ username: 'ana', password: 'vendedora1' });
  };
  const sell = (who, items) => who.call('sales.create', { sale_type: 'detalle', payment_type: 'contado', items: items.map(([id, qty]) => ({ product_id: id, qty })), payments: [{ method: 'efectivo', amount: 99999 }] });
  return { db, call, admin, ana, p, sell, go };
}

test.after(() => { globalThis.Date = RealDate; });

test('fechas de comparación: mes en curso hasta el mismo día, mes cerrado completo, año anterior', () => {
  assert.equal(yearBefore('2028-02-29'), '2027-02-28');
  assert.equal(monthBefore('2026-03-31'), '2026-02-28');
  assert.equal(monthBefore('2026-01-15'), '2025-12-15');
  const t = '2026-09-15';
  let c = comparisons('mes', '2026-09-01', '2026-09-30', t);
  assert.deepEqual(c.current, { from: '2026-09-01', to: '2026-09-15' });
  assert.deepEqual([c.prev.from, c.prev.to, c.prev.label], ['2026-08-01', '2026-08-15', 'el mes anterior']);
  assert.deepEqual([c.yoy.from, c.yoy.to], ['2025-09-01', '2025-09-15']);
  c = comparisons('mes', '2026-03-01', '2026-03-31', t);
  assert.deepEqual([c.prev.from, c.prev.to], ['2026-02-01', '2026-02-28'], 'un mes terminado se compara con el anterior completo');
  c = comparisons('dia', t, t, t);
  assert.deepEqual([c.prev.from, c.prev.label], ['2026-09-14', 'ayer']);
  c = comparisons('anio', '2026-01-01', '2026-12-31', t);
  assert.deepEqual([c.prev.from, c.prev.to, c.yoy], ['2025-01-01', '2025-09-15', null]);
  c = comparisons('rango', '2026-09-01', '2026-09-10', t);
  assert.deepEqual([c.prev.from, c.prev.to], ['2026-08-22', '2026-08-31']);
});

test('indicadores con comparación, utilidad por grupo, inventario estancado y pronóstico', async () => {
  const { call, admin, ana, p, sell, go } = await store();
  // Hace un año: 2 NY.
  go('2025-09-10'); sell(admin, [[p.ny, 2]]);
  // Agosto: dos ventas antes del día 15 y una después (esa no cuenta al comparar hasta el 15).
  go('2026-08-05'); sell(admin, [[p.ny, 1]]); sell(ana, [[p.la, 1]]);
  go('2026-08-20'); sell(admin, [[p.ny, 5]]);
  // Septiembre: ayer y hoy.
  go('2026-09-14'); const s1 = sell(ana, [[p.ny, 2], [p.tr, 1]]);
  go('2026-09-15', '10:00:00'); sell(admin, [[p.la, 3]]);
  // Hoy devuelven la trucker de ayer.
  const item = call('sales.get', { id: s1 }).items.find((i) => i.product_id === p.tr);
  call('sales.return', { sale_id: s1, items: [{ sale_item_id: item.id, qty: 1 }], refund_method: 'efectivo', restock: true, reason: 'No le quedó' });
  go('2026-09-15', '18:00:00');

  const r = call('reports.executive', { period: 'mes' });
  assert.deepEqual([r.from, r.to, r.compared_to], ['2026-09-01', '2026-09-30', '2026-09-15']);
  const c = r.current;
  // Ventas: 2 000 + 400 + 2 400 − 400 = 4 400; costo 1 000 + 200 + 900 − 200 = 1 900.
  assert.equal(c.sales, 4400);
  assert.equal(c.gross_profit, 2500);
  assert.equal(c.margin, 56.82);
  assert.equal(c.tickets, 2);
  assert.equal(c.avg_ticket, 2200);
  assert.equal(c.units, 5, '3 NY/tr + 3 LA − 1 devuelta');
  assert.equal(c.units_per_ticket, 2.5);
  // Agosto hasta el 15: 1 000 + 800 = 1 800 → +144.44 %.
  assert.equal(r.prev.sales.value, 1800);
  assert.equal(r.prev.sales.change, 144.44);
  assert.equal(r.prev.tickets.value, 2);
  assert.equal(r.prev.margin.change, round(56.82 - ((1800 - 800) / 1800) * 100));
  // Hace un año: 2 000.
  assert.equal(r.yoy.sales.value, 2000);
  assert.equal(r.yoy.sales.change, 120);

  // Utilidad por grupo: cada tabla suma lo mismo que el indicador.
  for (const key of ['by_product', 'by_brand', 'by_category', 'by_seller']) {
    assert.equal(round(r[key].reduce((s, x) => s + x.revenue, 0)), c.sales, key);
    assert.equal(round(r[key].reduce((s, x) => s + x.profit, 0)), c.gross_profit, key);
  }
  const seller = Object.fromEntries(r.by_seller.map((x) => [x.name, x]));
  assert.equal(seller.Ana.revenue, 2000, 'la devolución se resta de quien vendió');
  assert.equal(seller.Ana.tickets, 1);
  assert.equal(seller.Administrador.revenue, 2400);
  const cat = Object.fromEntries(r.by_category.map((x) => [x.name, x]));
  assert.equal(cat.Fitted.profit, 1000);
  assert.equal(cat.Snapback.profit, 1500);
  assert.equal(cat['Sin categoría'].revenue, 0, 'la trucker vendida y devuelta queda en cero');
  const brand = Object.fromEntries(r.by_brand.map((x) => [x.name, x]));
  assert.equal(brand['New Era'].revenue, 4400);

  // Inventario: la gorra vieja no se vende desde que llegó (hace más de un año).
  const inv = r.inventory;
  const old = inv.stagnant.find((x) => x.id === p.old);
  assert.ok(old, 'la gorra vieja está estancada');
  assert.equal(old.value, 1000);
  assert.ok(old.days_without_sale > 365);
  assert.ok(!inv.stagnant.some((x) => x.id === p.la), 'la LA se vendió hoy');
  assert.equal(inv.stagnant.find((x) => x.id === p.ny), undefined);
  assert.ok(inv.turnover > 0 && inv.days_of_inventory > 0);

  // Pronóstico: lo vendido + lo esperado para los 15 días que faltan.
  const f = r.forecast;
  assert.equal(f.sales_so_far, 4400);
  assert.equal(f.days_left, 15);
  assert.equal(f.method, 'dia_semana');
  assert.ok(f.forecast >= f.sales_so_far);
  assert.equal(f.previous_month.sales, 6800); // 1 000 + 800 + 5 000
  assert.equal(f.last_year.sales, 2000);

  // Solo el administrador.
  assert.throws(() => ana.call('reports.executive', {}), /permiso/i);
});

test('pronóstico con poca historia usa el promedio diario del mes', async () => {
  const { admin, p, sell, go } = await store();
  go('2026-09-01'); sell(admin, [[p.ny, 1]]);
  go('2026-09-02'); sell(admin, [[p.ny, 1]]);
  go('2026-09-03', '09:00:00');
  const f = admin.call('reports.executive', { period: 'mes' }).forecast;
  assert.equal(f.method, 'promedio');
  // 2 000 en 2 días → 1 000 por día; hoy todavía nada: se estima 1 000 hoy y 1 000 cada uno de los 27 que faltan.
  assert.equal(f.forecast, 2000 + 1000 + 27 * 1000);
});

const round = (n) => Math.round(n * 100) / 100;
