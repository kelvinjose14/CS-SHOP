'use strict';
// Controles de la auditoría (secciones 2 y 4) en la aplicación real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('caja: motivo al abrir con otro monto y depósitos por verificar', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (st.open) await api(win, 'cash.close', { counted: st.open.expected });
  const counted = (await api(win, 'cash.status')).last_closed.counted_amount;

  // Abrir con menos de lo contado: aparece el motivo y es obligatorio.
  await go(win, 'cash');
  assert.equal(await win.isVisible('#open-reason-field'), false);
  await win.fill('#open-amount', String(counted - 300));
  assert.match(await text(win, '#open-diff'), /Faltan RD\$ 300\.00/);
  await win.click('#open-cash');
  await win.waitForSelector('.toast.error');
  assert.equal((await api(win, 'cash.status')).open, null);
  await win.fill('#open-reason', 'Pago del delivery sin registrar');
  await win.click('#open-cash');
  await win.waitForSelector('.cash-grid');
  assert.match(await text(win, '.cash-summary'), /Faltaban RD\$ 300\.00 respecto al último cierre: Pago del delivery sin registrar/);

  // Un depósito al banco queda por verificar: aviso en el Inicio y pantalla de depósitos.
  await api(win, 'cash.movement', { type: 'deposito_banco', amount: 150, description: 'Boleta 1' });
  await api(win, 'cash.movement', { type: 'deposito_banco', amount: 90, description: 'Boleta 2' });
  await go(win, 'dashboard');
  assert.match(await text(win, '#deposits-warning'), /Hay 2 depósitos al banco por verificar \(RD\$ 240\.00/);
  await win.click('#deposits-warning a');
  await win.waitForSelector('[data-ok]');
  await win.click('tr:has-text("Boleta 1") [data-ok]');
  await win.fill(`${dialog} [name=v]`, 'Estado de cuenta');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.click('tr:has-text("Boleta 2") [data-missing]');
  await win.fill(`${dialog} [name=v]`, 'No aparece en el banco');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  assert.ok(await eventually(async () => (await api(win, 'deposits.list', { status: 'pendiente' })).length === 0));
  await win.click('#d-status [data-v=""]');
  await win.waitForSelector('.badge:has-text("No llegó")');
  assert.match(await text(win, '#page .card'), /En el banco.*Estado de cuenta/);
  await go(win, 'dashboard');
  assert.equal(await win.$('#deposits-warning'), null);
  await go(win, 'cash');
  assert.match(await text(win, '#page'), /Depósitos por verificar/);
  assert.deepEqual(errors, []);
});

test('crédito autorizado por el administrador, costo 0 confirmado y cliente desactivado', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });
  const p = await api(win, 'products.save', { name: 'Gorra de control', cost: 200, price_retail: 700, initial_stock: 5 });
  const cu = await api(win, 'customers.save', { name: 'Cliente con límite', credit_limit: 500 });

  // Venta a crédito que pasa el límite: el administrador la autoriza en un diálogo.
  await go(win, 'pos');
  await win.fill('#pos-picker input', 'Gorra de control');
  await win.waitForSelector('.picker-item');
  await win.press('#pos-picker input', 'Enter');
  await win.selectOption('#pos-customer', String(cu));
  const label = await win.$eval('#pos-customer', (s) => s.selectedOptions[0].textContent);
  assert.match(label, /límite RD\$\s500\.00/, JSON.stringify([...label].map((c) => c.charCodeAt(0))));
  await win.click('#pos-pay-type [data-v=credito]');
  await win.click('#pos-charge');
  await win.waitForSelector(`${dialog}:has-text("Autorizar crédito")`);
  assert.match(await text(win, `${dialog} .modal-body`), /debería 700\.00 y su límite de crédito es 500\.00/);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.done-no');
  assert.equal((await api(win, 'customers.get', { id: cu })).balance, 700);
  await win.keyboard.press('Escape');

  // Compra a costo 0: se pregunta antes de guardar.
  const sup = await api(win, 'suppliers.save', { name: 'Proveedor de control' });
  await go(win, 'purchase-new');
  await win.selectOption('#page select[name=supplier_id]', String(sup));
  await win.fill('#page .picker input', 'Gorra de control');
  await win.waitForSelector('.picker-item');
  await win.press('#page .picker input', 'Enter');
  await win.fill('#page [data-k=unit_cost]', '0');
  await win.click('#page #pu-save');
  await win.waitForSelector(`${dialog}:has-text("Revisar costos")`);
  assert.match(await text(win, `${dialog} .modal-body`), /"Gorra de control" a costo 0 \(el actual es 200\.00\)/);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  assert.ok(await eventually(async () => (await api(win, 'products.get', { id: p })).stock === 5));

  // El cliente debe: no se puede desactivar.
  await go(win, 'customers');
  await win.evaluate((id) => customerDetail(id, () => {}), cu);
  await win.click(`${dialog} .modal-foot .btn:has-text("Editar")`);
  await win.uncheck(`${dialog} [name=active]`);
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast.error:has-text("no se puede desactivar")');
  assert.deepEqual(errors, []);
});

test('CSV sin fórmulas y con el separador de la región; ventana mínima; navegación bloqueada', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 700 });
  await login(win, 'admin', 'admin123');
  const csv = await win.evaluate(() => {
    const cols = [{ key: 'name', label: 'Nombre' }, { key: 'amount', label: 'Monto', money: true }, { key: 'n', label: 'N' }];
    const rows = [{ name: '=HYPERLINK("http://x")', amount: -12.5, n: 1.5 }, { name: '+1-809', amount: 3, n: 2 }, { name: '-Gorra', amount: 0, n: 3 }, { name: '@SUM(A1)', amount: 1, n: 4 }];
    return { dr: toCsv(cols, rows), es: toCsv(cols, rows, { sep: ';', dec: ',' }) };
  });
  assert.equal(csv.dr, `Nombre,Monto,N\r\n"'=HYPERLINK(""http://x"")",-12.50,1.5\r\n'+1-809,3.00,2\r\n'-Gorra,0.00,3\r\n'@SUM(A1),1.00,4`);
  assert.equal(csv.es.split('\r\n')[1], `"'=HYPERLINK(""http://x"")";-12,50;1,5`);

  // En la ventana más pequeña (1100 px), ninguna pantalla se desborda y el botón de anular un gasto se ve.
  await api(win, 'expenses.create', { category: 'Alquiler', description: 'Local', amount: 100, method: 'transferencia' });
  for (const route of ['expenses', 'incomes', 'accounting', 'cash', 'deposits']) {
    await go(win, route);
    assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0, `${route} sin desborde`);
  }
  await go(win, 'expenses');
  const right = await win.$eval('#e-list [data-void]', (b) => b.getBoundingClientRect().right);
  assert.ok(right <= 1100, `botón anular visible (${right})`);

  // La ventana no sale de la aplicación.
  await win.evaluate(() => { window.location.href = 'https://example.com/'; });
  await win.waitForTimeout(500);
  assert.match(win.url(), /index\.html/);
  assert.equal(await win.evaluate(() => typeof App), 'object');
  assert.equal(await win.evaluate(() => window.open('https://example.com/')), null);
  assert.deepEqual(errors, []);
});

test('copia externa con contraseña desde Configuración y restauración pidiendo la contraseña', async (t) => {
  const dir = dataDir({ demo: true });
  const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-usb-'));
  const { app, win, errors } = await launch(t, dir);
  await login(win, 'admin', 'admin123');
  await app.evaluate(({ dialog: d }, folder) => {
    d.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    d.showMessageBox = async () => ({ response: 1 });
  }, usb);
  await go(win, 'settings');
  await win.click('#ext-choose');
  await win.waitForSelector('#ext-pass');
  assert.match(await text(win, '#ext-box'), /Sin contraseña/);
  await win.click('#ext-pass');
  await win.fill(`${dialog} [name=password]`, 'clave-usb-123');
  await win.fill(`${dialog} [name=password2]`, 'clave-usb-123');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('#ext-box:has-text("Protegida con contraseña")');
  const target = path.join(usb, 'CAPS Shop respaldos');
  const file = fs.readdirSync(target).find((f) => f.endsWith('.cifrado'));
  assert.ok(file);
  assert.equal(fs.readdirSync(target).filter((f) => f.endsWith('.db')).length, 0);

  // Restaurar la copia cifrada: se pide la contraseña.
  await api(win, 'products.save', { name: 'Creado después de la copia', price_retail: 100 });
  await app.evaluate(({ dialog: d }, f) => { d.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, path.join(target, file));
  await win.click('#bk-restore');
  await win.waitForSelector(`${dialog}:has-text("Copia protegida con contraseña")`);
  assert.equal(await win.getAttribute(`${dialog} [name=v]`, 'type'), 'password');
  await win.fill(`${dialog} [name=v]`, 'otra-clave');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('.toast.error:has-text("contraseña de la copia no es correcta")');
  await win.click('#bk-restore');
  await win.fill(`${dialog} [name=v]`, 'clave-usb-123');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  await win.waitForSelector('#login-form');
  await login(win, 'admin', 'admin123');
  const names = (await api(win, 'products.list', { includeInactive: true })).map((p) => p.name);
  assert.ok(!names.includes('Creado después de la copia'), 'volvió a los datos de la copia');
  assert.deepEqual(errors, []);
});
