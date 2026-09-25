'use strict';
// La PC principal atiende por la red a las demás. Se prueba con un servidor real en esta máquina.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi } = require('../src/core/api');
const net = require('../src/net/server');
const { createClient, discover } = require('../src/net/client');
const secure = require('../src/net/secure');

const VERSION = '9.9.9';
const KEY = 'K7M2-P9QX';

// Pedido cifrado "a mano", como lo haría una PC conectada; devuelve la respuesta descifrada.
async function sealedPost(port, path, body, { ts = Date.now() } = {}) {
  const k = secure.deriveKey(KEY, 'srv-1');
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-caps-version': VERSION },
    body: JSON.stringify(secure.seal(k, { ...body, ts, nonce: 'prueba' })),
  });
  return secure.open(k, await r.json());
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function start(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-red-'));
  const db = await openDatabase(path.join(dir, 'capsshop.db'));
  const api = createApi(db);
  const info = () => ({ business_name: 'CAPS._.SHOP', server_id: 'srv-1', name: 'Principal' });
  const server = net.createServer({ getApi: () => api, getKey: () => KEY, info, version: VERSION, photosDir: path.join(dir, 'fotos') });
  const port = await net.listen(server, 0, '127.0.0.1');
  t.after(() => net.close(server));
  const connect = (opts = {}) => createClient({ host: '127.0.0.1', port, key: KEY, version: VERSION, ...opts });
  // Una PC conectada: se registra, entra y guarda su token.
  async function pc(name, username, password) {
    const c = connect();
    const terminal = (await c.pair(name)).id;
    const { token, user } = await c.login(username, password, terminal);
    await c.call(token, 'auth.changePassword', { current: password, password }); // contraseña inicial
    return { c, terminal, token, user, call: (n, p) => c.call(token, n, p) };
  }
  return { dir, db, api, port, info, connect, pc };
}

test('saludo, clave y versión', async (t) => {
  const { connect } = await start(t);
  const hello = await connect().hello();
  assert.equal(hello.version, VERSION);
  assert.equal(hello.server_id, 'srv-1');
  await assert.rejects(connect({ key: 'MALAS-CLAVE' }).pair('Caja 2'), (e) => e.code === 'KEY' && /Clave de conexión incorrecta/.test(e.message));
  assert.equal((await connect({ key: 'k7m2 p9qx' }).pair('Caja 2')).name, 'Caja 2', 'la clave no distingue mayúsculas ni espacios');
  await assert.rejects(connect({ version: '1.0.0' }).pair('Caja 2'), (e) => e.code === 'VERSION' && /versión 9\.9\.9 y esta computadora la 1\.0\.0/.test(e.message));
});

test('permisos y sesiones por la red', async (t) => {
  const { pc, connect } = await start(t);
  const v = await pc('Caja 2', 'vendedor', 'vendedor123');
  assert.equal(v.user.role, 'vendedor');
  await assert.rejects(v.call('purchases.list'), /permiso/);
  await assert.rejects(v.call('products.save', { name: 'X', photo_data: PNG }), /permiso/);
  await assert.rejects(connect().call('token-falso', 'products.list'), (e) => e.code === 'AUTH');
  await assert.rejects(connect().login('admin', 'mala', v.terminal), /incorrectos/);
  // Por la red nadie entra como la PC principal (su caja es de ella).
  await assert.rejects(connect().login('admin', 'admin123', 1), (e) => e.code === 'TERMINAL');
  await assert.rejects(connect().login('admin', 'admin123'), (e) => e.code === 'TERMINAL');
});

test('bloquea el inicio de sesión tras varios intentos fallidos', async (t) => {
  const { connect } = await start(t);
  const c = connect();
  const { id } = await c.pair('Caja 2');
  for (let i = 0; i < 5; i++) await assert.rejects(c.login('admin', 'mala', id), /incorrectos/);
  await assert.rejects(c.login('admin', 'admin123', id), /Demasiados intentos/);
});

test('dos computadoras venden a la vez el mismo producto sin perder ni duplicar existencia', async (t) => {
  const { pc } = await start(t);
  const A = await pc('Caja 1', 'admin', 'admin123');
  const B = await pc('Caja 2', 'vendedor', 'vendedor123');
  const productId = await A.call('products.save', { name: 'Gorra NY', cost: 500, price_retail: 1000, price_wholesale: 900 });
  const supplierId = await A.call('suppliers.save', { name: 'Distribuidora' });
  await A.call('purchases.create', { supplier_id: supplierId, payment_type: 'contado', payment_method: 'transferencia', items: [{ product_id: productId, qty: 30, unit_cost: 500 }] });
  await A.call('cash.open', { amount: 0 });
  await B.call('cash.open', { amount: 0 });

  const sale = (who) => who.call('sales.create', { payment_type: 'contado', items: [{ product_id: productId, qty: 1 }], payments: [{ method: 'efectivo', amount: 1000 }] });
  const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => sale(i % 2 ? B : A)));
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 30);
  assert.equal(failed.length, 10);
  for (const f of failed) assert.match(f.reason.message, /Existencia insuficiente/);
  assert.equal(new Set(ok.map((r) => r.value)).size, 30, 'cada venta tiene su número');

  assert.equal((await A.call('products.get', { id: productId })).stock, 0);
  const cashA = (await A.call('cash.status')).open;
  const cashB = (await B.call('cash.status')).open;
  assert.equal(cashA.cash_sales + cashB.cash_sales, 30 * 1000);
  assert.equal((await A.call('sales.list', {})).length, 30);
  assert.equal((await A.call('reports.dashboard')).cash, 30000);
});

test('un reintento con el mismo request_id no repite la venta', async (t) => {
  const { pc, port } = await start(t);
  const A = await pc('Caja 1', 'admin', 'admin123');
  const productId = await A.call('products.save', { name: 'Gorra', cost: 100, price_retail: 200, initial_stock: 5 });
  await A.call('cash.open', { amount: 0 });
  const body = { token: A.token, name: 'sales.create', request_id: 'r-1', params: { payment_type: 'contado', items: [{ product_id: productId, qty: 1 }], payments: [{ method: 'efectivo', amount: 200 }] } };
  const first = await sealedPost(port, '/v1/call', body);
  const second = await sealedPost(port, '/v1/call', body);
  assert.equal(first.ok, true);
  assert.equal(second.data, first.data, 'mismo número de venta');
  assert.equal((await A.call('products.get', { id: productId })).stock, 4);
});

test('las fotos se suben y se descargan por la red', async (t) => {
  const { pc, connect } = await start(t);
  const A = await pc('Caja 1', 'admin', 'admin123');
  const id = await A.call('products.save', { name: 'Gorra con foto', price_retail: 100, photo_data: PNG });
  const { photo } = await A.call('products.get', { id });
  assert.match(photo, /^[\w-]+\.png$/);
  const img = await connect().photo(photo);
  assert.equal(img.type, 'image/png');
  assert.ok(img.data.length > 20);
  assert.equal(await connect().photo('../capsshop.db'), null);
  await assert.rejects(connect({ key: 'MALAS-CLAVE' }).photo(photo), (e) => e.code === 'KEY');
});

test('una petición mal formada no tumba la PC principal', async (t) => {
  const { port, connect } = await start(t);
  const raw = (path, method = 'GET', body) => new Promise((resolve) => {
    const req = require('http').request({ host: '127.0.0.1', port, path, method, headers: { 'x-caps-version': VERSION } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('error'));
    req.end(body);
  });
  assert.equal(typeof (await raw('//[::1')), 'number', 'responde aunque la URL sea inválida');
  assert.equal(await raw('/v1/call', 'POST', '{no es json'), 200);
  assert.equal(await raw('/v1/call', 'POST', JSON.stringify({ iv: 'x', data: 'y' })), 401);
  assert.equal((await connect().hello()).server_id, 'srv-1', 'el servidor sigue atendiendo');
});

test('la red va cifrada: ni la clave, ni las contraseñas, ni los datos viajan en claro', async (t) => {
  const { port } = await start(t);
  // Un intermediario que copia todo lo que pasa entre la PC conectada y la principal.
  const captured = [];
  const proxy = require('net').createServer((inbound) => {
    const outbound = require('net').connect(port, '127.0.0.1');
    inbound.on('data', (d) => { captured.push(d); outbound.write(d); });
    outbound.on('data', (d) => { captured.push(d); inbound.write(d); });
    inbound.on('error', () => {}); outbound.on('error', () => {});
    inbound.on('close', () => outbound.destroy()); outbound.on('close', () => inbound.destroy());
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => proxy.close(r)));
  const c = createClient({ host: '127.0.0.1', port: proxy.address().port, key: KEY, version: VERSION });
  const terminal = (await c.pair('Caja 2')).id;
  const { token } = await c.login('admin', 'admin123', terminal);
  await c.call(token, 'auth.changePassword', { current: 'admin123', password: 'admin123' });
  await c.call(token, 'customers.save', { name: 'Cliente Secreto', phone: '8095551234' });
  const traffic = Buffer.concat(captured).toString('latin1');
  assert.ok(traffic.includes('/v1/login'), 'se capturó el tráfico');
  for (const secret of ['K7M2', 'P9QX', 'admin123', token, 'Cliente Secreto', '8095551234', 'customers.save']) {
    assert.ok(!traffic.includes(secret), `no aparece "${secret}"`);
  }
});

test('un mensaje alterado o con la hora muy distinta se rechaza', async (t) => {
  const { port, pc } = await start(t);
  const A = await pc('Caja 1', 'admin', 'admin123');
  const k = secure.deriveKey(KEY, 'srv-1');
  const env = secure.seal(k, { token: A.token, name: 'products.list', ts: Date.now(), nonce: 'n' });
  const tampered = { iv: env.iv, data: Buffer.from(Buffer.from(env.data, 'base64').map((b, i) => (i === 3 ? b ^ 1 : b))).toString('base64') };
  const r = await fetch(`http://127.0.0.1:${port}/v1/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-caps-version': VERSION }, body: JSON.stringify(tampered) });
  assert.equal(r.status, 401);
  const old = await sealedPost(port, '/v1/call', { token: A.token, name: 'products.list' }, { ts: Date.now() - 11 * 60 * 1000 });
  assert.equal(old.code, 'CLOCK');
  assert.match(old.error, /fecha y hora/);
});

test('sin la PC principal responde "Sin conexión"', async () => {
  const c = createClient({ host: '127.0.0.1', port: 1, key: KEY, version: VERSION });
  await assert.rejects(c.hello(), (e) => e.code === 'OFFLINE' && /Sin conexión con la PC principal \(127\.0\.0\.1\)/.test(e.message));
  // Nunca llegó a conectarse: no hay duda de si la operación se registró.
  await assert.rejects(c.call('x', 'products.list'), (e) => e.code === 'OFFLINE' && /Sin conexión/.test(e.message));
});

test('si se corta la conexión a mitad de una operación, avisa que se revise antes de repetirla', async (t) => {
  // Un servidor que acepta la conexión pero nunca responde.
  const hang = require('http').createServer(() => {});
  const port = await net.listen(hang, 0, '127.0.0.1');
  t.after(() => net.close(hang));
  const c = createClient({ host: '127.0.0.1', port, key: KEY, version: VERSION, timeout: 300 });
  await assert.rejects(c.call('x', 'sales.create'), (e) => e.code === 'OFFLINE' && /No se pudo confirmar la operación/.test(e.message));
});

test('las PCs encuentran la principal en la red y la vuelven a encontrar si cambia de dirección', async (t) => {
  const { info, port, connect } = await start(t);
  const disc = await net.startDiscovery({ info, httpPort: () => port, port: 0 });
  t.after(() => disc.close());
  const found = await discover({ timeout: 300, port: disc.port, targets: ['127.0.0.1'] });
  assert.equal(found.length, 1);
  assert.equal(found[0].server_id, 'srv-1');
  assert.equal(found[0].port, port);
  assert.equal(found[0].host, '127.0.0.1');

  let moved = null;
  const c = connect({ host: '127.0.0.9', port: 1, serverId: 'srv-1', timeout: 500, onMoved: (h, p) => { moved = [h, p]; }, discoverOptions: { port: disc.port, targets: ['127.0.0.1'] } });
  assert.equal((await c.hello()).server_id, 'srv-1');
  assert.deepEqual(moved, ['127.0.0.1', port]);
});
