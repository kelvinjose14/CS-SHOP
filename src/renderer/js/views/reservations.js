'use strict';
/* Apartados (1.5): gorras reservadas para un cliente hasta una fecha. */

const RES_STATES = [['activo', 'Activos'], ['vencido', 'Vencidos'], ['vendido', 'Vendidos'], ['cancelado', 'Cancelados'], ['', 'Todos']];

function resBadge(r) {
  if (r.state === 'vencido') return badge('vencido', 'Vencido');
  if (r.state === 'activo') return html`${badge('activo')} <span class="muted small">${r.days_left === 0 ? 'vence hoy' : r.days_left === 1 ? 'vence mañana' : `${r.days_left} días`}</span>`;
  return badge(r.state);
}

const RES_COLUMNS = [
  { key: 'id', label: 'No.', cls: 'nowrap', render: (r) => Fmt.resNo(r.id), csv: (r) => Fmt.resNo(r.id) },
  { key: 'customer_name', label: 'Cliente', render: (r) => html`<b>${r.customer_name}</b>${r.customer_phone ? html`<div class="muted small">${r.customer_phone}</div>` : ''}`, csv: (r) => r.customer_name },
  { key: 'summary', label: 'Gorras', cls: 'wrap' },
  { key: 'units', label: 'Unid.', num: true, total: true },
  { key: 'value', label: 'Valor', money: true, total: true },
  { key: 'date', label: 'Apartado', date: true },
  { key: 'expires_on', label: 'Vence', date: true },
  { key: 'state', label: 'Estado', render: resBadge, csv: (r) => r.state },
  { key: 'user_name', label: 'Lo apartó' },
];

App.register({
  id: 'reservations', title: 'Apartados', icon: 'bookmark', group: 'Principal',
  async render(page, params) {
    const f = { status: params.status ?? 'activo', search: '' };
    const tb = toolbar(page, {
      left: html`
        <div class="seg" id="rs-status">${RES_STATES.map(([v, l]) => html`<button data-s="${v}" class="${v === f.status ? 'active' : ''}">${l}</button>`)}</div>
        <div class="search">${icon('search')}<input id="rs-search" placeholder="Buscar por cliente, teléfono o gorra…"></div>`,
      right: html`<button class="btn" id="rs-export">${icon('download')} Exportar</button><button class="btn primary" id="rs-new">${icon('plus')} Nuevo apartado</button>`,
    });
    const info = el(html`<p class="muted small">Las gorras apartadas no se le pueden vender a otro cliente hasta la fecha límite. Al vencer, vuelven a estar disponibles.</p>`);
    tb.after(info);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const load = async () => {
      rows = await api('reservations.list', f);
      setHTML(box, table({ columns: RES_COLUMNS, rows, clickable: true, empty: f.status === 'activo' ? 'No hay apartados activos. Cree uno con "Nuevo apartado".' : 'No hay apartados.', rowClass: (r) => (r.state === 'vencido' ? 'row-danger' : '') }));
      onRowClick(box, rows, (r) => reservationDetail(r.id, load));
    };
    $$('#rs-status [data-s]', tb).forEach((b) => (b.onclick = () => {
      $$('#rs-status [data-s]', tb).forEach((x) => x.classList.toggle('active', x === b));
      f.status = b.dataset.s;
      load();
    }));
    $('#rs-search', tb).oninput = debounce((e) => { f.search = e.target.value; load(); });
    $('#rs-new', tb).onclick = () => reservationForm(load);
    $('#rs-export', tb).onclick = () => exportCsv('apartados', RES_COLUMNS, rows);
    await load();
  },
});

async function reservationDetail(id, onChange) {
  const r = await api('reservations.get', { id });
  const open = r.status === 'activo';
  const actions = [{ label: 'Cerrar' }];
  if (open) {
    actions.push({
      label: 'Cancelar apartado', danger: true,
      onClick: async () => {
        const reason = await promptDialog({ title: `Cancelar ${Fmt.resNo(r.id)}`, label: 'Motivo (las gorras vuelven a estar disponibles)' });
        if (!reason) return false;
        await api('reservations.cancel', { id: r.id, reason });
        toast('Apartado cancelado.');
        onChange && onChange();
      },
    });
    actions.push({
      label: 'Dar más días',
      onClick: async () => {
        const date = await promptDialog({ title: `Más días para ${Fmt.resNo(r.id)}`, label: `Nueva fecha límite (hoy vence ${Fmt.date(r.expires_on)})`, type: 'date' });
        if (!date) return false;
        await api('reservations.extend', { id: r.id, expires_on: date });
        toast(`Apartado hasta el ${Fmt.date(date)}.`);
        onChange && onChange();
      },
    });
    actions.push({ label: 'Vender', primary: true, onClick: () => { $$('.modal-back').forEach((x) => x.remove()); App.go('pos', { reservation: r.id }); } });
  }
  modal({
    title: `Apartado ${Fmt.resNo(r.id)}`,
    width: 760,
    body: html`
      <div class="kv cols-4">
        <div><span>Cliente</span><b>${r.customer_name}</b></div>
        <div><span>Teléfono</span><b>${r.customer_phone || '—'}</b></div>
        <div><span>Apartado el</span><b>${Fmt.date(r.date)}</b></div>
        <div><span>Vence</span><b>${Fmt.date(r.expires_on)}</b></div>
        <div><span>Estado</span><b>${resBadge(r)}</b></div>
        <div><span>Valor al detalle</span><b>${Fmt.money(r.value)}</b></div>
        <div><span>Lo apartó</span><b>${r.user_name || '—'}</b></div>
        ${r.sale_id ? html`<div><span>Venta</span><b>${Fmt.saleNo(r.sale_id)}</b></div>` : ''}
      </div>
      ${r.note ? html`<p class="muted">${r.note}</p>` : ''}
      ${r.status === 'cancelado' ? html`<div class="info-box">Cancelado el ${Fmt.datetime(r.closed_at)} por ${r.closed_by_name || '—'}: ${r.close_reason}</div>` : ''}
      <h4 class="section-title">Gorras</h4>
      ${table({
        columns: [
          { label: '', render: (i) => productThumb(i, 34), cls: 'w-thumb' },
          { key: 'name', label: 'Producto', render: (i) => html`<b>${i.name}</b><div class="muted small">${[i.brand, i.color, i.size, i.sku].filter(Boolean).join(' · ')}</div>` },
          { key: 'qty', label: 'Cant.', num: true, total: true },
          { key: 'price_retail', label: 'Precio', money: true },
          { key: 'total', label: 'Importe', align: 'right', render: (i) => Fmt.money(i.qty * i.price_retail) },
        ],
        rows: r.items,
      })}`,
    actions,
  });
}

// Nuevo apartado: el cliente, las gorras (con el buscador o el lector) y la fecha límite.
async function reservationForm(onSaved) {
  const customers = await api('customers.list');
  const days = Number(App.settings.reservation_days) || 15;
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  const lines = [];
  const body = el(html`
    <div>
      <div class="grid-2">
        <label class="field"><span>Cliente *</span><select name="customer_id" id="rf-customer">${options(customers.map((c) => [c.id, `${c.name}${c.phone ? ` · ${c.phone}` : ''}`]), '', { empty: 'Elija el cliente' })}</select></label>
        <label class="field"><span>Apartado hasta *</span><input type="date" name="expires_on" id="rf-expires" min="${todayStr()}" value="${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}"></label>
      </div>
      <div id="rf-picker"></div>
      <div id="rf-lines"></div>
      <label class="field"><span>Nota</span><input name="note" id="rf-note" placeholder="Opcional. Ej. Viene el sábado"></label>
    </div>`);
  const draw = () => setHTML($('#rf-lines', body), lines.length ? html`<table class="table lines">
      <thead><tr><th>Producto</th><th class="text-right">Disponible</th><th>Cant.</th><th></th></tr></thead>
      <tbody>${lines.map((l, i) => html`<tr data-i="${i}"><td><b>${l.p.name}</b><div class="muted small">${[l.p.color, l.p.size, l.p.sku].filter(Boolean).join(' · ')}</div></td>
        <td class="text-right ${l.qty > l.p.available ? 'text-danger' : ''}">${l.p.available}</td>
        <td><div class="qty"><button data-q="-1">−</button><input data-k="qty" type="number" min="1" step="1" value="${l.qty}"><button data-q="1">+</button></div></td>
        <td><button class="icon-btn danger" data-del title="Quitar">${icon('trash')}</button></td></tr>`)}</tbody></table>`
    : html`<div class="empty">Busque o escanee las gorras que se apartan.</div>`);
  $('#rf-lines', body).addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const l = lines[Number(tr.dataset.i)];
    const q = e.target.closest('[data-q]');
    if (q) { l.qty = Math.max(1, l.qty + Number(q.dataset.q)); draw(); }
    if (e.target.closest('[data-del]')) { lines.splice(Number(tr.dataset.i), 1); draw(); }
  });
  $('#rf-lines', body).addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (tr && e.target.dataset.k === 'qty') lines[Number(tr.dataset.i)].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
  });
  modal({
    title: 'Nuevo apartado',
    width: 720,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Apartar', primary: true,
        onClick: async () => {
          const f = formData(body);
          if (!f.customer_id) { toast('Elija el cliente del apartado.', 'error'); return false; }
          if (!lines.length) { toast('Agregue al menos una gorra.', 'error'); return false; }
          const id = await api('reservations.create', { customer_id: Number(f.customer_id), expires_on: f.expires_on, note: f.note, items: lines.map((l) => ({ product_id: l.p.id, qty: l.qty })) });
          toast(`Apartado ${Fmt.resNo(id)} hasta el ${Fmt.date(f.expires_on)}.`);
          onSaved && onSaved();
        },
      },
    ],
  });
  productPicker($('#rf-picker', body), (p) => {
    if (p.available <= 0) return toast(`De "${productLabel(p)}" no quedan disponibles${p.reserved ? `: ${p.reserved} ya están apartadas` : ''}.`, 'error');
    const ex = lines.find((l) => l.p.id === p.id);
    if (ex) ex.qty += 1;
    else lines.push({ p, qty: 1 });
    draw();
  });
  draw();
}
