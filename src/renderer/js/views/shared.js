'use strict';
/* Componentes compartidos: buscador de productos, cuadro de pago, etc. */

// Buscador de productos con soporte para lector de código de barras (Enter).
function productPicker(root, onPick, { placeholder = 'Buscar producto o escanear código de barras…', showStock = true, priceKey = 'price_retail' } = {}) {
  const box = el(html`
    <div class="picker">
      <div class="search big">${icon('search')}<input placeholder="${placeholder}" autocomplete="off"></div>
      <div class="picker-results hidden"></div>
    </div>`);
  root.appendChild(box);
  const input = $('input', box);
  const results = $('.picker-results', box);
  let items = [];
  let active = 0;

  const close = () => { results.classList.add('hidden'); items = []; };
  const pick = (p) => { close(); input.value = ''; onPick(p); input.focus(); };
  const draw = () => {
    if (!items.length) { setHTML(results, html`<div class="picker-empty">Sin resultados</div>`); return; }
    setHTML(results, items.map((p, i) => html`
      <div class="picker-item ${i === active ? 'active' : ''}" data-i="${i}">
        ${productThumb(p, 34)}
        <div class="pi-main"><b>${p.name}</b><small>${[p.brand, p.color, p.size, p.sku].filter(Boolean).join(' · ')}</small></div>
        <div class="pi-side">${typeof priceKey === 'function' ? priceKey(p) : Fmt.money(p[priceKey])}${showStock ? html`<small class="${p.stock <= 0 ? 'text-danger' : p.stock <= p.min_stock ? 'text-warn' : ''}">Exist.: ${p.stock}</small>` : ''}</div>
      </div>`));
    $$('.picker-item', results).forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); pick(items[Number(d.dataset.i)]); }));
  };
  const search = debounce(async () => {
    const q = input.value.trim();
    if (!q) return close();
    items = (await api('products.list', { search: q })).slice(0, 12);
    active = 0;
    results.classList.remove('hidden');
    draw();
  }, 180);

  input.addEventListener('input', search);
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      e.preventDefault();
      const code = input.value.trim();
      if (!code) return;
      const exact = await api('products.findByCode', { code });
      if (exact) return pick(exact);
      if (items.length) return pick(items[active]);
      toast('Producto no encontrado.', 'error');
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return { focus: () => input.focus(), input };
}

// Cuadro para registrar un pago (abono de cliente o pago a proveedor).
function paymentDialog({ title, maxAmount, info, onSubmit, withDate = false }) {
  modal({
    title,
    width: 460,
    body: html`
      ${info ? html`<div class="info-box">${info}</div>` : ''}
      <label class="field"><span>Monto (pendiente: ${Fmt.money(maxAmount)})</span><input name="amount" type="number" min="0.01" step="0.01" value="${maxAmount}"></label>
      <label class="field"><span>Método de pago</span><select name="method">${methodOptions()}</select></label>
      ${withDate ? html`<label class="field"><span>Fecha</span><input name="date" type="date" value="${todayStr()}"></label>` : ''}
      <label class="field"><span>Nota</span><input name="note" placeholder="Opcional"></label>`,
    actions: [
      { label: 'Cancelar' },
      { label: 'Registrar pago', primary: true, onClick: async ({ body }) => { await onSubmit(formData(body)); } },
    ],
  });
}

function accountBadge(r) {
  if (r.status === 'anulada') return badge('anulada');
  if (r.overdue) return html`${badge(r.status)} ${badge('vencido')}`;
  return badge(r.status);
}

// Saldo inicial de un cliente o proveedor: lo que ya se debía al empezar a usar el sistema (RF-NUE-01).
function openingDialog({ title, who, withInvoice = false, onSubmit }) {
  const due = new Date();
  due.setDate(due.getDate() + (Number(App.settings.credit_days) || 30));
  modal({
    title,
    width: 480,
    body: html`
      <p class="muted">${who}. Se cobra o se paga con abonos, como cualquier otra deuda, pero <b>no cuenta como venta ni compra</b> del período.</p>
      <div class="grid-2">
        <label class="field"><span>Monto *</span><input name="amount" type="number" min="0.01" step="0.01"></label>
        <label class="field"><span>Fecha de la deuda</span><input type="date" name="date" value="${todayStr()}"></label>
        <label class="field"><span>Vence</span><input type="date" name="due_date" value="${`${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`}"></label>
        ${withInvoice ? html`<label class="field"><span>Factura</span><input name="invoice_ref" placeholder="Opcional"></label>` : ''}
        <label class="field span-2"><span>Nota</span><input name="note" placeholder="Ej. Saldo del cuaderno al 30/09"></label>
      </div>`,
    actions: [
      { label: 'Cancelar' },
      { label: 'Guardar saldo', primary: true, onClick: async ({ body }) => { await onSubmit(formData(body)); toast('Saldo inicial registrado.'); } },
    ],
  });
}

// Botón "Anular" de un pago registrado por error (abono de cliente o pago a proveedor). Solo el
// administrador, y solo en ventas o compras a crédito: lo de contado se corrige anulando la venta o compra.
const voidPayColumn = (canVoid) => ({
  label: '', csv: false,
  render: (r) => (r.voided ? badge('anulada', 'Anulado') : App.isAdmin() && canVoid(r) ? html`<button class="btn small danger" data-void-pay>Anular</button>` : ''),
});
function bindVoidPayments(root, rows, { method, what, cashNote, onDone }) {
  onRowButton(root, '[data-void-pay]', rows, async (r) => {
    const reason = await promptDialog({
      title: `Anular ${what(r)}`,
      label: `Motivo · ${Fmt.money(r.amount)} en ${METHOD_LABELS[r.method].toLowerCase()}. La deuda vuelve a quedar como antes${r.method === 'efectivo' ? `; ${cashNote}` : ''}.`,
    });
    if (!reason) return;
    await api(method, { payment_id: r.id, reason });
    toast('Pago anulado.');
    App.refreshCashBadge();
    onDone && onDone();
  });
}
