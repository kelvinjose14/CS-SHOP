'use strict';
// CRM de clientes (1.6): métricas, segmentos, VIP, cumpleaños, etiquetas, notas y favoritos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const { client } = require('./helpers');
const { cleanBirthday, daysToBirthday, cleanTags } = require('../src/core/services/crm');

const RealDate = Date;
let simulated = null;
class SimDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(simulated ?? RealDate.now());
  }
  static now() { return simulated ?? RealDate.now(); }
}
test.after(() => { globalThis.Date = RealDate; });

async function store() {
  globalThis.Date = SimDate;
  simulated = new RealDate('2026-01-02T10:00:00').getTime();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-crm-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  const admin = client(api);
  const seller = client(api);
  const login = () => {
    admin.login({ username: 'admin', password: 'admin123' });
    seller.login({ username: 'vendedor', password: 'vendedor123' });
  };
  login();
  const call = (n, p) => admin.call(n, p);
  call('settings.modules', { crm: true }); // viene apagado (DT-50)
  call('cash.open', { amount: 0 });
  const fitted = call('products.save', { name: 'Gorra fitted', brand: 'New Era', category: 'Fitted', size: '7 1/4', cost: 500, price_retail: 1000, initial_stock: 500 });
  const trucker = call('products.save', { name: 'Trucker', brand: 'Otto', category: 'Trucker', size: 'Ajustable', cost: 200, price_retail: 500, initial_stock: 500 });
  const go = (d) => { simulated = new RealDate(`${d}T11:00:00`).getTime(); login(); };
  const sell = (customer, items) => call('sales.create', { customer_id: customer, items: items.map(([id, qty]) => ({ product_id: id, qty })), payments: [{ method: 'efectivo', amount: 99999 }] });
  return { db, call, seller, go, sell, p: { fitted, trucker } };
}

test('cumpleaños y etiquetas: se escriben como en la tienda y se guardan limpios', () => {
  assert.equal(cleanBirthday('15/08'), '08-15');
  assert.equal(cleanBirthday('5-3'), '03-05');
  assert.equal(cleanBirthday('1990-12-31'), '12-31');
  assert.equal(cleanBirthday(''), null);
  assert.throws(() => cleanBirthday('31/02'), /el 31\/2 no existe/);
  assert.throws(() => cleanBirthday('mañana'), /escriba el día y el mes/);
  assert.equal(daysToBirthday('09-15', '2026-09-15'), 0);
  assert.equal(daysToBirthday('09-14', '2026-09-15'), 364);
  assert.equal(daysToBirthday('02-29', '2027-02-27'), 1, 'en año no bisiesto se celebra el 28');
  assert.equal(cleanTags('mayorista, NY ,  mayorista, Fitted'), JSON.stringify(['mayorista', 'NY', 'Fitted']));
  assert.equal(cleanTags(''), null);
  assert.throws(() => cleanTags('a,b,c,d,e,f,g,h,i,j,k'), /hasta 10 etiquetas/);
});

test('segmentos, frecuencia, VIP, favoritos, notas y cumpleaños de la semana', async () => {
  const { call, seller, go, sell, p } = await store();
  const ana = call('customers.save', { name: 'Ana', phone: '809-555-0001', birthday: '18/09', tags: 'mayorista, NY' });
  const luis = call('customers.save', { name: 'Luis', birthday: '01/10' });
  const pedro = call('customers.save', { name: 'Pedro' });
  const marta = call('customers.save', { name: 'Marta' });
  const nadie = call('customers.save', { name: 'Sin compras' });

  // Luis: una compra hace más de 90 días → perdido.
  go('2026-05-01'); sell(luis, [[p.trucker, 1]]);
  // Pedro: compraba cada 20 días y dejó de venir hace 60 → en riesgo (más del doble de lo normal).
  go('2026-06-17'); sell(pedro, [[p.trucker, 1]]);
  go('2026-07-07'); sell(pedro, [[p.trucker, 1]]);
  go('2026-07-27'); sell(pedro, [[p.trucker, 1]]);
  // Ana: cada 10 días, 4 compras → frecuente; gasta 7 000 → VIP con el mínimo en 5 000.
  for (const d of ['2026-08-16', '2026-08-26', '2026-09-05', '2026-09-15']) { go(d); sell(ana, [[p.fitted, 1], [p.trucker, 1]]); }
  go('2026-09-15'); sell(ana, [[p.fitted, 2]]);
  // Marta: primera compra hace 5 días → nueva.
  go('2026-09-10'); sell(marta, [[p.fitted, 1]]);
  go('2026-09-15');
  call('settings.save', { vip_min_spend: 5000 });

  const list = call('customers.list', {});
  const by = Object.fromEntries(list.map((c) => [c.name, c]));
  assert.equal(by.Ana.segment, 'frecuente');
  assert.equal(by.Ana.purchases, 5);
  assert.equal(by.Ana.spent, 8000);
  assert.equal(by.Ana.avg_ticket, 1600);
  assert.equal(by.Ana.interval_days, 8, '30 días entre la primera y la última, en 4 intervalos: 7.5');
  assert.equal(by.Ana.vip, 1);
  assert.deepEqual(by.Ana.tags, ['mayorista', 'NY']);
  assert.equal(by.Ana.birthday_in, 3);
  assert.equal(by.Pedro.segment, 'en_riesgo');
  assert.equal(by.Pedro.interval_days, 20);
  assert.equal(by.Pedro.days_since, 50);
  assert.equal(by.Luis.segment, 'perdido');
  assert.equal(by.Marta.segment, 'nuevo');
  assert.equal(by['Sin compras'].segment, 'sin_compras');
  assert.equal(by['Sin compras'].vip, 0);

  // Filtros por segmento, VIP y etiqueta.
  assert.deepEqual(call('customers.list', { segment: 'vip' }).map((c) => c.id), [ana]);
  assert.deepEqual(call('customers.list', { segment: 'perdido' }).map((c) => c.id), [luis]);
  assert.deepEqual(call('customers.list', { tag: 'ny' }).map((c) => c.id), [ana]);
  assert.deepEqual(call('customers.list', { search: 'mayorista' }).map((c) => c.id), [ana]);

  // VIP a mano: solo el administrador. "No" quita el VIP automático; "sí" lo pone.
  seller.call('customers.save', { id: pedro, name: 'Pedro', vip_mode: 'si' });
  assert.equal(call('customers.get', { id: pedro }).vip, 0, 'el vendedor no cambia el VIP');
  call('customers.save', { id: pedro, name: 'Pedro', vip_mode: 'si' });
  call('customers.save', { id: ana, name: 'Ana', vip_mode: 'no' });
  assert.deepEqual(call('customers.list', { segment: 'vip' }).map((c) => c.id), [pedro]);
  assert.ok(call('reports.audit', {}).some((a) => a.action === 'editar_cliente' && a.details.includes('"vip"')));

  // Ficha: lo que más compra, notas y apartados activos. El vendedor la ve sin costos.
  seller.call('customers.addNote', { customer_id: ana, text: 'Pidió avisarle cuando lleguen las NY rojas' });
  seller.call('reservations.create', { customer_id: ana, items: [{ product_id: p.fitted, qty: 1 }] });
  const f = seller.call('customers.get', { id: ana });
  assert.deepEqual({ ...f.favorites.categories[0] }, { name: 'Fitted', units: 6 });
  assert.equal(f.favorites.sizes[0].name, '7 1/4');
  assert.equal(f.notes_log[0].text, 'Pidió avisarle cuando lleguen las NY rojas');
  assert.equal(f.notes_log[0].user_name, 'Vendedor');
  assert.equal(f.reservations.length, 1);
  assert.throws(() => call('customers.addNote', { customer_id: ana, text: ' ' }), /Nota es obligatoria|Nota es obligatorio/);

  // Cumpleaños: los de la próxima semana, primero el más cercano; también en el Inicio.
  assert.deepEqual(call('customers.birthdays', { days: 30 }).map((c) => [c.name, c.birthday_in]), [['Ana', 3], ['Luis', 16]]);
  assert.deepEqual(call('reports.dashboard').birthdays.map((c) => c.name), ['Ana']);
  assert.throws(() => call('customers.save', { id: marta, name: 'Marta', birthday: '30/02' }), /no existe/);
  void nadie;
});

test('el CRM viene apagado: sin cumpleaños, solo el administrador lo enciende y no queda en el historial (DT-50)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-crm-off-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  const api = createApi(db);
  const admin = client(api);
  const seller = client(api);
  admin.login({ username: 'admin', password: 'admin123' });
  seller.login({ username: 'vendedor', password: 'vendedor123' });
  const t = new Date();
  const dm = `${t.getDate()}/${t.getMonth() + 1}`;
  admin.call('customers.save', { name: 'Ana', birthday: dm });
  assert.equal(admin.call('settings.get').crm_enabled, '0');
  assert.equal(seller.call('settings.get').crm_enabled, '0');
  assert.deepEqual(admin.call('customers.birthdays', { days: 30 }), []);
  assert.deepEqual(admin.call('reports.dashboard').birthdays, []);
  assert.throws(() => seller.call('settings.modules', { crm: true }), /permiso|administrador/i);
  const before = db.get('SELECT COUNT(*) AS n FROM audit_log').n;
  assert.deepEqual(admin.call('settings.modules', { crm: true }), { crm: true });
  assert.equal(admin.call('settings.get').crm_enabled, '1');
  assert.equal(admin.call('customers.birthdays', { days: 30 }).length, 1);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM audit_log').n, before, 'no deja rastro en el historial');
  // Guardar la configuración no toca el interruptor.
  admin.call('settings.save', { business_name: 'Otra', crm_enabled: '0', _mod_crm: '0' });
  assert.equal(admin.call('settings.get').crm_enabled, '1');
  admin.call('settings.modules', { crm: false });
  assert.deepEqual(admin.call('customers.birthdays', { days: 30 }), []);
});
