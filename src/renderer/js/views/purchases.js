'use strict';
/* Compras, proveedores y cuentas por pagar. */

const PURCHASE_COLUMNS = [
  { key: 'id', label: 'No.', render: (r) => Fmt.purchaseNo(r.id), csv: (r) => Fmt.purchaseNo(r.id) },
  { key: 'date', label: 'Fecha', date: true },
  { key: 'supplier_name', label: 'Proveedor' },
  { key: 'invoice_ref', label: 'Factura' },
  { key: 'payment_type', label: 'Tipo', render: (r) => (r.opening ? html`<span class="chip">Saldo inicial</span>` : r.payment_type === 'credito' ? 'Crédito' : 'Contado'), csv: (r) => (r.opening ? 'saldo inicial' : r.payment_type) },
  { key: 'units', label: 'Unidades', num: true, total: true },
  { key: 'total', label: 'Total', money: true, total: (rows) => rows.filter((r) => r.status !== 'anulada').reduce((s, r) => s + r.total, 0) },
  { key: 'paid', label: 'Pagado', money: true, total: (rows) => rows.filter((r) => r.status !== 'anulada').reduce((s, r) => s + r.paid, 0) },
  { key: 'balance', label: 'Balance', money: true, total: true },
  { key: 'due_date', label: 'Vence', date: true },
  { key: 'status', label: 'Estado', render: (r) => badge(r.status), csv: (r) => STATUS_LABELS[r.status] },
  { key: 'user_name', label: 'Usuario' },
];

App.register({
  id: 'purchases', title: 'Compras', icon: 'truck', group: 'Inventario', roles: ['admin'],
  async render(page) {
    let range = {};
    let status = '';
    const tb = toolbar(page, {
      left: html`<select id="pu-status">${options([['', 'Todos los estados'], ['pendiente', 'Pendiente'], ['parcial', 'Parcial'], ['pagado', 'Pagado'], ['anulada', 'Anulada']], '')}</select>`,
      right: html`<button class="btn" id="pu-export">${icon('download')} Exportar</button><button class="btn primary" id="pu-new">${icon('plus')} Nueva compra</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const stats = el(html`<div class="stats"></div>`);
    page.appendChild(stats);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const load = async () => {
      rows = await api('purchases.list', { ...range, status });
      const valid = rows.filter((r) => r.status !== 'anulada');
      setHTML(stats, [
        statCard('Compras en el período', Fmt.money(valid.reduce((s, r) => s + r.total, 0)), { iconName: 'truck', tone: 'brand', sub: `${valid.length} compras` }),
        statCard('Unidades compradas', Fmt.num(valid.reduce((s, r) => s + r.units, 0)), { iconName: 'box' }),
        statCard('Pagado', Fmt.money(valid.reduce((s, r) => s + r.paid, 0)), { iconName: 'wallet' }),
        statCard('Pendiente de pago', Fmt.money(valid.reduce((s, r) => s + r.balance, 0)), { iconName: 'outbox', tone: 'warn' }),
      ]);
      setHTML(box, table({ columns: PURCHASE_COLUMNS, rows, clickable: true, empty: 'No hay compras en el período.', rowClass: (r) => (r.status === 'anulada' ? 'inactive' : '') }));
      onRowClick(box, rows, (r) => purchaseDetail(r.id, load));
    };
    $('#pu-status', tb).onchange = (e) => { status = e.target.value; load(); };
    $('#pu-new', tb).onclick = () => App.go('purchase-new');
    $('#pu-export', tb).onclick = () => exportCsv('compras', PURCHASE_COLUMNS, rows);
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'mes' });
  },
});

async function purchaseDetail(id, onChange) {
  const p = await api('purchases.get', { id });
  const actions = [{ label: 'Cerrar' }];
  if (p.status !== 'anulada') {
    actions.push({
      label: 'Anular compra', danger: true,
      onClick: async () => {
        const reason = await promptDialog({ title: 'Anular compra', label: 'Motivo de la anulación (se descontará la mercancía del inventario)' });
        if (!reason) return false;
        await api('purchases.void', { id, reason });
        toast('Compra anulada.');
        onChange && onChange();
      },
    });
  }
  if (p.balance > 0 && p.status !== 'anulada') {
    actions.push({
      label: 'Registrar pago', primary: true,
      onClick: () => {
        paymentDialog({
          title: `Pago de compra ${Fmt.purchaseNo(id)}`, maxAmount: p.balance, withDate: true,
          info: html`Proveedor: <b>${p.supplier_name}</b>`,
          onSubmit: async (f) => { await api('purchases.pay', { purchase_id: id, ...f }); toast('Pago registrado.'); onChange && onChange(); },
        });
      },
    });
  }
  modal({
    title: `Compra ${Fmt.purchaseNo(p.id)}`,
    width: 860,
    body: html`
      <div class="kv cols-4">
        <div><span>Proveedor</span><b>${p.supplier_name}</b></div>
        <div><span>Fecha</span><b>${Fmt.date(p.date)}</b></div>
        <div><span>Factura proveedor</span><b>${p.invoice_ref || '—'}</b></div>
        <div><span>Tipo</span><b>${p.payment_type === 'credito' ? 'Crédito' : 'Contado'}</b></div>
        <div><span>Total</span><b>${Fmt.money(p.total)}</b></div>
        <div><span>Pagado</span><b>${Fmt.money(p.paid)}</b></div>
        <div><span>Balance</span><b class="${p.balance > 0 ? 'text-danger' : ''}">${Fmt.money(p.balance)}</b></div>
        <div><span>Estado</span><b>${badge(p.status)}</b></div>
        ${p.due_date ? html`<div><span>Vence</span><b>${Fmt.date(p.due_date)}</b></div>` : ''}
        <div><span>Registrada por</span><b>${p.user_name}</b></div>
      </div>
      ${p.note ? html`<p class="muted">${p.note}</p>` : ''}
      ${p.void_reason ? html`<div class="error-box">Anulada: ${p.void_reason}</div>` : ''}
      <h4 class="section-title">Productos</h4>
      ${table({
        columns: [
          { key: 'name', label: 'Producto', render: (r) => productLabel(r) },
          { key: 'sku', label: 'SKU' },
          { key: 'qty', label: 'Cantidad', num: true, total: true },
          { key: 'unit_cost', label: 'Costo unit.', money: true },
          { key: 'subtotal', label: 'Subtotal', money: true, total: true },
        ],
        rows: p.items,
      })}
      <h4 class="section-title">Pagos</h4>
      ${table({
        columns: [
          { key: 'date', label: 'Fecha', date: true },
          { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method] },
          { key: 'amount', label: 'Monto', money: true, total: true },
          { key: 'note', label: 'Nota' },
          { key: 'user_name', label: 'Usuario' },
          { key: 'voided', label: '', render: (r) => (r.voided ? badge('anulada') : '') },
        ],
        rows: p.payments,
        empty: 'Sin pagos registrados.',
      })}`,
    actions,
  });
}

App.register({
  id: 'purchase-new', title: 'Nueva compra', icon: 'truck', group: 'Inventario', roles: ['admin'], hidden: true, navAs: 'purchases',
  async render(page) {
    const suppliers = await api('suppliers.list');
    const settings = App.settings;
    const lines = [];
    const form = el(html`
      <div class="purchase-form">
        <div class="card">
          <div class="grid-4">
            <label class="field span-2"><span>Proveedor *</span>
              <div class="inline"><select name="supplier_id">${options(suppliers.map((s) => [s.id, s.name]), '', { empty: 'Seleccione…' })}</select>
              <button class="btn" id="add-sup" title="Nuevo proveedor">${icon('plus')}</button></div>
            </label>
            <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayStr()}"></label>
            <label class="field"><span>No. factura del proveedor</span><input name="invoice_ref"></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Productos</h3><div class="muted small">Si el producto no existe, créelo primero en Inventario. Deje los precios de venta vacíos para no cambiarlos.</div></div>
          <div id="pu-picker"></div>
          <div id="pu-lines"></div>
        </div>
        <div class="card">
          <div class="grid-4">
            <div class="field"><span>Tipo de compra</span>
              <div class="seg full" id="pu-type"><button data-t="contado" class="active">Contado</button><button data-t="credito">Crédito</button></div>
            </div>
            <label class="field"><span>Método de pago</span><select name="payment_method">${methodOptions('efectivo')}</select></label>
            <label class="field credit hidden"><span>Monto pagado ahora</span><input name="paid" type="number" min="0" step="0.01" value="0"></label>
            <label class="field credit hidden"><span>Fecha de vencimiento</span><input name="due_date" type="date"></label>
            <label class="field span-4"><span>Nota</span><input name="note"></label>
          </div>
          <div class="totals-row">
            <div class="total-big">Total: <b id="pu-total">${Fmt.money(0)}</b></div>
            <div class="credit hidden">Balance pendiente: <b id="pu-balance">${Fmt.money(0)}</b></div>
            <button class="btn" id="pu-cancel">Cancelar</button>
            <button class="btn primary big" id="pu-save">Registrar compra</button>
          </div>
        </div>
      </div>`);
    page.appendChild(form);
    let type = 'contado';
    const dueInput = $('[name=due_date]', form);
    const setDue = () => {
      const d = new Date(`${$('[name=date]', form).value}T12:00:00`);
      d.setDate(d.getDate() + (Number(settings.credit_days) || 30));
      dueInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    setDue();
    $('[name=date]', form).onchange = setDue;

    const total = () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
    const updateTotals = () => {
      const t = total();
      $('#pu-total', form).textContent = Fmt.money(t);
      $('#pu-balance', form).textContent = Fmt.money(t - (Number($('[name=paid]', form).value) || 0));
    };
    const drawLines = () => {
      const box = $('#pu-lines', form);
      if (!lines.length) { setHTML(box, html`<div class="empty">Busque y agregue productos a la compra.</div>`); updateTotals(); return; }
      setHTML(box, html`
        <table class="table lines">
          <thead><tr><th>Producto</th><th class="text-right">Exist.</th><th class="text-right">Costo actual</th><th>Cantidad</th><th>Costo unitario</th><th>Nuevo precio detalle</th><th>Nuevo precio mayor</th><th class="text-right">Subtotal</th><th></th></tr></thead>
          <tbody>${lines.map((l, i) => html`
            <tr data-i="${i}">
              <td><b>${l.p.name}</b><div class="muted small">${[l.p.color, l.p.size, l.p.sku].filter(Boolean).join(' · ')}</div></td>
              <td class="text-right">${l.p.stock}</td>
              <td class="text-right">${Fmt.money(l.p.cost)}</td>
              <td><input class="num" data-k="qty" type="number" min="1" step="1" value="${l.qty}"></td>
              <td><input class="num" data-k="unit_cost" type="number" min="0" step="0.01" value="${l.unit_cost}"></td>
              <td><input class="num" data-k="price_retail" type="number" min="0" step="0.01" value="${l.price_retail}" placeholder="${l.p.price_retail}"></td>
              <td><input class="num" data-k="price_wholesale" type="number" min="0" step="0.01" value="${l.price_wholesale}" placeholder="${l.p.price_wholesale}"></td>
              <td class="text-right sub">${Fmt.money(l.qty * l.unit_cost)}</td>
              <td><button class="icon-btn danger" data-del title="Quitar">${icon('trash')}</button></td>
            </tr>`)}</tbody>
        </table>`);
      $$('tr[data-i]', box).forEach((tr) => {
        const l = lines[Number(tr.dataset.i)];
        $$('input', tr).forEach((inp) => (inp.oninput = () => {
          l[inp.dataset.k] = inp.value;
          $('.sub', tr).textContent = Fmt.money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0));
          updateTotals();
        }));
        $('[data-del]', tr).onclick = () => { lines.splice(Number(tr.dataset.i), 1); drawLines(); };
      });
      updateTotals();
    };
    productPicker($('#pu-picker', form), (p) => {
      const ex = lines.find((l) => l.p.id === p.id);
      if (ex) ex.qty = Number(ex.qty) + 1;
      else lines.push({ p, qty: 1, unit_cost: p.cost || 0, price_retail: '', price_wholesale: '' });
      drawLines();
      const last = $$('#pu-lines tr[data-i] [data-k=qty]', form);
      const idx = lines.findIndex((l) => l.p.id === p.id);
      if (last[idx]) last[idx].select();
    }, { priceKey: (p) => `Costo ${Fmt.money(p.cost)}` });
    drawLines();

    $$('#pu-type [data-t]', form).forEach((b) => (b.onclick = () => {
      type = b.dataset.t;
      $$('#pu-type [data-t]', form).forEach((x) => x.classList.toggle('active', x === b));
      $$('.credit', form).forEach((x) => x.classList.toggle('hidden', type !== 'credito'));
    }));
    $('[name=paid]', form).oninput = updateTotals;
    $('#add-sup', form).onclick = (e) => {
      e.preventDefault();
      supplierForm(null, async (id) => {
        const list = await api('suppliers.list');
        setHTML($('[name=supplier_id]', form), options(list.map((s) => [s.id, s.name]), id, { empty: 'Seleccione…' }));
      });
    };
    $('#pu-cancel', form).onclick = () => App.go('purchases');
    $('#pu-save', form).onclick = async (e) => {
      const btn = e.currentTarget;
      const f = formData(form);
      const data = {
        supplier_id: Number(f.supplier_id) || null,
        date: f.date,
        invoice_ref: f.invoice_ref,
        payment_type: type,
        payment_method: f.payment_method,
        paid: type === 'credito' ? f.paid : undefined,
        due_date: type === 'credito' ? f.due_date : undefined,
        note: f.note,
        items: lines.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_cost: l.unit_cost, price_retail: l.price_retail, price_wholesale: l.price_wholesale })),
      };
      btn.disabled = true;
      try {
        const id = await api('purchases.create', data);
        toast(`Compra ${Fmt.purchaseNo(id)} registrada. Inventario actualizado.`);
        App.go('purchases');
      } catch { /* mensaje ya mostrado */ } finally {
        btn.disabled = false;
      }
    };
  },
});

function supplierForm(s, onSaved) {
  s = s || {};
  modal({
    title: s.id ? 'Editar proveedor' : 'Nuevo proveedor',
    width: 560,
    body: html`
      <div class="grid-2">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${s.name || ''}"></label>
        <label class="field"><span>Teléfono</span><input name="phone" value="${s.phone || ''}"></label>
        <label class="field"><span>Correo</span><input name="email" type="email" value="${s.email || ''}"></label>
        <label class="field span-2"><span>Dirección</span><input name="address" value="${s.address || ''}"></label>
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${s.notes || ''}</textarea></label>
        ${s.id ? html`<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Activo</label>` : ''}
      </div>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar', primary: true,
        onClick: async ({ body }) => {
          const id = await api('suppliers.save', { ...formData(body), id: s.id });
          toast('Proveedor guardado.');
          onSaved && onSaved(id);
        },
      },
    ],
  });
}

App.register({
  id: 'suppliers', title: 'Proveedores', icon: 'factory', group: 'Inventario', roles: ['admin'],
  async render(page) {
    let search = '';
    const tb = toolbar(page, {
      left: html`<div class="search">${icon('search')}<input id="s-search" placeholder="Buscar proveedor…"></div>`,
      right: html`<button class="btn" id="s-export">${icon('download')} Exportar</button><button class="btn primary" id="s-new">${icon('plus')} Nuevo proveedor</button>`,
    });
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'name', label: 'Proveedor', render: (r) => html`<b>${r.name}</b>` , csv: (r) => r.name },
      { key: 'phone', label: 'Teléfono' },
      { key: 'email', label: 'Correo' },
      { key: 'address', label: 'Dirección' },
      { key: 'last_purchase', label: 'Última compra', date: true },
      { key: 'total_purchased', label: 'Total comprado', money: true, total: true },
      { key: 'total_paid', label: 'Pagado', money: true, total: true },
      { key: 'balance', label: 'Balance pendiente', money: true, total: true, render: (r) => html`<b class="${r.balance > 0 ? 'text-danger' : ''}">${Fmt.money(r.balance)}</b>` },
    ];
    const load = async () => {
      rows = await api('suppliers.list', { search });
      setHTML(box, table({ columns: cols, rows, clickable: true, empty: 'No hay proveedores registrados.' }));
      onRowClick(box, rows, (r) => supplierDetail(r.id, load));
    };
    $('#s-search', tb).oninput = debounce((e) => { search = e.target.value; load(); });
    $('#s-new', tb).onclick = () => supplierForm(null, load);
    $('#s-export', tb).onclick = () => exportCsv('proveedores', cols, rows);
    await load();
  },
});

async function supplierDetail(id, onChange) {
  const s = await api('suppliers.get', { id });
  const actions = [
    { label: 'Cerrar' },
    {
      label: 'Saldo inicial',
      onClick: () => openingDialog({
        title: `Saldo inicial con ${s.name}`, who: 'Lo que ya se le debía a este proveedor antes de usar el sistema', withInvoice: true,
        onSubmit: async (f) => { await api('suppliers.opening', { supplier_id: id, ...f }); onChange && onChange(); },
      }),
    },
    { label: 'Editar', onClick: () => supplierForm(s, onChange) },
  ];
  if (s.balance > 0) {
    actions.push({
      label: 'Registrar pago', primary: true,
      onClick: () => paymentDialog({
        title: `Pago a ${s.name}`, maxAmount: s.balance, withDate: true,
        info: 'El pago se aplicará a las compras pendientes más antiguas.',
        onSubmit: async (f) => { await api('suppliers.pay', { supplier_id: id, ...f }); toast('Pago registrado.'); onChange && onChange(); },
      }),
    });
  }
  const m = modal({
    title: s.name,
    width: 920,
    body: html`
      <div class="kv cols-4">
        <div><span>Teléfono</span><b>${s.phone || '—'}</b></div>
        <div><span>Correo</span><b>${s.email || '—'}</b></div>
        <div class="span-2"><span>Dirección</span><b>${s.address || '—'}</b></div>
        <div><span>Total comprado</span><b>${Fmt.money(s.total_purchased)}</b></div>
        <div><span>Pagado</span><b>${Fmt.money(s.total_paid)}</b></div>
        <div><span>Balance pendiente</span><b class="${s.balance > 0 ? 'text-danger' : ''}">${Fmt.money(s.balance)}</b></div>
      </div>
      <h4 class="section-title">Historial de compras</h4>
      ${table({ columns: PURCHASE_COLUMNS.filter((c) => !['supplier_name', 'user_name', 'units'].includes(c.key)), rows: s.purchases, empty: 'Sin compras.' })}
      <h4 class="section-title">Historial de pagos</h4>
      ${table({
        columns: [
          { key: 'date', label: 'Fecha', date: true },
          { key: 'purchase_id', label: 'Compra', render: (r) => Fmt.purchaseNo(r.purchase_id) },
          { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method] },
          { key: 'amount', label: 'Monto', money: true, total: true },
          { key: 'note', label: 'Nota' },
          { key: 'user_name', label: 'Usuario' },
          voidPayColumn((r) => r.purchase_payment_type === 'credito' && r.purchase_status !== 'anulada'),
        ],
        rows: s.payments, empty: 'Sin pagos.',
      })}`,
    actions,
  });
  bindVoidPayments(m.body, s.payments, {
    method: 'purchases.voidPayment', what: (r) => `pago a ${s.name} (${Fmt.purchaseNo(r.purchase_id)})`, cashNote: 'el efectivo vuelve a la caja de esta PC',
    onDone: () => { m.close(); onChange && onChange(); supplierDetail(id, onChange); },
  });
}

App.register({
  id: 'payables', title: 'Cuentas por pagar', icon: 'outbox', group: 'Finanzas', roles: ['admin'],
  async render(page) {
    const stats = el(html`<div class="stats"></div>`);
    page.appendChild(stats);
    const tb = toolbar(page, { right: html`<button class="btn" id="ap-export">${icon('download')} Exportar</button>` });
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    const cols = [
      { key: 'supplier_name', label: 'Proveedor', render: (r) => html`<b>${r.supplier_name}</b>`, csv: (r) => r.supplier_name },
      { key: 'id', label: 'Compra', render: (r) => html`${Fmt.purchaseNo(r.id)}${r.opening ? html` <span class="chip">Saldo inicial</span>` : ''}`, csv: (r) => Fmt.purchaseNo(r.id) },
      { key: 'invoice_ref', label: 'Factura' },
      { key: 'date', label: 'Fecha', date: true },
      { key: 'total', label: 'Total de la compra', money: true, total: true },
      { key: 'paid', label: 'Monto pagado', money: true, total: true },
      { key: 'balance', label: 'Balance pendiente', money: true, total: true },
      { key: 'due_date', label: 'Vencimiento', date: true },
      { key: 'status', label: 'Estado', render: accountBadge, csv: (r) => (r.overdue ? 'vencido' : r.status) },
      { label: '', render: () => html`<button class="btn small primary" data-pay>Pagar</button>`, csv: false },
    ];
    const load = async () => {
      const rows = await api('payables.list');
      const bySupplier = {};
      rows.forEach((r) => (bySupplier[r.supplier_name] = (bySupplier[r.supplier_name] || 0) + r.balance));
      const total = rows.reduce((s, r) => s + r.balance, 0);
      const overdue = rows.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0);
      setHTML(stats, [
        statCard('Total que debo a proveedores', Fmt.money(total), { tone: 'brand', iconName: 'outbox', sub: `${Object.keys(bySupplier).length} proveedores · ${rows.length} compras` }),
        statCard('Vencido', Fmt.money(overdue), { tone: overdue ? 'danger' : '', iconName: 'alert' }),
        statCard('Por vencer', Fmt.money(total - overdue), { iconName: 'history' }),
      ]);
      setHTML(box, table({ columns: cols, rows, clickable: true, empty: '¡No hay cuentas por pagar!', rowClass: (r) => (r.overdue ? 'row-danger' : '') }));
      onRowClick(box, rows, (r, e) => {
        if (e.target.closest('[data-pay]')) return;
        purchaseDetail(r.id, load);
      });
      onRowButton(box, '[data-pay]', rows, (r) => paymentDialog({
        title: `Pago a ${r.supplier_name} · ${Fmt.purchaseNo(r.id)}`, maxAmount: r.balance, withDate: true,
        onSubmit: async (f) => { await api('purchases.pay', { purchase_id: r.id, ...f }); toast('Pago registrado.'); load(); },
      }));
      $('#ap-export', tb).onclick = () => exportCsv('cuentas-por-pagar', cols, rows);
    };
    await load();
  },
});
