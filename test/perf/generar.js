'use strict';
// Genera una base con unos 3 años de operación de la tienda, usando la API real (mismas reglas que la app).
// Uso: node test/perf/generar.js [archivo.db]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openDatabase } = require('../../src/core/db');
const { createApi } = require('../../src/core/api');
const { SCHEMA_VERSION } = require('../../src/core/schema');

const DAYS = 3 * 365;
const SALES_PER_DAY = 18; // ≈ 19,700 ventas
const DEFAULT_FILE = path.join(os.tmpdir(), `capsshop-rendimiento-v${SCHEMA_VERSION}.db`);

// Números pseudoaleatorios repetibles: la base generada es siempre la misma.
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

// Reloj simulado: las operaciones toman la fecha "de hoy" del día que se está generando.
const RealDate = Date;
let simulated = null;
class SimDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(simulated ?? RealDate.now());
  }
  static now() {
    return simulated ?? RealDate.now();
  }
}

async function generate(file = DEFAULT_FILE, { log = console.log } = {}) {
  for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
  const db = await openDatabase(file);
  db.exec('PRAGMA synchronous = OFF'); // solo para generar rápido; la app usa FULL
  const api = createApi(db);
  let token = null;
  const login = () => {
    const r = api.login({ username: 'admin', password: 'admin123' });
    token = r.token;
    if (r.user.must_change) api.call(token, 'auth.changePassword', { current: 'admin123', password: 'admin123' });
  };
  const call = (name, params) => api.call(token, name, params);
  const started = RealDate.now();
  globalThis.Date = SimDate;
  try {
    const start = new RealDate();
    start.setHours(10, 0, 0, 0);
    start.setDate(start.getDate() - DAYS);
    simulated = start.getTime();
    login();

    const supplier = call('suppliers.save', { name: 'Distribuidora de gorras' });
    const products = [];
    const prices = new Map();
    for (let i = 1; i <= 150; i++) {
      const cost = between(250, 900);
      const id = call('products.save', {
        name: `Gorra modelo ${i}`, brand: pick(['New Era', 'Nike', 'Jordan', 'Adidas', 'Puma']), color: pick(['Negro', 'Rojo', 'Azul', 'Blanco']),
        size: pick(['7', '7 1/4', '7 1/2', 'Ajustable']), barcode: `7990${String(i).padStart(8, '0')}`,
        cost, price_retail: Math.round(cost * 2.1), price_wholesale: Math.round(cost * 1.6), min_stock: 5,
      });
      products.push(id);
      prices.set(id, { detalle: Math.round(cost * 2.1), mayor: Math.round(cost * 1.6) });
    }
    const customers = [];
    for (let i = 1; i <= 400; i++) customers.push(call('customers.save', { name: `Cliente ${i}`, phone: `809555${String(i).padStart(4, '0')}` }));
    const stock = new Map();
    const restock = (ids) => {
      call('purchases.create', {
        supplier_id: supplier, payment_type: rand() < 0.3 ? 'credito' : 'contado', payment_method: 'transferencia',
        items: ids.map((id) => ({ product_id: id, qty: 60, unit_cost: between(250, 900) })),
      });
      for (const id of ids) stock.set(id, (stock.get(id) || 0) + 60);
    };
    for (let i = 0; i < products.length; i += 25) restock(products.slice(i, i + 25));

    const credits = [];
    let sales = 0;
    for (let day = 0; day < DAYS; day++) {
      const d = new RealDate(start);
      d.setDate(d.getDate() + day);
      const at = (h, m) => { d.setHours(h, m, 0, 0); simulated = d.getTime(); };
      at(9, 0);
      login(); // cada día se entra de nuevo (la sesión vence a las 12 horas)
      call('cash.open', { amount: 3000 });
      for (let n = 0; n < SALES_PER_DAY; n++) {
        at(9 + Math.floor((n * 10) / SALES_PER_DAY), between(0, 59));
        const lines = [];
        for (let k = between(1, 5); k > 0; k--) {
          const id = pick(products);
          if ((stock.get(id) || 0) > 3 && !lines.some((l) => l.product_id === id)) lines.push({ product_id: id, qty: between(1, 2) });
        }
        if (!lines.length) continue;
        const credit = rand() < 0.12;
        const wholesale = rand() < 0.1;
        const customer = credit || rand() < 0.3 ? pick(customers) : null;
        const type = wholesale ? 'mayor' : 'detalle';
        const total = lines.reduce((sum, l) => sum + l.qty * prices.get(l.product_id)[type], 0);
        // Efectivo con billete grande (hay cambio) o tarjeta por el monto exacto.
        const payment = rand() < 0.6 ? { method: 'efectivo', amount: Math.ceil(total / 1000) * 1000 } : { method: 'tarjeta', amount: total };
        const id = call('sales.create', {
          sale_type: type, payment_type: credit ? 'credito' : 'contado', customer_id: customer,
          items: lines, payments: credit ? [] : [payment],
        });
        for (const l of lines) stock.set(l.product_id, stock.get(l.product_id) - l.qty);
        if (credit) credits.push(id);
        sales++;
        if (rand() < 0.01) {
          const s = call('sales.get', { id });
          call('sales.return', { sale_id: id, items: [{ sale_item_id: s.items[0].id, qty: 1 }], refund_method: 'efectivo', reason: 'Talla equivocada' });
        }
      }
      at(18, 0);
      for (let k = 0; k < 3 && credits.length; k++) {
        const sid = credits.shift();
        const s = call('sales.get', { id: sid });
        if (s.balance > 0) call('sales.pay', { sale_id: sid, amount: s.balance, method: pick(['efectivo', 'transferencia']) });
      }
      if (rand() < 0.6) call('expenses.create', { category: pick(['Transporte', 'Publicidad', 'Servicios', 'Delivery', 'Otros']), description: 'Gasto del día', amount: between(200, 2500), method: 'transferencia' });
      if (day % 30 === 0) call('expenses.create', { category: 'Alquiler', description: 'Alquiler del local', amount: 25000, method: 'transferencia' });
      const low = products.filter((id) => (stock.get(id) || 0) < 15);
      if (low.length) restock(low.slice(0, 25));
      at(19, 0);
      call('cash.close', { counted: call('cash.status').open.expected });
      if (day % 180 === 0) log(`  día ${day} de ${DAYS} · ${sales} ventas`);
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const secs = ((RealDate.now() - started) / 1000).toFixed(0);
    log(`Base generada: ${sales} ventas en ${DAYS} días (${secs} s) → ${file}`);
    return { file, sales };
  } finally {
    globalThis.Date = RealDate;
    simulated = null;
    db.close();
  }
}

module.exports = { generate, DEFAULT_FILE };

if (require.main === module) generate(process.argv[2]).catch((err) => { console.error(err); process.exit(1); });
