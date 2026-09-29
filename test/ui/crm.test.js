'use strict';
// CRM de clientes (1.6) en la aplicación real: ficha, segmentos, etiquetas, VIP, notas y cumpleaños.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataDir, launch, login, go, text, eventually } = require('./helpers');

const api = (win, name, params) => win.evaluate(([n, p]) => api(n, p), [name, params]);
const dialog = '.modal-back:last-child';

test('cliente con cumpleaños hoy, etiquetas y VIP; segmentos, notas y aviso en el Inicio', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }), { width: 1100, height: 760 });
  await login(win, 'admin', 'admin123');
  const st = await api(win, 'cash.status');
  if (!st.open) await api(win, 'cash.open', { amount: st.last_closed ? st.last_closed.counted_amount : 0 });
  const now = new Date();
  const todayDM = `${now.getDate()}/${now.getMonth() + 1}`;

  // Nuevo cliente desde el formulario, con cumpleaños hoy, etiquetas y VIP a mano.
  await go(win, 'customers');
  await win.click('#c-new');
  await win.waitForSelector(`${dialog} [name=birthday]`);
  await win.fill(`${dialog} [name=name]`, 'Cliente CRM');
  await win.fill(`${dialog} [name=phone]`, '809-555-7777');
  await win.fill(`${dialog} [name=birthday]`, todayDM);
  await win.fill(`${dialog} [name=tags]`, 'mayorista, NY');
  await win.selectOption(`${dialog} [name=vip_mode]`, 'si');
  await win.click(`${dialog} .modal-foot .btn.primary`);
  const cu = await eventually(async () => (await api(win, 'customers.list', { search: 'Cliente CRM' }))[0]);
  assert.deepEqual(cu.tags, ['mayorista', 'NY']);
  assert.equal(cu.birthday_in, 0);
  assert.equal(cu.vip, 1);
  const p = (await api(win, 'products.list', {})).find((x) => x.available > 1);
  await api(win, 'sales.create', { customer_id: cu.id, items: [{ product_id: p.id, qty: 1 }], payments: [{ method: 'efectivo', amount: p.price_retail }] });

  // Lista: segmento, filtro por etiqueta y VIP.
  await go(win, 'customers');
  await win.click('#c-seg [data-s=nuevo]');
  await win.waitForSelector('#page tr:has-text("Cliente CRM")');
  assert.match(await text(win, '#c-seg-help'), /últimos 30 días/);
  await win.click('#c-seg [data-s=vip]');
  await win.waitForSelector('#page tr:has-text("Cliente CRM") .vip');
  await win.click('#c-seg [data-s=""]');
  await win.selectOption('#c-tag', 'mayorista');
  assert.equal(await win.$$eval('#page tbody tr', (r) => r.length), 1);

  // Ficha: métricas, lo que más compra y notas.
  await win.click('#page tr:has-text("Cliente CRM")');
  await win.waitForSelector(`${dialog} .crm-head`);
  assert.match(await text(win, `${dialog} .crm-head`), /VIP/);
  assert.match(await text(win, `${dialog} .fav-grid`), new RegExp(p.name.split(' ')[0]));
  await win.fill(`${dialog} #cd-note`, 'Le escribí; viene el sábado');
  await win.click(`${dialog} #cd-note-add`);
  await win.waitForSelector(`${dialog} .notes-log li:has-text("viene el sábado")`);
  await win.keyboard.press('Escape');

  // Cumpleaños: en el Inicio y en la lista de los próximos 30 días.
  await go(win, 'dashboard');
  assert.match(await text(win, '#dash-birthdays'), /Cliente CRM[\s\S]*hoy/);
  await go(win, 'customers');
  await win.click('#c-bdays');
  await win.waitForSelector(`${dialog} tr:has-text("Cliente CRM")`);
  assert.equal(await win.evaluate(() => document.querySelector('#page').scrollWidth - document.querySelector('#page').clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('el vendedor ve la ficha y agrega notas, pero no cambia el VIP', async (t) => {
  const { win, errors } = await launch(t, dataDir({ demo: true }));
  await login(win, 'vendedor', 'vendedor123');
  const cu = (await api(win, 'customers.list', {})).find((c) => c.purchases > 0);
  await go(win, 'customers');
  await win.evaluate((id) => customerDetail(id, () => {}), cu.id);
  await win.waitForSelector(`${dialog} .fav-grid`);
  const body = await text(win, `${dialog} .modal-body`);
  assert.doesNotMatch(body, /Costo|Utilidad|Ganancia/i);
  await win.fill(`${dialog} #cd-note`, 'Nota del vendedor');
  await win.click(`${dialog} #cd-note-add`);
  await win.waitForSelector(`${dialog} .notes-log li:has-text("Nota del vendedor")`);
  await win.click(`${dialog} .modal-foot .btn:has-text("Editar")`);
  await win.waitForSelector(`${dialog} [name=birthday]`);
  assert.equal(await win.$(`${dialog} [name=vip_mode]`), null);
  assert.deepEqual(errors, []);
});
