'use strict';
// Versión 1.9 en la aplicación real: carritos en espera, buscador global (Ctrl + K), reposición y alertas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

async function openCash(win) {
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });
}
async function addToCart(win, q) {
  await win.fill('#pos-picker input', q);
  await win.waitForSelector('.picker-item');
  await win.press('#pos-picker input', 'Enter');
  await win.waitForTimeout(300);
  if (await win.$('.modal-back .modal-foot')) await win.click(`${dialog} .modal-foot .btn.primary`);
}

test('venta en espera: se atiende a otro cliente y se retoma con un clic; al cobrar deja de estar en espera', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1280, height: 800 });
  await login(win, 'admin', 'admin123');
  await openCash(win);
  await go(win, 'pos');
  await addToCart(win, 'atlanta');
  await win.keyboard.press('F4');
  await win.waitForSelector('.toast:has-text("Venta en espera")');
  await win.waitForSelector('#pos-carts .cart-chip[data-held]');
  assert.equal(await win.$$eval('#pos-lines tbody tr', (r) => r.length), 0, 'el carrito quedó vacío para el siguiente cliente');
  await addToCart(win, 'chicago');
  // Retomar la primera: la actual (Chicago) queda en espera sola.
  await win.click('#pos-carts .cart-chip[data-held]');
  await win.waitForSelector('#pos-lines tbody tr:has-text("Atlanta")');
  assert.equal(await win.$$eval('#pos-carts .cart-chip[data-held]', (x) => x.length), 1);
  assert.match(await text(win, '#pos-carts .cart-chip[data-held]'), /1 art/);
  assert.equal(await text(win, '#pos-clear'), 'Descartar esta venta');
  assert.equal((await api(win, 'sales.heldList')).length, 2);
  await win.keyboard.press('F9');
  await win.waitForSelector('.done-no');
  await win.keyboard.press('Escape');
  await eventually(async () => (await api(win, 'sales.heldList')).length === 1);
  assert.match((await api(win, 'sales.heldList'))[0].label, /En espera/, 'la cobrada ya no está; queda la otra');
  assert.deepEqual(errors, []);
});

test('buscador global con Ctrl + K: acciones, productos y clientes, con el teclado', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1280, height: 800 });
  await login(win, 'admin', 'admin123');
  await go(win, 'dashboard');
  await win.keyboard.press('Control+k');
  await win.waitForSelector('.palette #pal-q');
  assert.ok((await win.$$eval('.pal-item', (x) => x.map((e) => e.textContent))).some((s) => s.includes('Nueva venta')));
  await win.keyboard.type('atlanta');
  await win.waitForSelector('.pal-group:text-is("Productos")');
  await win.keyboard.press('Enter');
  await win.waitForSelector(`${dialog} .modal-head h3:has-text("Atlanta")`);
  assert.equal(await win.$$eval('.palette-back.modal-back', (x) => x.length), 0, 'la barra se cerró');
  await win.keyboard.press('Escape');
  await win.waitForSelector('.modal-back', { state: 'detached' });
  // Una acción: "nueva venta" lleva al punto de venta.
  await win.click('#gsearch');
  await win.waitForSelector('.palette #pal-q');
  await win.keyboard.type('nueva venta');
  await win.waitForTimeout(300);
  await win.keyboard.press('Enter');
  await win.waitForSelector('#pos-picker input');
  // Esc cierra sin hacer nada.
  await win.keyboard.press('Control+k');
  await win.waitForSelector('.palette');
  await win.keyboard.press('Escape');
  await eventually(async () => !(await win.$('.palette-back.modal-back')));
  assert.deepEqual(errors, []);
});

test('reposición: qué comprar según el ritmo de venta y crear la compra con esas cantidades; sin movimiento', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1280, height: 800 });
  await login(win, 'admin', 'admin123');
  await go(win, 'restock');
  await win.waitForSelector('#rs-table tbody tr[data-idx]');
  const rows = await win.$$eval('#rs-table [data-buy]', (x) => x.length);
  assert.ok(rows > 0);
  await win.fill('#rs-table [data-buy] >> nth=0', '4');
  await win.click('#rs-buy');
  await win.waitForSelector('#pu-lines tr[data-i]');
  assert.equal(await win.$$eval('#pu-lines tr[data-i]', (x) => x.length), rows);
  assert.equal(await win.inputValue('#pu-lines tr[data-i] >> nth=0 >> [data-k=qty]'), '4', 'con la cantidad que se escribió');
  await go(win, 'restock', { tab: 'stagnant', days: 30 });
  await win.waitForSelector('#rs-still [data-d="30"].active');
  assert.deepEqual(errors, []);
});

test('campanita: cuenta las alertas nuevas, lleva a la pantalla y se apaga al verlas', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1280, height: 800 });
  await login(win, 'admin', 'admin123');
  await go(win, 'dashboard');
  await win.waitForSelector('#bell-count:not(.hidden)');
  await win.click('#bell');
  await win.waitForSelector('.alerts-panel .ap-item');
  assert.equal(await win.isVisible('#bell-count'), false, 'abrir la lista las da por vistas');
  await win.click('.alerts-panel .ap-item:has-text("stock bajo")');
  await win.waitForSelector('#page-title:text-is("Reposición")');
  assert.equal(await win.$$eval('.alerts-panel', (x) => x.length), 0);
  // El vendedor ve las suyas y el Inventario ya filtrado.
  await win.evaluate(() => App.go('products', { status: 'agotado' }));
  await win.waitForSelector('#p-status [data-s=agotado].active');
  assert.deepEqual(errors, []);
});
