'use strict';
/* Punto de venta, historial de ventas, devoluciones, clientes y cuentas por cobrar. */

App.register({
  id: 'pos', title: 'Nueva venta', icon: 'cart', group: 'Principal',
  async render(page) {
    const admin = App.isAdmin();
    const settings = App.settings;
    const cash = await api('cash.status');
    let customers = await api('customers.list');
    const sale = { sale_type: 'detalle', payment_type: 'contado', customer_id: '', lines: [], discount: 0, discountMode: 'monto', payments: [{ method: 'efectivo', amount: '' }] };
    const canDiscount = admin || settings.seller_can_discount === '1';

    if (!cash.open && settings.require_open_cash === '1') {
      page.appendChild(el(html`<div class="warn-box">${icon('alert')} La caja está cerrada. Para cobrar en efectivo debe <a href="#" id="go-cash">abrir la caja</a>.</div>`));
      $('#go-cash', page).onclick = (e) => { e.preventDefault(); App.go('cash'); };
    }

    const root = el(html`
      <div class="pos">
        <div class="pos-left card">
          <div id="pos-picker"></div>
          <div id="pos-lines" class="pos-lines"></div>
        </div>
        <div class="pos-right card">
          <div class="seg full" id="pos-type"><button data-v="detalle" class="active">Al detalle</button><button data-v="mayor">Al por mayor</button></div>
          <label class="field"><span>Cliente</span>
            <div class="inline"><select id="pos-customer"></select><button class="btn" id="pos-new-customer" title="Nuevo cliente">${icon('plus')}</button></div>
          </label>
          <div class="seg full" id="pos-pay-type"><button data-v="contado" class="active">Contado</button><button data-v="credito">Crédito</button></div>
          <label class="field credit-only hidden"><span>Fecha de vencimiento</span><input type="date" id="pos-due"></label>
          <div class="pos-totals">
            <div><span>Subtotal</span><b id="t-sub"></b></div>
            ${canDiscount ? html`<div class="disc"><span>Descuento</span>
              <div class="inline"><select id="pos-disc-mode"><option value="monto">${Fmt.currency}</option><option value="pct">%</option></select><input id="pos-disc" type="number" min="0" step="0.01" value="0" class="num"></div></div>` : ''}
            <div class="grand"><span>Total</span><b id="t-total"></b></div>
          </div>
          <div class="pos-payments">
            <div class="row-between"><span class="label" id="pay-label">Pago</span><button class="link" id="add-pay">+ Otro método</button></div>
            <div id="pay-rows"></div>
            <div class="change"><span id="change-label">Cambio</span><b id="t-change"></b></div>
          </div>
          <label class="field"><span>Nota</span><input id="pos-note" placeholder="Opcional"></label>
          <button class="btn primary big block" id="pos-charge">Cobrar (F9)</button>
          <button class="btn block" id="pos-clear">Limpiar venta</button>
        </div>
      </div>`);
    page.appendChild(root);

    const drawCustomers = () => setHTML($('#pos-customer', root), options(customers.map((c) => [c.id, `${c.name}${c.balance > 0 ? ` (debe ${Fmt.money(c.balance)})` : ''}`]), sale.customer_id, { empty: 'Cliente general (contado)' }));
    drawCustomers();
    const due = new Date();
    due.setDate(due.getDate() + (Number(settings.credit_days) || 30));
    $('#pos-due', root).value = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;

    const listPrice = (p) => (sale.sale_type === 'mayor' ? p.price_wholesale : p.price_retail);
    const subtotal = () => sale.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
    const discountAmount = () => {
      if (!canDiscount) return 0;
      const v = Number($('#pos-disc', root).value) || 0;
      return Math.round((sale.discountMode === 'pct' ? (subtotal() * v) / 100 : v) * 100) / 100;
    };
    const total = () => Math.max(0, Math.round((subtotal() - discountAmount()) * 100) / 100);

    const drawPayments = () => {
      const box = $('#pay-rows', root);
      setHTML(box, sale.payments.map((p, i) => html`
        <div class="pay-row" data-i="${i}">
          <select data-k="method">${methodOptions(p.method)}</select>
          <input data-k="amount" type="number" min="0" step="0.01" class="num" placeholder="${i === 0 && sale.payment_type === 'contado' ? 'Monto recibido' : '0.00'}" value="${p.amount}">
          ${i > 0 ? html`<button class="icon-btn danger" data-del>${icon('x')}</button>` : ''}
        </div>`));
      $$('.pay-row', box).forEach((row) => {
        const p = sale.payments[Number(row.dataset.i)];
        $('[data-k=method]', row).onchange = (e) => { p.method = e.target.value; updateTotals(); };
        $('[data-k=amount]', row).oninput = (e) => { p.amount = e.target.value; updateTotals(); };
        const del = $('[data-del]', row);
        if (del) del.onclick = () => { sale.payments.splice(Number(row.dataset.i), 1); drawPayments(); updateTotals(); };
      });
    };

    const updateTotals = () => {
      const t = total();
      $('#t-sub', root).textContent = Fmt.money(subtotal());
      $('#t-total', root).textContent = Fmt.money(t);
      const received = sale.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (sale.payment_type === 'contado') {
        const effective = received || t; // sin monto = pago exacto
        $('#change-label', root).textContent = effective >= t ? 'Cambio' : 'Falta';
        $('#t-change', root).textContent = Fmt.money(Math.abs(effective - t));
        $('#t-change', root).className = effective >= t ? 'text-ok' : 'text-danger';
      } else {
        $('#change-label', root).textContent = 'Queda a crédito';
        $('#t-change', root).textContent = Fmt.money(Math.max(0, t - received));
        $('#t-change', root).className = 'text-warn';
      }
    };

    const drawLines = () => {
      const box = $('#pos-lines', root);
      if (!sale.lines.length) {
        setHTML(box, html`<div class="pos-empty">${icon('cart', 'huge')}<p>Escanee un código de barras o busque una gorra para empezar.</p></div>`);
        updateTotals();
        return;
      }
      setHTML(box, html`
        <table class="table lines">
          <thead><tr><th></th><th>Producto</th><th class="text-right">Exist.</th><th>Cant.</th><th>Precio</th><th class="text-right">Importe</th><th></th></tr></thead>
          <tbody>${sale.lines.map((l, i) => html`
            <tr data-i="${i}">
              <td class="w-thumb">${productThumb(l.p, 36)}</td>
              <td><b>${l.p.name}</b><div class="muted small">${[l.p.brand, l.p.color, l.p.size, l.p.sku].filter(Boolean).join(' · ')}</div></td>
              <td class="text-right ${l.qty > l.p.stock ? 'text-danger' : ''}">${l.p.stock}</td>
              <td><div class="qty"><button data-q="-1">−</button><input data-k="qty" type="number" min="1" step="1" value="${l.qty}"><button data-q="1">+</button></div></td>
              <td>${admin ? html`<input class="num" data-k="unit_price" type="number" min="0" step="0.01" value="${l.unit_price}">` : Fmt.money(l.unit_price)}</td>
              <td class="text-right sub"><b>${Fmt.money(l.qty * l.unit_price)}</b></td>
              <td><button class="icon-btn danger" data-del title="Quitar">${icon('trash')}</button></td>
            </tr>`)}</tbody>
        </table>`);
      $$('tr[data-i]', box).forEach((tr) => {
        const i = Number(tr.dataset.i);
        const l = sale.lines[i];
        const refresh = () => { $('.sub b', tr).textContent = Fmt.money(l.qty * l.unit_price); updateTotals(); };
        $('[data-k=qty]', tr).oninput = (e) => { l.qty = Math.max(1, parseInt(e.target.value, 10) || 1); refresh(); };
        $$('[data-q]', tr).forEach((b) => (b.onclick = () => { l.qty = Math.max(1, l.qty + Number(b.dataset.q)); drawLines(); }));
        const price = $('[data-k=unit_price]', tr);
        if (price) price.oninput = (e) => { l.unit_price = Number(e.target.value) || 0; refresh(); };
        $('[data-del]', tr).onclick = () => { sale.lines.splice(i, 1); drawLines(); };
      });
      updateTotals();
    };

    const picker = productPicker($('#pos-picker', root), (p) => {
      if (p.stock <= 0 && settings.allow_negative_stock !== '1') { toast(`"${p.name}" está agotado.`, 'error'); return; }
      const ex = sale.lines.find((l) => l.p.id === p.id);
      if (ex) ex.qty += 1;
      else sale.lines.push({ p, qty: 1, unit_price: listPrice(p) });
      drawLines();
    }, { priceKey: (p) => Fmt.money(listPrice(p)) });

    $$('#pos-type [data-v]', root).forEach((b) => (b.onclick = () => {
      sale.sale_type = b.dataset.v;
      $$('#pos-type [data-v]', root).forEach((x) => x.classList.toggle('active', x === b));
      sale.lines.forEach((l) => (l.unit_price = listPrice(l.p)));
      drawLines();
    }));
    $$('#pos-pay-type [data-v]', root).forEach((b) => (b.onclick = () => {
      sale.payment_type = b.dataset.v;
      $$('#pos-pay-type [data-v]', root).forEach((x) => x.classList.toggle('active', x === b));
      $$('.credit-only', root).forEach((x) => x.classList.toggle('hidden', sale.payment_type !== 'credito'));
      $('#pay-label', root).textContent = sale.payment_type === 'credito' ? 'Abono inicial (opcional)' : 'Pago';
      drawPayments();
      updateTotals();
    }));
    $('#pos-customer', root).onchange = (e) => (sale.customer_id = e.target.value);
    $('#pos-new-customer', root).onclick = () => customerForm(null, async (id) => {
      customers = await api('customers.list');
      sale.customer_id = String(id);
      drawCustomers();
    });
    if (canDiscount) {
      $('#pos-disc', root).oninput = updateTotals;
      $('#pos-disc-mode', root).onchange = (e) => { sale.discountMode = e.target.value; updateTotals(); };
    }
    $('#add-pay', root).onclick = () => { sale.payments.push({ method: 'tarjeta', amount: '' }); drawPayments(); };
    $('#pos-clear', root).onclick = () => App.go('pos');

    const charge = async () => {
      if (!sale.lines.length) return toast('Agregue productos a la venta.', 'error');
      const t = total();
      let payments = sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));
      if (sale.payment_type === 'contado' && payments.reduce((s, p) => s + p.amount, 0) === 0) payments = [{ method: payments[0].method, amount: t }];
      const data = {
        sale_type: sale.sale_type,
        payment_type: sale.payment_type,
        customer_id: sale.customer_id ? Number(sale.customer_id) : null,
        due_date: sale.payment_type === 'credito' ? $('#pos-due', root).value : undefined,
        discount: discountAmount(),
        note: $('#pos-note', root).value,
        items: sale.lines.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price: l.unit_price })),
        payments,
      };
      const btn = $('#pos-charge', root);
      btn.disabled = true;
      try {
        const id = await api('sales.create', data);
        const s = await api('sales.get', { id });
        App.refreshCashBadge();
        modal({
          title: 'Venta registrada',
          width: 420,
          body: html`<div class="done">
            <div class="done-no">${Fmt.saleNo(id)}</div>
            <div class="done-total">${Fmt.money(s.total)}</div>
            ${s.change_given > 0 ? html`<div class="done-change">Cambio: <b>${Fmt.money(s.change_given)}</b></div>` : ''}
            ${s.balance > 0 ? html`<div class="done-change">Pendiente a crédito: <b>${Fmt.money(s.balance)}</b></div>` : ''}
          </div>`,
          onClose: () => App.go('pos'),
          actions: [
            { label: 'Imprimir recibo', onClick: async () => { await printReceipt(s); return false; } },
            { label: 'Nueva venta', primary: true },
          ],
        });
        // Con impresora de tickets elegida y "imprimir al cobrar", el recibo sale solo.
        window.capsApi.printer.get().then((p) => { if (p.auto && p.name) printReceipt(s); }).catch(() => {});
      } catch { /* mensaje mostrado */ } finally {
        btn.disabled = false;
      }
    };
    $('#pos-charge', root).onclick = charge;
    const keyHandler = (e) => {
      if (!document.body.contains(root)) return document.removeEventListener('keydown', keyHandler);
      if (e.key === 'F9') { e.preventDefault(); charge(); }
    };
    document.addEventListener('keydown', keyHandler);

    drawPayments();
    drawLines();
    picker.focus();
  },
});

// Recibo para impresora de tickets de 80 mm (72 mm impresos) o de 58 mm (48 mm impresos).
function receiptHtml(s, width = 80) {
  const st = App.settings;
  const narrow = Number(width) === 58;
  const rows = s.items.map((i) => `
    <tr><td colspan="3">${esc(i.description)}</td></tr>
    <tr><td>${i.qty} x ${esc(Fmt.money(i.unit_price))}</td><td></td><td class="r">${esc(Fmt.money(i.qty * i.unit_price))}</td></tr>`).join('');
  const pays = s.payments.filter((p) => !p.voided).map((p) => `<tr><td>${esc(METHOD_LABELS[p.method])}${p.kind === 'abono' ? ' (abono)' : ''}</td><td></td><td class="r">${esc(Fmt.money(p.amount))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: ${narrow ? '2mm' : '4mm'}; }
    body { font-family: 'Courier New', monospace; font-size: ${narrow ? 10 : 12}px; width: ${narrow ? 48 : 72}mm; margin: 0 auto; color: #000; }
    h1 { font-size: ${narrow ? 13 : 16}px; text-align: center; margin: 0; letter-spacing: 1px; }
    .c { text-align: center; } .r { text-align: right; } table { width: 100%; border-collapse: collapse; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .big { font-size: 15px; font-weight: bold; }
  </style></head><body>
    <h1>${esc(st.business_name)}</h1>
    <div class="c">${esc(st.business_tagline || '')}</div>
    ${st.business_address ? `<div class="c">${esc(st.business_address)}</div>` : ''}
    ${st.business_phone ? `<div class="c">Tel. ${esc(st.business_phone)}</div>` : ''}
    <hr>
    <div>Recibo: ${esc(Fmt.saleNo(s.id))}</div>
    <div>Fecha: ${esc(Fmt.datetime(s.created_at))}</div>
    <div>Venta: ${s.sale_type === 'mayor' ? 'Al por mayor' : 'Al detalle'} · ${s.payment_type === 'credito' ? 'Crédito' : 'Contado'}</div>
    ${s.customer_name ? `<div>Cliente: ${esc(s.customer_name)}</div>` : ''}
    <div>Atendido por: ${esc(s.user_name)}</div>
    <hr><table>${rows}</table><hr>
    <table>
      <tr><td>Subtotal</td><td></td><td class="r">${esc(Fmt.money(s.subtotal))}</td></tr>
      ${s.discount > 0 ? `<tr><td>Descuento</td><td></td><td class="r">-${esc(Fmt.money(s.discount))}</td></tr>` : ''}
      <tr class="big"><td>TOTAL</td><td></td><td class="r">${esc(Fmt.money(s.total))}</td></tr>
      ${pays}
      ${s.change_given > 0 ? `<tr><td>Cambio</td><td></td><td class="r">${esc(Fmt.money(s.change_given))}</td></tr>` : ''}
      ${s.returned_total > 0 ? `<tr><td>Devuelto</td><td></td><td class="r">-${esc(Fmt.money(s.returned_total))}</td></tr>` : ''}
      ${s.balance > 0 ? `<tr class="big"><td>PENDIENTE</td><td></td><td class="r">${esc(Fmt.money(s.balance))}</td></tr><tr><td colspan="3">Vence: ${esc(Fmt.date(s.due_date))}</td></tr>` : ''}
    </table>
    ${s.status === 'anulada' ? '<hr><div class="c big">*** ANULADA ***</div>' : ''}
    <hr><div class="c">${esc(st.receipt_footer || '')}</div>
    <div class="c">Documento sin valor fiscal</div>
  </body></html>`;
}

async function printReceipt(s) {
  try {
    const p = await window.capsApi.printer.get();
    await window.capsApi.printHtml(receiptHtml(s, p.width), { receipt: true });
  } catch (err) {
    toast(err.message, 'error');
  }
}

const SALE_COLUMNS = () => [
  { key: 'id', label: 'No.', render: (r) => Fmt.saleNo(r.id), csv: (r) => Fmt.saleNo(r.id) },
  { key: 'created_at', label: 'Fecha', datetime: true },
  { key: 'customer_name', label: 'Cliente', render: (r) => r.customer_name || html`<span class="muted">General</span>`, csv: (r) => r.customer_name || 'General' },
  { key: 'sale_type', label: 'Tipo', render: (r) => (r.sale_type === 'mayor' ? 'Por mayor' : 'Detalle'), csv: (r) => r.sale_type },
  { key: 'payment_type', label: 'Pago', render: (r) => (r.payment_type === 'credito' ? 'Crédito' : 'Contado'), csv: (r) => r.payment_type },
  { key: 'methods', label: 'Método', render: (r) => (r.methods || '').split(',').filter(Boolean).map((m) => METHOD_LABELS[m]).join(', ') },
  { key: 'units', label: 'Unid.', num: true, total: true },
  { key: 'discount', label: 'Descuento', money: true, total: true },
  { key: 'total', label: 'Total', money: true, total: (rows) => rows.filter((r) => r.status !== 'anulada').reduce((s, r) => s + r.total - r.returned_total, 0), render: (r) => html`${Fmt.money(r.total)}${r.returned_total > 0 ? html`<div class="small text-danger">Dev. -${Fmt.money(r.returned_total)}</div>` : ''}` },
  ...(App.isAdmin() ? [{ key: 'cost_total', label: 'Costo', money: true, total: (rows) => rows.filter((r) => r.status !== 'anulada').reduce((s, r) => s + r.cost_total, 0) }] : []),
  { key: 'balance', label: 'Balance', money: true, total: true },
  { key: 'status', label: 'Estado', render: (r) => badge(r.status), csv: (r) => STATUS_LABELS[r.status] },
  { key: 'user_name', label: 'Vendedor' },
];

App.register({
  id: 'sales', title: 'Ventas', icon: 'receipt', group: 'Principal',
  async render(page) {
    const filters = { sale_type: '', payment_type: '', status: '' };
    let range = {};
    const tb = toolbar(page, {
      left: html`
        <select data-f="sale_type">${options([['', 'Detalle y por mayor'], ['detalle', 'Al detalle'], ['mayor', 'Al por mayor']], '')}</select>
        <select data-f="payment_type">${options([['', 'Contado y crédito'], ['contado', 'Contado'], ['credito', 'Crédito']], '')}</select>
        <select data-f="status">${options([['', 'Todos los estados'], ['pagado', 'Pagado'], ['parcial', 'Parcial'], ['pendiente', 'Pendiente'], ['anulada', 'Anulada']], '')}</select>
        <div class="search">${icon('search')}<input id="sl-search" placeholder="No. de venta o cliente…"></div>`,
      right: html`<button class="btn" id="sl-export">${icon('download')} Exportar</button><button class="btn primary" id="sl-new">${icon('plus')} Nueva venta</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const stats = el(html`<div class="stats"></div>`);
    page.appendChild(stats);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = SALE_COLUMNS();
    const render = () => {
      const q = $('#sl-search', tb).value.trim().toLowerCase();
      const shown = q ? rows.filter((r) => Fmt.saleNo(r.id).toLowerCase().includes(q) || String(r.id) === q || (r.customer_name || '').toLowerCase().includes(q)) : rows;
      const valid = shown.filter((r) => r.status !== 'anulada');
      const net = valid.reduce((s, r) => s + r.total - r.returned_total, 0);
      setHTML(stats, [
        statCard('Total vendido', Fmt.money(net), { tone: 'brand', iconName: 'receipt', sub: `${valid.length} ventas` }),
        statCard('Al detalle', Fmt.money(valid.filter((r) => r.sale_type === 'detalle').reduce((s, r) => s + r.total - r.returned_total, 0)), { iconName: 'tag' }),
        statCard('Al por mayor', Fmt.money(valid.filter((r) => r.sale_type === 'mayor').reduce((s, r) => s + r.total - r.returned_total, 0)), { iconName: 'box' }),
        statCard('Unidades vendidas', Fmt.num(valid.reduce((s, r) => s + r.units, 0)), { iconName: 'cart' }),
        App.isAdmin() ? statCard('Ganancia bruta', Fmt.money(net - valid.reduce((s, r) => s + r.cost_total, 0)), { iconName: 'chart', tone: 'ok' }) : '',
      ]);
      setHTML(box, table({ columns: cols, rows: shown, clickable: true, empty: 'No hay ventas en el período.', rowClass: (r) => (r.status === 'anulada' ? 'inactive' : '') }));
      onRowClick(box, shown, (r) => saleDetail(r.id, load));
      return shown;
    };
    const load = async () => {
      rows = await api('sales.list', { ...range, ...filters });
      render();
    };
    $$('[data-f]', tb).forEach((s) => (s.onchange = () => { filters[s.dataset.f] = s.value; load(); }));
    $('#sl-search', tb).oninput = debounce(render, 150);
    $('#sl-new', tb).onclick = () => App.go('pos');
    $('#sl-export', tb).onclick = () => exportCsv('ventas', cols, render());
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'dia' });
  },
});

async function saleDetail(id, onChange) {
  const s = await api('sales.get', { id });
  const admin = App.isAdmin();
  const actions = [{ label: 'Cerrar' }, { label: 'Imprimir recibo', onClick: async () => { await printReceipt(s); return false; } }];
  if (s.status !== 'anulada') {
    if (admin && s.items.some((i) => i.qty > i.returned_qty)) actions.push({ label: 'Devolución', onClick: () => returnForm(s, onChange) });
    if (admin && !s.returns.length) {
      actions.push({
        label: 'Anular venta', danger: true,
        onClick: async () => {
          const reason = await promptDialog({ title: `Anular ${Fmt.saleNo(id)}`, label: 'Motivo de la anulación (la mercancía vuelve al inventario y se devuelve el dinero cobrado)' });
          if (!reason) return false;
          await api('sales.void', { id, reason });
          toast('Venta anulada.');
          onChange && onChange();
        },
      });
    }
    if (s.balance > 0 && (admin || App.settings.seller_can_receive_payments === '1')) {
      actions.push({
        label: 'Registrar abono', primary: true,
        onClick: () => paymentDialog({
          title: `Abono a ${Fmt.saleNo(id)}`, maxAmount: s.balance, info: html`Cliente: <b>${s.customer_name}</b>`,
          onSubmit: async (f) => { await api('sales.pay', { sale_id: id, ...f }); toast('Abono registrado.'); App.refreshCashBadge(); onChange && onChange(); },
        }),
      });
    }
  }
  modal({
    title: `Venta ${Fmt.saleNo(s.id)}`,
    width: 900,
    body: html`
      <div class="kv cols-4">
        <div><span>Fecha</span><b>${Fmt.datetime(s.created_at)}</b></div>
        <div><span>Cliente</span><b>${s.customer_name || 'General'}</b></div>
        <div><span>Tipo</span><b>${s.sale_type === 'mayor' ? 'Al por mayor' : 'Al detalle'}</b></div>
        <div><span>Pago</span><b>${s.payment_type === 'credito' ? 'Crédito' : 'Contado'}</b></div>
        <div><span>Subtotal</span><b>${Fmt.money(s.subtotal)}</b></div>
        <div><span>Descuento</span><b>${Fmt.money(s.discount)}</b></div>
        <div><span>Total</span><b>${Fmt.money(s.total)}</b></div>
        <div><span>Estado</span><b>${badge(s.status)}</b></div>
        ${s.returned_total > 0 ? html`<div><span>Devuelto</span><b class="text-danger">${Fmt.money(s.returned_total)}</b></div>` : ''}
        <div><span>Pagado</span><b>${Fmt.money(s.paid)}</b></div>
        <div><span>Balance</span><b class="${s.balance > 0 ? 'text-danger' : ''}">${Fmt.money(s.balance)}</b></div>
        ${s.due_date ? html`<div><span>Vence</span><b>${Fmt.date(s.due_date)}</b></div>` : ''}
        ${admin ? html`<div><span>Costo</span><b>${Fmt.money(s.cost_total)}</b></div><div><span>Ganancia bruta</span><b class="text-ok">${Fmt.money(s.total - s.cost_total)}</b></div>` : ''}
        <div><span>Vendedor</span><b>${s.user_name}</b></div>
        ${s.change_given > 0 ? html`<div><span>Cambio entregado</span><b>${Fmt.money(s.change_given)}</b></div>` : ''}
      </div>
      ${s.note ? html`<p class="muted">Nota: ${s.note}</p>` : ''}
      ${s.void_reason ? html`<div class="error-box">Anulada el ${Fmt.datetime(s.voided_at)}: ${s.void_reason}</div>` : ''}
      <h4 class="section-title">Productos</h4>
      ${table({
        columns: [
          { key: 'description', label: 'Producto' },
          { key: 'sku', label: 'SKU' },
          { key: 'qty', label: 'Cant.', num: true },
          { key: 'returned_qty', label: 'Devueltas', num: true },
          { key: 'unit_price', label: 'Precio', money: true },
          ...(admin ? [{ key: 'unit_cost', label: 'Costo', money: true }] : []),
          { key: 'net_total', label: 'Importe neto', money: true },
        ],
        rows: s.items,
      })}
      <h4 class="section-title">Pagos</h4>
      ${table({
        columns: [
          { key: 'created_at', label: 'Fecha', datetime: true },
          { key: 'kind', label: 'Tipo', render: (r) => (r.kind === 'abono' ? 'Abono' : 'Pago inicial') },
          { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method] },
          { key: 'amount', label: 'Monto', money: true },
          { key: 'user_name', label: 'Usuario' },
          { key: 'voided', label: '', render: (r) => (r.voided ? badge('anulada') : '') },
        ],
        rows: s.payments, empty: 'Sin pagos.',
      })}
      ${s.returns.length ? html`<h4 class="section-title">Devoluciones</h4>${table({
        columns: [
          { key: 'created_at', label: 'Fecha', datetime: true },
          { key: 'total', label: 'Total', money: true },
          { key: 'credit_applied', label: 'Rebajado del balance', money: true },
          { key: 'refund_amount', label: 'Reembolsado', money: true },
          { key: 'refund_method', label: 'Método', render: (r) => METHOD_LABELS[r.refund_method] || '—' },
          { key: 'restock', label: 'Reingresó al inventario', render: (r) => (r.restock ? 'Sí' : 'No') },
          { key: 'reason', label: 'Motivo' },
          { key: 'user_name', label: 'Usuario' },
        ],
        rows: s.returns,
      })}` : ''}`,
    actions,
  });
}

function returnForm(s, onChange) {
  const body = el(html`
    <div>
      <p>Indique las cantidades devueltas. El valor se calcula con el precio neto cobrado (incluye descuentos).</p>
      <table class="table lines">
        <thead><tr><th>Producto</th><th class="text-right">Vendidas</th><th class="text-right">Ya devueltas</th><th class="text-right">Precio neto</th><th>A devolver</th></tr></thead>
        <tbody>${s.items.map((i) => html`<tr>
          <td>${i.description}</td><td class="text-right">${i.qty}</td><td class="text-right">${i.returned_qty}</td>
          <td class="text-right">${Fmt.money(i.net_total / i.qty)}</td>
          <td><input class="num" type="number" min="0" max="${i.qty - i.returned_qty}" step="1" value="0" data-item="${i.id}" data-price="${i.net_total / i.qty}" ${i.qty - i.returned_qty <= 0 ? 'disabled' : ''}></td></tr>`)}</tbody>
      </table>
      <div class="grid-2">
        <label class="field"><span>Método de reembolso</span><select name="refund_method">${methodOptions('efectivo')}</select></label>
        <label class="check"><input type="checkbox" name="restock" checked> Reingresar la mercancía al inventario</label>
        <label class="field span-2"><span>Motivo *</span><input name="reason" placeholder="Ej. Talla incorrecta, defecto de fábrica…"></label>
      </div>
      <div class="info-box" id="ret-info"></div>
    </div>`);
  const info = () => {
    const t = $$('[data-item]', body).reduce((sum, i) => sum + (Number(i.value) || 0) * Number(i.dataset.price), 0);
    const credit = Math.min(t, s.balance);
    setHTML($('#ret-info', body), html`Valor devuelto: <b>${Fmt.money(t)}</b>${credit > 0 ? html` · Se rebaja del balance: <b>${Fmt.money(credit)}</b>` : ''} · A reembolsar al cliente: <b>${Fmt.money(t - credit)}</b>`);
  };
  $$('[data-item]', body).forEach((i) => (i.oninput = info));
  info();
  modal({
    title: `Devolución de ${Fmt.saleNo(s.id)}`,
    width: 760,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Registrar devolución', primary: true,
        onClick: async () => {
          const f = formData(body);
          const items = $$('[data-item]', body).map((i) => ({ sale_item_id: Number(i.dataset.item), qty: Number(i.value) || 0 })).filter((i) => i.qty > 0);
          await api('sales.return', { sale_id: s.id, items, restock: f.restock, refund_method: f.refund_method, reason: f.reason });
          toast('Devolución registrada.');
          $$('.modal-back').forEach((x) => x.remove());
          App.refreshCashBadge();
          onChange && onChange();
        },
      },
    ],
  });
}

/* ---------- Clientes ---------- */

function customerForm(c, onSaved) {
  c = c || {};
  modal({
    title: c.id ? 'Editar cliente' : 'Nuevo cliente',
    width: 560,
    body: html`
      <div class="grid-2">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${c.name || ''}"></label>
        <label class="field"><span>Teléfono</span><input name="phone" value="${c.phone || ''}"></label>
        <label class="field"><span>Cédula / RNC</span><input name="document" value="${c.document || ''}"></label>
        <label class="field"><span>Correo</span><input name="email" type="email" value="${c.email || ''}"></label>
        <label class="field"><span>Dirección</span><input name="address" value="${c.address || ''}"></label>
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${c.notes || ''}</textarea></label>
        ${c.id ? html`<label class="check"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Activo</label>` : ''}
      </div>`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar', primary: true,
        onClick: async ({ body }) => {
          const id = await api('customers.save', { ...formData(body), id: c.id });
          toast('Cliente guardado.');
          onSaved && onSaved(id);
        },
      },
    ],
  });
}

App.register({
  id: 'customers', title: 'Clientes', icon: 'users', group: 'Finanzas',
  async render(page) {
    let search = '';
    const tb = toolbar(page, {
      left: html`<div class="search">${icon('search')}<input id="c-search" placeholder="Buscar cliente por nombre, teléfono o cédula…"></div>`,
      right: html`<button class="btn" id="c-export">${icon('download')} Exportar</button><button class="btn primary" id="c-new">${icon('plus')} Nuevo cliente</button>`,
    });
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'name', label: 'Cliente', render: (r) => html`<b>${r.name}</b>`, csv: (r) => r.name },
      { key: 'phone', label: 'Teléfono' },
      { key: 'document', label: 'Cédula/RNC' },
      { key: 'last_purchase', label: 'Última compra', date: true },
      { key: 'total_bought', label: 'Total comprado', money: true, total: true },
      { key: 'balance', label: 'Balance pendiente', money: true, total: true, render: (r) => html`<b class="${r.balance > 0 ? 'text-danger' : ''}">${Fmt.money(r.balance)}</b>` },
      { key: 'next_due', label: 'Próx. vencimiento', date: true },
    ];
    const load = async () => {
      rows = await api('customers.list', { search });
      setHTML(box, table({ columns: cols, rows, clickable: true, empty: 'No hay clientes registrados.' }));
      onRowClick(box, rows, (r) => customerDetail(r.id, load));
    };
    $('#c-search', tb).oninput = debounce((e) => { search = e.target.value; load(); });
    $('#c-new', tb).onclick = () => customerForm(null, load);
    $('#c-export', tb).onclick = () => exportCsv('clientes', cols, rows);
    await load();
  },
});

async function customerDetail(id, onChange) {
  const c = await api('customers.get', { id });
  const canPay = App.isAdmin() || App.settings.seller_can_receive_payments === '1';
  const actions = [{ label: 'Cerrar' }, { label: 'Editar', onClick: () => customerForm(c, onChange) }];
  if (c.balance > 0 && canPay) {
    actions.push({
      label: 'Registrar abono', primary: true,
      onClick: () => paymentDialog({
        title: `Abono de ${c.name}`, maxAmount: c.balance, info: 'El abono se aplicará a las facturas pendientes más antiguas.',
        onSubmit: async (f) => { await api('sales.pay', { customer_id: id, ...f }); toast('Abono registrado.'); App.refreshCashBadge(); onChange && onChange(); },
      }),
    });
  }
  modal({
    title: c.name,
    width: 920,
    body: html`
      <div class="kv cols-4">
        <div><span>Teléfono</span><b>${c.phone || '—'}</b></div>
        <div><span>Cédula/RNC</span><b>${c.document || '—'}</b></div>
        <div><span>Correo</span><b>${c.email || '—'}</b></div>
        <div><span>Dirección</span><b>${c.address || '—'}</b></div>
        <div><span>Total comprado</span><b>${Fmt.money(c.total_bought)}</b></div>
        <div><span>Vendido a crédito</span><b>${Fmt.money(c.credit_sold)}</b></div>
        <div><span>Pagado (crédito)</span><b>${Fmt.money(c.credit_paid)}</b></div>
        <div><span>Balance pendiente</span><b class="${c.balance > 0 ? 'text-danger' : ''}">${Fmt.money(c.balance)}</b></div>
      </div>
      <h4 class="section-title">Compras del cliente</h4>
      ${table({
        columns: [
          { key: 'id', label: 'No.', render: (r) => Fmt.saleNo(r.id) },
          { key: 'date', label: 'Fecha', date: true },
          { key: 'payment_type', label: 'Pago', render: (r) => (r.payment_type === 'credito' ? 'Crédito' : 'Contado') },
          { key: 'total', label: 'Total', money: true },
          { key: 'paid', label: 'Pagado', money: true },
          { key: 'balance', label: 'Balance', money: true, total: true },
          { key: 'due_date', label: 'Vence', date: true },
          { key: 'status', label: 'Estado', render: (r) => badge(r.status) },
        ],
        rows: c.sales, empty: 'Sin compras.',
      })}
      <h4 class="section-title">Historial de pagos</h4>
      ${table({
        columns: [
          { key: 'created_at', label: 'Fecha', datetime: true },
          { key: 'sale_id', label: 'Venta', render: (r) => Fmt.saleNo(r.sale_id) },
          { key: 'kind', label: 'Tipo', render: (r) => (r.kind === 'abono' ? 'Abono' : 'Pago inicial') },
          { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method] },
          { key: 'amount', label: 'Monto', money: true, total: true },
          { key: 'user_name', label: 'Usuario' },
          { key: 'voided', label: '', render: (r) => (r.voided ? badge('anulada') : '') },
        ],
        rows: c.payments, empty: 'Sin pagos.',
      })}`,
    actions,
  });
}

App.register({
  id: 'receivables', title: 'Cuentas por cobrar', icon: 'inbox', group: 'Finanzas',
  async render(page) {
    const stats = el(html`<div class="stats"></div>`);
    page.appendChild(stats);
    const tb = toolbar(page, {
      left: html`<div class="seg" id="ar-view"><button data-v="cliente" class="active">Por cliente</button><button data-v="factura">Por factura</button></div>`,
      right: html`<button class="btn" id="ar-export">${icon('download')} Exportar</button>`,
    });
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    const canPay = App.isAdmin() || App.settings.seller_can_receive_payments === '1';
    let view = 'cliente';
    const custCols = [
      { key: 'name', label: 'Cliente', render: (r) => html`<b>${r.name}</b><div class="muted small">${r.phone || ''}</div>`, csv: (r) => r.name },
      { key: 'credit_sold', label: 'Total vendido a crédito', money: true, total: true },
      { key: 'credit_paid', label: 'Total pagado', money: true, total: true },
      { key: 'balance', label: 'Balance pendiente', money: true, total: true, render: (r) => html`<b class="text-danger">${Fmt.money(r.balance)}</b>` },
      { key: 'next_due', label: 'Fecha de vencimiento', date: true },
      { key: 'account_status', label: 'Estado', render: (r) => accountBadge({ status: r.account_status, overdue: r.overdue }), csv: (r) => (r.overdue ? 'vencido' : r.account_status) },
      ...(canPay ? [{ label: '', render: () => html`<button class="btn small primary" data-pay>Abonar</button>`, csv: false }] : []),
    ];
    const invCols = [
      { key: 'customer_name', label: 'Cliente', render: (r) => html`<b>${r.customer_name}</b>`, csv: (r) => r.customer_name },
      { key: 'id', label: 'Venta', render: (r) => Fmt.saleNo(r.id), csv: (r) => Fmt.saleNo(r.id) },
      { key: 'date', label: 'Fecha', date: true },
      { key: 'total', label: 'Total', money: true, total: true },
      { key: 'paid', label: 'Pagado', money: true, total: true },
      { key: 'balance', label: 'Balance', money: true, total: true },
      { key: 'due_date', label: 'Vencimiento', date: true },
      { key: 'status', label: 'Estado', render: accountBadge, csv: (r) => (r.overdue ? 'vencido' : r.status) },
      ...(canPay ? [{ label: '', render: () => html`<button class="btn small primary" data-pay>Abonar</button>`, csv: false }] : []),
    ];
    let rows = [];
    const load = async () => {
      const invoices = await api('receivables.list');
      const customers = await api('customers.list', { withBalance: true });
      const total = invoices.reduce((s, r) => s + r.balance, 0);
      const overdue = invoices.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0);
      setHTML(stats, [
        statCard('Total que me deben', Fmt.money(total), { tone: 'brand', iconName: 'inbox', sub: `${customers.length} clientes · ${invoices.length} facturas` }),
        statCard('Vencido', Fmt.money(overdue), { tone: overdue ? 'danger' : '', iconName: 'alert' }),
        statCard('Por vencer', Fmt.money(total - overdue), { iconName: 'history' }),
      ]);
      rows = view === 'cliente' ? customers : invoices;
      const cols = view === 'cliente' ? custCols : invCols;
      setHTML(box, table({ columns: cols, rows, clickable: true, empty: '¡Nadie le debe dinero!', rowClass: (r) => (r.overdue ? 'row-danger' : '') }));
      onRowClick(box, rows, (r) => (view === 'cliente' ? customerDetail(r.id, load) : saleDetail(r.id, load)));
      $$('tbody tr[data-idx]', box).forEach((tr) => {
        const b = $('[data-pay]', tr);
        if (!b) return;
        const r = rows[Number(tr.dataset.idx)];
        b.onclick = () => paymentDialog({
          title: view === 'cliente' ? `Abono de ${r.name}` : `Abono a ${Fmt.saleNo(r.id)}`,
          maxAmount: r.balance,
          info: view === 'cliente' ? 'Se aplicará a las facturas más antiguas.' : html`Cliente: <b>${r.customer_name}</b>`,
          onSubmit: async (f) => {
            await api('sales.pay', view === 'cliente' ? { customer_id: r.id, ...f } : { sale_id: r.id, ...f });
            toast('Abono registrado.');
            App.refreshCashBadge();
            load();
          },
        });
      });
      $('#ar-export', tb).onclick = () => exportCsv('cuentas-por-cobrar', cols, rows);
    };
    $$('#ar-view [data-v]', tb).forEach((b) => (b.onclick = () => {
      view = b.dataset.v;
      $$('#ar-view [data-v]', tb).forEach((x) => x.classList.toggle('active', x === b));
      load();
    }));
    await load();
  },
});
