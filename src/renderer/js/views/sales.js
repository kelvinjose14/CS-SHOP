'use strict';
/* Punto de venta, historial de ventas, devoluciones, clientes y cuentas por cobrar. */

App.register({
  id: 'pos', title: 'Nueva venta', icon: 'cart', group: 'Principal',
  async render(page, params = {}) {
    const admin = App.isAdmin();
    const settings = App.settings;
    // En paralelo: la caja y la lista corta de clientes (guardada un rato: no se pide en cada venta).
    // Y las ventas en espera (1.9): otros carritos abiertos; con params.held se retoma una.
    let [cash, customers, heldList, held] = await Promise.all([
      api('cash.status'), api('customers.options'), params.reservation ? [] : api('sales.heldList'),
      params.held ? api('sales.heldGet', { id: params.held }).catch(() => null) : null,
    ]);
    let heldId = held ? held.id : null;
    const sale = { sale_type: 'detalle', payment_type: 'contado', customer_id: '', lines: [], discount: 0, discountMode: 'monto', payments: [{ method: 'efectivo', amount: '' }] };
    // Venta de un apartado (1.5): el cliente y las gorras vienen del apartado.
    let reservation = null;
    if (params.reservation) {
      reservation = await api('reservations.get', { id: params.reservation }).catch(() => null);
      if (reservation && reservation.status !== 'activo') { toast(`El apartado ${Fmt.resNo(reservation.id)} ya está ${reservation.status}.`, 'error'); reservation = null; }
    }
    const heldHere = (id) => (reservation ? reservation.items.filter((i) => i.product_id === id).reduce((s, i) => s + i.qty, 0) : 0);
    const avail = (p) => (p.available ?? p.stock) + heldHere(p.id);
    const canDiscount = admin || settings.seller_can_discount === '1';

    if (!cash.open && settings.require_open_cash === '1') {
      page.appendChild(el(html`<div class="warn-box">${icon('alert')} La caja está cerrada. Para cobrar en efectivo debe <a href="#" id="go-cash">abrir la caja</a>.</div>`));
      $('#go-cash', page).onclick = (e) => { e.preventDefault(); App.go('cash'); };
    }

    if (reservation) {
      const b = el(html`<div class="info-box" id="pos-reservation">${icon('bookmark')} Venta del apartado <b>${Fmt.resNo(reservation.id)}</b> de <b>${reservation.customer_name}</b> (vence ${Fmt.date(reservation.expires_on)}). Al cobrar, el apartado queda vendido. <a href="#">Venta normal</a></div>`);
      $('a', b).onclick = (e) => { e.preventDefault(); App.go('pos'); };
      page.appendChild(b);
      sale.customer_id = String(reservation.customer_id);
    }

    const root = el(html`
      <div class="pos">
        <div class="pos-left card">
          ${reservation ? '' : html`<div class="pos-carts" id="pos-carts"></div>`}
          <div id="pos-picker"></div>
          <div id="pos-lines" class="pos-lines"><table class="table lines hidden"><thead><tr><th></th><th>Producto</th><th class="text-right">Disp.</th><th>Cant.</th><th>Precio</th><th class="text-right">Importe</th><th></th></tr></thead><tbody></tbody></table><div class="pos-empty">${icon('cart', 'huge')}<p>Escanee un código de barras o busque una gorra para empezar.</p></div></div>
        </div>
        <div class="pos-right card">
          <div class="seg full" id="pos-type"><button data-v="detalle" class="active">Al detalle</button><button data-v="mayor">Al por mayor</button></div>
          <label class="field"><span>Cliente</span>
            <div class="inline"><select id="pos-customer"></select><button class="btn" id="pos-new-customer" title="Nuevo cliente">${icon('plus')}</button></div>
          </label>
          <div class="seg full" id="pos-pay-type"><button data-v="contado" class="active">Contado</button><button data-v="credito">Crédito</button></div>
          <label class="field credit-only hidden"><span>Fecha de vencimiento</span><input type="date" id="pos-due" min="${todayStr()}"></label>
          <div class="pos-totals">
            <div><span>Subtotal <span class="muted small" id="t-items"></span></span><b id="t-sub"></b></div>
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
          ${reservation ? '' : html`<button class="btn block" id="pos-hold" title="Guarda este carrito para atender a otro cliente (F4)">${icon('pause')} Poner en espera (F4)</button>`}
          <button class="btn block" id="pos-clear">${heldId ? 'Descartar esta venta' : 'Limpiar venta'}</button>
        </div>
      </div>`);
    page.appendChild(root);

    const debt = (c) => [c.balance > 0 ? `debe ${Fmt.money(c.balance)}` : '', c.overdue_balance > 0 ? `vencido ${Fmt.money(c.overdue_balance)}` : '', c.credit_limit > 0 ? `límite ${Fmt.money(c.credit_limit)}` : ''].filter(Boolean).join(' · ');
    const drawCustomers = () => setHTML($('#pos-customer', root), options(customers.map((c) => [c.id, `${c.name}${debt(c) ? ` (${debt(c)})` : ''}`]), sale.customer_id, { empty: 'Cliente general (contado)' }));
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

    let shownTotal = null;
    const updateTotals = () => {
      const t = total();
      $('#t-sub', root).textContent = Fmt.money(subtotal());
      const units = sale.lines.reduce((n, l) => n + l.qty, 0);
      $('#t-items', root).textContent = units ? `· ${units} ${units === 1 ? 'artículo' : 'artículos'}` : '';
      $('#t-total', root).textContent = Fmt.money(t);
      // El total "late" un instante al cambiar (el vendedor ve que se sumó).
      if (shownTotal !== null && shownTotal !== t) flashNumber($('#t-total', root));
      shownTotal = t;
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

    // Carrito: cada línea es una fila propia. Agregar, cambiar la cantidad o quitar toca solo esa fila
    // (todo se calcula aquí, sin pedir nada al sistema hasta cobrar).
    const tbody = $('#pos-lines tbody', root);
    const lineRow = (l) => el(html`<table><tbody><tr>
      <td class="w-thumb">${productThumb(l.p, 36)}</td>
      <td><b>${l.p.name}</b><div class="muted small">${[l.p.brand, l.p.color, l.p.size, l.p.sku].filter(Boolean).join(' · ')}</div></td>
      <td class="text-right" data-avail>${avail(l.p)}</td>
      <td><div class="qty"><button data-q="-1" aria-label="Menos">−</button><input data-k="qty" type="number" min="1" step="1" value="${l.qty}"><button data-q="1" aria-label="Más">+</button></div></td>
      <td>${admin ? html`<input class="num ${l.unit_price > 0 ? '' : 'invalid'}" data-k="unit_price" type="number" min="0" step="0.01" value="${l.unit_price}">` : html`<span data-price></span>`}</td>
      <td class="text-right sub"><b></b></td>
      <td><button class="icon-btn danger" data-del title="Quitar">${icon('trash')}</button></td>
    </tr></tbody></table>`).querySelector('tr');
    // Lo que cambia de una línea: cantidad, disponible (en rojo si no alcanza), precio e importe.
    const paintLine = (l) => {
      const tr = l.tr;
      const q = $('[data-k=qty]', tr);
      if (document.activeElement !== q) q.value = l.qty;
      $('[data-avail]', tr).classList.toggle('text-danger', l.qty > avail(l.p));
      const price = $('[data-k=unit_price]', tr);
      if (price) { if (document.activeElement !== price) price.value = l.unit_price; price.classList.toggle('invalid', !(l.unit_price > 0)); }
      const shown = $('[data-price]', tr);
      if (shown) setHTML(shown, l.unit_price > 0 ? Fmt.money(l.unit_price) : html`<b class="text-danger">Sin precio</b>`);
      $('.sub b', tr).textContent = Fmt.money(l.qty * l.unit_price);
    };
    const syncEmpty = () => {
      $('#pos-lines .table', root).classList.toggle('hidden', !sale.lines.length);
      $('#pos-lines .pos-empty', root).classList.toggle('hidden', !!sale.lines.length);
      updateTotals();
    };
    const addLine = (l, { animate = true } = {}) => {
      l.tr = lineRow(l);
      if (animate && !reduceMotion()) l.tr.classList.add('line-in');
      paintLine(l);
      const tr = l.tr;
      $('[data-k=qty]', tr).oninput = (e) => { l.qty = Math.max(1, parseInt(e.target.value, 10) || 1); paintLine(l); updateTotals(); };
      $('[data-k=qty]', tr).onchange = () => paintLine(l);
      $$('[data-q]', tr).forEach((b) => (b.onclick = () => { l.qty = Math.max(1, l.qty + Number(b.dataset.q)); paintLine(l); flashNumber($('.sub b', tr)); updateTotals(); }));
      const price = $('[data-k=unit_price]', tr);
      if (price) price.oninput = (e) => { l.unit_price = Number(e.target.value) || 0; paintLine(l); updateTotals(); };
      $('[data-del]', tr).onclick = () => removeLine(l);
      tbody.appendChild(tr);
      syncEmpty();
    };
    const removeLine = (l) => {
      const i = sale.lines.indexOf(l);
      if (i < 0) return;
      sale.lines.splice(i, 1);
      const tr = l.tr;
      if (reduceMotion()) tr.remove();
      else { tr.classList.add('line-out'); setTimeout(() => tr.remove(), 110); }
      syncEmpty();
    };
    const drawLines = () => { sale.lines.forEach(paintLine); syncEmpty(); };

    const picker = productPicker($('#pos-picker', root), (p) => {
      if (p.reserved && avail(p) <= 0) { toast(`"${productLabel(p)}" está apartado para otro cliente.`, 'error'); return; }
      if (p.stock <= 0 && settings.allow_negative_stock !== '1') { toast(`"${p.name}" está agotado.`, 'error'); return; }
      const ex = sale.lines.find((l) => l.p.id === p.id);
      if (ex) {
        ex.qty += 1;
        paintLine(ex);
        flashNumber($('.sub b', ex.tr));
        updateTotals();
      } else {
        const l = { p, qty: 1, unit_price: listPrice(p) };
        sale.lines.push(l);
        addLine(l);
      }
      if (!(listPrice(p) > 0)) toast(`"${p.name}" no tiene precio ${sale.sale_type === 'mayor' ? 'por mayor' : 'al detalle'}.${admin ? ' Escriba el precio.' : ''}`, 'error');
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
      customers = await api('customers.options');
      sale.customer_id = String(id);
      drawCustomers();
    });
    if (canDiscount) {
      $('#pos-disc', root).oninput = updateTotals;
      $('#pos-disc-mode', root).onchange = (e) => { sale.discountMode = e.target.value; updateTotals(); };
    }
    $('#add-pay', root).onclick = () => { sale.payments.push({ method: 'tarjeta', amount: '' }); drawPayments(); };
    // Carritos en espera (1.9): el actual se guarda y se atiende a otro; se retoma con un clic.
    const cartData = () => ({
      id: heldId || undefined, customer_id: sale.customer_id || null, sale_type: sale.sale_type, payment_type: sale.payment_type,
      discount: canDiscount ? Number($('#pos-disc', root).value) || 0 : 0, discount_mode: sale.discountMode, note: $('#pos-note', root).value,
      lines: sale.lines.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price: l.unit_price })),
    });
    // Guarda el carrito actual si tiene algo (devuelve true si se pudo o no hacía falta).
    const holdCurrent = async ({ quiet = false } = {}) => {
      if (!sale.lines.length) return true;
      try {
        heldId = await api('sales.hold', cartData());
        if (!quiet) toast('Venta en espera. Retómela desde la barra de carritos.');
        return true;
      } catch { return false; }
    };
    const drawCarts = () => {
      const bar = $('#pos-carts', root);
      if (!bar) return;
      const others = heldList.filter((h) => h.id !== heldId);
      setHTML(bar, html`
        <span class="pc-label">${icon('cart')} Carritos</span>
        <button type="button" class="cart-chip on" title="El carrito que está atendiendo">${held ? held.label : 'Actual'}</button>
        ${others.map((h) => html`<button type="button" class="cart-chip" data-held="${h.id}" title="Dejada por ${h.user_name || '—'} el ${Fmt.datetime(h.updated_at)}">${h.label} <small>${h.items} art. · ${Fmt.money(h.total)}</small></button>`)}
        <button type="button" class="cart-chip add" id="pos-new-cart" title="Deja este carrito en espera y empieza otro">${icon('plus')} Nueva</button>`);
      $$('[data-held]', bar).forEach((b) => (b.onclick = async () => {
        if (await holdCurrent({ quiet: true })) App.go('pos', { held: Number(b.dataset.held) });
      }));
      $('#pos-new-cart', bar).onclick = async () => { if (await holdCurrent()) App.go('pos'); };
    };
    drawCarts();
    const holdBtn = $('#pos-hold', root);
    if (holdBtn) holdBtn.onclick = async () => {
      if (!sale.lines.length) return toast('El carrito está vacío.', 'error');
      if (await holdCurrent()) App.go('pos');
    };
    $('#pos-clear', root).onclick = async () => {
      if (heldId) {
        if (!(await confirmDialog('Se borra esta venta en espera y su carrito. Las gorras no se tocan.', { title: 'Descartar la venta en espera', okLabel: 'Descartar', danger: true }))) return;
        await api('sales.heldDelete', { id: heldId }).catch(() => {});
      }
      App.go('pos');
    };

    const charge = async () => {
      if (!sale.lines.length) return toast('Agregue productos a la venta.', 'error');
      const t = total();
      let payments = sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));
      if (sale.payment_type === 'contado' && payments.reduce((s, p) => s + p.amount, 0) === 0) payments = [{ method: payments[0].method, amount: t }];
      const data = {
        sale_type: sale.sale_type,
        payment_type: sale.payment_type,
        customer_id: sale.customer_id ? Number(sale.customer_id) : null,
        reservation_id: reservation ? reservation.id : undefined,
        held_id: heldId || undefined,
        due_date: sale.payment_type === 'credito' ? $('#pos-due', root).value : undefined,
        discount: discountAmount(),
        note: $('#pos-note', root).value,
        items: sale.lines.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price: l.unit_price })),
        payments,
      };
      const btn = $('#pos-charge', root);
      btn.disabled = true;
      try {
        // Crédito a quien tiene deuda vencida o pasa su límite: el administrador confirma (auditoría 2.4).
        const id = await apiConfirm('sales.create', data, { code: 'CREDIT_CONFIRM', extra: { authorize_credit: true }, title: 'Autorizar crédito', okLabel: 'Autorizar venta' });
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
      // Atajos de la venta: F2 buscar, F4 poner en espera, F9 cobrar.
      if (document.querySelector('.modal-back')) return;
      if (e.key === 'F9') { e.preventDefault(); charge(); }
      else if (e.key === 'F2') { e.preventDefault(); picker.focus(); }
      else if (e.key === 'F4' && holdBtn) { e.preventDefault(); holdBtn.click(); }
    };
    document.addEventListener('keydown', keyHandler);

    if (reservation) {
      $('#pos-customer', root).disabled = true;
      $('#pos-new-customer', root).disabled = true;
      // Las gorras del apartado, pedidas todas a la vez.
      const ps = await Promise.all(reservation.items.map((it) => api('products.get', { id: it.product_id })));
      reservation.items.forEach((it, i) => {
        const l = { p: ps[i], qty: it.qty, unit_price: listPrice(ps[i]) };
        sale.lines.push(l);
        addLine(l, { animate: false });
      });
    }
    // Retomar una venta en espera: su cliente, tipo, descuento, nota y líneas (con la existencia de hoy).
    if (held) {
      sale.customer_id = held.customer_id ? String(held.customer_id) : '';
      drawCustomers();
      sale.sale_type = held.sale_type;
      $$('#pos-type [data-v]', root).forEach((x) => x.classList.toggle('active', x.dataset.v === held.sale_type));
      if (held.payment_type === 'credito') $('#pos-pay-type [data-v=credito]', root).click();
      if (canDiscount && held.discount) {
        sale.discountMode = held.discount_mode;
        $('#pos-disc-mode', root).value = held.discount_mode;
        $('#pos-disc', root).value = held.discount;
      }
      $('#pos-note', root).value = held.note || '';
      held.lines.forEach((hl) => { const l = { p: hl.p, qty: hl.qty, unit_price: hl.unit_price }; sale.lines.push(l); addLine(l, { animate: false }); });
      if (held.missing) toast(`${held.missing} ${held.missing === 1 ? 'gorra ya no existe y se quitó' : 'gorras ya no existen y se quitaron'} del carrito.`, 'error');
    } else if (params.held) {
      toast('Esa venta en espera ya no existe (la cobró o la descartó otra persona).', 'error');
    }
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
    $('#sl-export', tb).onclick = () => exportExcel('ventas', cols, render());
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
  const m = modal({
    title: `Venta ${Fmt.saleNo(s.id)}`,
    width: 900,
    body: html`
      <div class="kv cols-4">
        <div><span>Fecha</span><b>${Fmt.datetime(s.created_at)}</b></div>
        <div><span>Cliente</span><b>${s.customer_name || 'General'}</b></div>
        ${s.reservation_id ? html`<div><span>Apartado</span><b>${Fmt.resNo(s.reservation_id)}</b></div>` : ''}
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
          voidPayColumn(() => s.payment_type === 'credito' && s.status !== 'anulada'),
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
  bindVoidPayments(m.body, s.payments, {
    method: 'sales.voidPayment', what: () => `pago de ${Fmt.saleNo(s.id)}`, cashNote: 'el efectivo sale de la caja de esta PC',
    onDone: () => { m.close(); onChange && onChange(); saleDetail(id, onChange); },
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

async function customerForm(c, onSaved) {
  c = c || {};
  const crm = App.crm();
  // Etiquetas ya usadas, para sugerirlas (1.6).
  const all = crm ? await api('customers.options', { includeInactive: true }).catch(() => []) : [];
  const tags = [...new Set(all.flatMap((x) => x.tags || []))].sort((a, b) => a.localeCompare(b, 'es'));
  modal({
    title: c.id ? 'Editar cliente' : 'Nuevo cliente',
    width: 600,
    body: html`
      <div class="grid-2">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${c.name || ''}"></label>
        <label class="field"><span>Teléfono</span><input name="phone" value="${c.phone || ''}"></label>
        <label class="field"><span>Cédula / RNC</span><input name="document" value="${c.document || ''}"></label>
        <label class="field"><span>Correo</span><input name="email" type="email" value="${c.email || ''}"></label>
        <label class="field"><span>Dirección</span><input name="address" value="${c.address || ''}"></label>
        ${crm ? html`<label class="field"><span>Cumpleaños (día/mes)</span><input name="birthday" value="${Fmt.bday(c.birthday)}" placeholder="Ej. 15/08"></label>
        <label class="field"><span>Etiquetas (separadas por coma)</span><input name="tags" id="cf-tags" value="${(c.tags || []).join(', ')}" list="dl-ctags" placeholder="Ej. mayorista, fitted, Santiago"></label>
        <datalist id="dl-ctags">${tags.map((t) => html`<option value="${[...(c.tags || []), t].join(', ')}">`)}</datalist>` : ''}
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${c.notes || ''}</textarea></label>
        ${App.isAdmin() ? html`<label class="field"><span>Límite de crédito (0 = sin límite)</span><input name="credit_limit" type="number" min="0" step="0.01" value="${c.credit_limit || 0}"></label>
          ${crm ? html`<label class="field"><span>Cliente VIP</span><select name="vip_mode">${options([['auto', 'Automático (según lo que compra)'], ['si', 'Sí, siempre'], ['no', 'No']], c.vip_mode || 'auto')}</select></label>` : ''}` : ''}
        ${c.id && App.isAdmin() ? html`<label class="check"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Activo</label>` : ''}
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

// Segmentos del CRM (1.6), en el orden en que se muestran.
const SEGMENTS = [['', 'Todos'], ['vip', 'VIP'], ['frecuente', 'Frecuentes'], ['nuevo', 'Nuevos'], ['ocasional', 'Ocasionales'], ['en_riesgo', 'En riesgo'], ['perdido', 'Perdidos'], ['sin_compras', 'Sin compras']];
const SEGMENT_HELP = {
  nuevo: 'Empezó a comprar en los últimos 30 días',
  frecuente: '3 compras o más en los últimos 12 meses',
  ocasional: 'Compra de vez en cuando',
  en_riesgo: 'Lleva más del doble de lo normal sin comprar (al menos 45 días)',
  perdido: 'Lleva más del triple de lo normal sin comprar (al menos 90 días)',
  sin_compras: 'Registrado, todavía sin compras',
};
const vipStar = (c) => (c.vip ? html`<span class="vip" title="Cliente VIP">${icon('star')}</span>` : '');
const tagChips = (c) => (c.tags || []).map((t) => html`<span class="tag-chip">${t}</span>`);
const segBadge = (c) => html`<span title="${SEGMENT_HELP[c.segment] || ''}">${badge(c.segment)}</span>`;

async function copyPhones(list) {
  const phones = [...new Set(list.map((c) => c.phone).filter(Boolean))];
  if (!phones.length) return toast('Ninguno de estos clientes tiene teléfono.', 'error');
  try {
    await navigator.clipboard.writeText(phones.join('\n'));
    toast(`${phones.length} ${phones.length === 1 ? 'teléfono copiado' : 'teléfonos copiados'}.`);
  } catch {
    toast('No se pudo copiar. Use Exportar.', 'error');
  }
}

function birthdaysDialog() {
  api('customers.birthdays', { days: 30 }).then((rows) => modal({
    title: 'Cumpleaños de los próximos 30 días',
    width: 640,
    body: html`${table({
      columns: [
        { key: 'name', label: 'Cliente', render: (c) => html`${vipStar(c)} <b>${c.name}</b>` },
        { key: 'phone', label: 'Teléfono' },
        { key: 'birthday', label: 'Cumpleaños', render: (c) => Fmt.bday(c.birthday) },
        { key: 'birthday_in', label: 'Cuándo', render: (c) => html`<span class="badge ${c.birthday_in === 0 ? 'ok' : 'info'}">${Fmt.bdayIn(c.birthday_in)}</span>` },
        { key: 'segment', label: 'Segmento', render: segBadge },
      ],
      rows, empty: 'Nadie cumple años en los próximos 30 días. Agregue el cumpleaños en la ficha de cada cliente.',
    })}`,
    actions: [{ label: 'Cerrar' }, { label: 'Copiar teléfonos', onClick: async () => { await copyPhones(rows); return false; } }],
  }));
}

App.register({
  id: 'customers', title: 'Clientes', icon: 'users', group: 'Finanzas',
  async render(page, params = {}) {
    const crm = App.crm();
    const f = { search: '', segment: crm ? params.segment || '' : '', tag: '' };
    let includeInactive = false;
    const tb = toolbar(page, {
      left: html`<div class="search">${icon('search')}<input id="c-search" placeholder="${crm ? 'Buscar por nombre, teléfono, cédula o etiqueta…' : 'Buscar por nombre, teléfono o cédula…'}"></div>
        ${crm ? html`<select id="c-tag"></select>` : ''}
        ${App.isAdmin() ? html`<label class="check"><input type="checkbox" id="c-inactive"> Ver desactivados</label>` : ''}`,
      right: html`${crm ? html`<button class="btn" id="c-bdays">${icon('gift')} Cumpleaños</button><button class="btn" id="c-phones">${icon('copy')} Copiar teléfonos</button>` : ''}<button class="btn" id="c-export">${icon('download')} Exportar</button><button class="btn primary" id="c-new">${icon('plus')} Nuevo cliente</button>`,
    });
    const segBox = el(html`<div class="seg seg-wrap" id="c-seg"></div>`);
    const help = el(html`<p class="muted small" id="c-seg-help"></p>`);
    if (crm) { tb.after(segBox); segBox.after(help); }
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let all = [];
    let rows = [];
    // Sin CRM (DT-50): solo contacto y crédito.
    const basicCols = [
      { key: 'name', label: 'Cliente', cls: 'col-product', render: (r) => html`<b>${r.name}</b>${r.address ? html`<div class="muted small">${r.address}</div>` : ''}`, csv: (r) => r.name },
      { key: 'phone', label: 'Teléfono', render: (r) => r.phone || html`<span class="muted">—</span>`, csv: (r) => r.phone || '' },
      { key: 'document', label: 'Cédula/RNC', render: (r) => r.document || html`<span class="muted">—</span>`, csv: (r) => r.document || '' },
      { key: 'balance', label: 'Debe', money: true, total: true, render: (r) => (r.balance > 0 ? html`<b class="${r.overdue ? 'text-danger' : ''}">${Fmt.money(r.balance)}</b>` : html`<span class="muted">—</span>`), csv: (r) => r.balance },
      { key: 'credit_limit', label: 'Límite de crédito', money: true, render: (r) => (r.credit_limit > 0 ? Fmt.money(r.credit_limit) : html`<span class="muted">Sin límite</span>`), csv: (r) => r.credit_limit },
    ];
    const crmCols = [
      { key: 'name', label: 'Cliente', cls: 'col-product', render: (r) => html`${vipStar(r)} <b>${r.name}</b>${r.phone ? html`<div class="muted small">${r.phone}</div>` : ''}${(r.tags || []).length ? html`<div>${tagChips(r)}</div>` : ''}`, csv: (r) => r.name },
      { key: 'segment', label: 'Segmento', render: segBadge, csv: (r) => STATUS_LABELS[r.segment] },
      { key: 'purchases', label: 'Compras', num: true, total: true },
      { key: 'spent', label: 'Gasto total', money: true, total: true },
      { key: 'avg_ticket', label: 'Ticket prom.', money: true },
      { key: 'last_purchase', label: 'Última compra', render: (r) => (r.last_purchase ? html`${Fmt.date(r.last_purchase)}<div class="muted small">${Fmt.ago(r.days_since)}</div>` : html`<span class="muted">—</span>`), csv: (r) => r.last_purchase || '' },
      { key: 'balance', label: 'Debe', money: true, total: true, render: (r) => (r.balance > 0 ? html`<b class="${r.overdue ? 'text-danger' : ''}">${Fmt.money(r.balance)}</b>` : html`<span class="muted">—</span>`), csv: (r) => r.balance },
      { key: 'birthday', label: 'Cumpleaños', render: (r) => (r.birthday ? html`${Fmt.bday(r.birthday)}${r.birthday_in <= 7 ? html` <span class="badge info">${Fmt.bdayIn(r.birthday_in)}</span>` : ''}` : ''), csv: (r) => Fmt.bday(r.birthday) },
    ];
    const cols = crm ? crmCols : basicCols;
    // Solo en el Excel: los datos de contacto y de crédito completos.
    const csvCols = !crm ? [...basicCols, { key: 'email', label: 'Correo' }, { key: 'address', label: 'Dirección' }] : [...cols,
      { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo' }, { key: 'document', label: 'Cédula/RNC' },
      { key: 'tags', label: 'Etiquetas', csv: (r) => (r.tags || []).join(', ') }, { key: 'vip', label: 'VIP', csv: (r) => (r.vip ? 'sí' : 'no') },
      { key: 'spent_12m', label: 'Gasto 12 meses', money: true }, { key: 'interval_days', label: 'Compra cada (días)' },
      { key: 'credit_limit', label: 'Límite de crédito', money: true }];
    const draw = () => {
      if (crm) {
        const count = (k) => (k === '' ? all.length : all.filter((c) => (k === 'vip' ? c.vip : c.segment === k)).length);
        setHTML(segBox, SEGMENTS.map(([k, l]) => html`<button data-s="${k}" class="${k === f.segment ? 'active' : ''}">${l} <small>${count(k)}</small></button>`));
        $$('[data-s]', segBox).forEach((b) => (b.onclick = () => { f.segment = b.dataset.s; draw(); }));
        help.textContent = f.segment === 'vip' ? `VIP: compró ${Fmt.money(Number(App.settings.vip_min_spend) || 0)} o más en los últimos 12 meses, o lo marcó el administrador.` : SEGMENT_HELP[f.segment] || '';
      }
      const q = f.search.trim().toLowerCase();
      rows = all.filter((c) => (!f.segment || (f.segment === 'vip' ? c.vip : c.segment === f.segment))
        && (!f.tag || (c.tags || []).includes(f.tag))
        && (!q || [c.name, c.phone, c.document, ...(crm ? c.tags || [] : [])].filter(Boolean).join(' ').toLowerCase().includes(q)));
      setHTML(box, table({ columns: cols, rows, clickable: true, empty: 'No hay clientes con este filtro.', rowClass: (r) => (r.active ? '' : 'inactive') }));
      onRowClick(box, rows, (r) => customerDetail(r.id, load));
    };
    const load = async () => {
      all = await api('customers.list', { includeInactive });
      if (crm) {
        const tags = [...new Set(all.flatMap((c) => c.tags || []))].sort((a, b) => a.localeCompare(b, 'es'));
        setHTML($('#c-tag', tb), options(tags, f.tag, { empty: 'Todas las etiquetas' }));
      }
      draw();
    };
    $('#c-search', tb).oninput = debounce((e) => { f.search = e.target.value; draw(); });
    if (crm) {
      $('#c-tag', tb).onchange = (e) => { f.tag = e.target.value; draw(); };
      $('#c-bdays', tb).onclick = birthdaysDialog;
      $('#c-phones', tb).onclick = () => copyPhones(rows);
    }
    if ($('#c-inactive', tb)) $('#c-inactive', tb).onchange = (e) => { includeInactive = e.target.checked; load(); };
    $('#c-new', tb).onclick = () => customerForm(null, load);
    $('#c-export', tb).onclick = () => exportExcel('clientes', csvCols, rows);
    await load();
  },
});

async function customerDetail(id, onChange) {
  const c = await api('customers.get', { id });
  const canPay = App.isAdmin() || App.settings.seller_can_receive_payments === '1';
  const actions = [{ label: 'Cerrar' }, { label: 'Editar', onClick: () => customerForm(c, onChange) }];
  if (App.isAdmin()) {
    actions.splice(1, 0, {
      label: 'Saldo inicial',
      onClick: () => openingDialog({
        title: `Saldo inicial de ${c.name}`, who: 'Lo que este cliente ya debía antes de usar el sistema',
        onSubmit: async (f) => { await api('customers.opening', { customer_id: id, ...f }); onChange && onChange(); },
      }),
    });
  }
  if (c.balance > 0 && canPay) {
    actions.push({
      label: 'Registrar abono', primary: true,
      onClick: () => paymentDialog({
        title: `Abono de ${c.name}`, maxAmount: c.balance, info: 'El abono se aplicará a las facturas pendientes más antiguas.',
        onSubmit: async (f) => { await api('sales.pay', { customer_id: id, ...f }); toast('Abono registrado.'); App.refreshCashBadge(); onChange && onChange(); },
      }),
    });
  }
  const crm = App.crm();
  const fav = (title, list) => html`<div><h5>${title}</h5>${list.length ? html`<ol>${list.map((x) => html`<li>${x.name} <small>· ${x.units}</small></li>`)}</ol>` : html`<small>Sin datos</small>`}</div>`;
  const m = modal({
    title: c.name,
    width: 960,
    body: html`
      ${crm ? html`<div class="crm-head">
        ${c.vip ? html`<span class="badge warn has-icon">${icon('star')} VIP</span>` : ''}
        ${segBadge(c)}
        ${tagChips(c)}
        ${c.birthday ? html`<span class="badge info has-icon">${icon('gift')} ${Fmt.bday(c.birthday)}${c.birthday_in <= 30 ? ` · ${Fmt.bdayIn(c.birthday_in)}` : ''}</span>` : ''}
        ${c.active ? '' : badge('anulada', 'Desactivado')}
      </div>` : c.active ? '' : html`<div class="crm-head">${badge('anulada', 'Desactivado')}</div>`}
      <div class="kv cols-4">
        <div><span>Teléfono</span><b>${c.phone || '—'}</b></div>
        <div><span>Cédula/RNC</span><b>${c.document || '—'}</b></div>
        <div><span>Correo</span><b>${c.email || '—'}</b></div>
        <div><span>Dirección</span><b>${c.address || '—'}</b></div>
        ${crm ? html`<div><span>Compras</span><b>${Fmt.num(c.purchases)}</b></div>
        <div><span>Gasto total</span><b>${Fmt.money(c.spent)}</b></div>
        <div><span>Últimos 12 meses</span><b>${Fmt.money(c.spent_12m)}</b></div>
        <div><span>Ticket promedio</span><b>${Fmt.money(c.avg_ticket)}</b></div>
        <div><span>Primera compra</span><b>${c.first_purchase ? Fmt.date(c.first_purchase) : '—'}</b></div>
        <div><span>Última compra</span><b>${c.last_purchase ? `${Fmt.date(c.last_purchase)} (${Fmt.ago(c.days_since)})` : '—'}</b></div>
        <div><span>Compra cada</span><b>${c.interval_days ? `${c.interval_days} días` : '—'}</b></div>` : ''}
        <div><span>Balance pendiente</span><b class="${c.balance > 0 ? 'text-danger' : ''}">${Fmt.money(c.balance)}</b></div>
        <div><span>Vencido</span><b class="${c.overdue_balance > 0 ? 'text-danger' : ''}">${Fmt.money(c.overdue_balance)}</b></div>
        <div><span>Límite de crédito</span><b>${c.credit_limit > 0 ? Fmt.money(c.credit_limit) : 'Sin límite'}</b></div>
        <div><span>Vendido a crédito</span><b>${Fmt.money(c.credit_sold)}</b></div>
        <div><span>Pagado (crédito)</span><b>${Fmt.money(c.credit_paid)}</b></div>
      </div>
      ${c.notes ? html`<p class="muted">${c.notes}</p>` : ''}
      ${crm ? html`<h4 class="section-title">Lo que más compra <small class="muted">— unidades</small></h4>
      <div class="fav-grid">${fav('Categorías', c.favorites.categories)}${fav('Marcas', c.favorites.brands)}${fav('Tallas', c.favorites.sizes)}${fav('Gorras', c.favorites.products)}</div>` : ''}
      ${c.reservations.length ? html`<h4 class="section-title">${icon('bookmark')} Apartados activos</h4>
        <ul class="notes-log">${c.reservations.map((r) => html`<li><small>${Fmt.resNo(r.id)} · vence ${Fmt.date(r.expires_on)}</small>${r.summary}</li>`)}</ul>` : ''}
      ${crm ? html`<h4 class="section-title">Notas de seguimiento</h4>
      <div class="note-add"><textarea id="cd-note" rows="2" placeholder="Ej. Le escribí por WhatsApp; viene el sábado por la NY roja"></textarea><button class="btn" id="cd-note-add">${icon('plus')} Agregar nota</button></div>
      ${c.notes_log.length ? html`<ul class="notes-log">${c.notes_log.map((n) => html`<li><small>${Fmt.datetime(n.created_at)} · ${n.user_name || ''}</small>${n.text}</li>`)}</ul>` : html`<p class="muted small">Todavía no hay notas.</p>`}` : ''}
      <h4 class="section-title">Compras del cliente</h4>
      ${table({
        columns: [
          { key: 'id', label: 'No.', render: (r) => Fmt.saleNo(r.id) },
          { key: 'date', label: 'Fecha', date: true },
          { key: 'payment_type', label: 'Pago', render: (r) => (r.opening ? html`<span class="chip">Saldo inicial</span>` : r.payment_type === 'credito' ? 'Crédito' : 'Contado') },
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
          voidPayColumn((r) => r.sale_payment_type === 'credito' && r.sale_status !== 'anulada'),
        ],
        rows: c.payments, empty: 'Sin pagos.',
      })}`,
    actions,
  });
  if (crm) $('#cd-note-add', m.body).onclick = async () => {
    const text = $('#cd-note', m.body).value.trim();
    if (!text) return toast('Escriba la nota.', 'error');
    await api('customers.addNote', { customer_id: id, text });
    toast('Nota agregada.');
    m.close();
    customerDetail(id, onChange);
  };
  bindVoidPayments(m.body, c.payments, {
    method: 'sales.voidPayment', what: (r) => `abono de ${c.name} (${Fmt.saleNo(r.sale_id)})`, cashNote: 'el efectivo sale de la caja de esta PC',
    onDone: () => { m.close(); onChange && onChange(); customerDetail(id, onChange); },
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
      { key: 'id', label: 'Venta', render: (r) => html`${Fmt.saleNo(r.id)}${r.opening ? html` <span class="chip">Saldo inicial</span>` : ''}`, csv: (r) => Fmt.saleNo(r.id) },
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
      onRowButton(box, '[data-pay]', rows, (r) => paymentDialog({
        title: view === 'cliente' ? `Abono de ${r.name}` : `Abono a ${Fmt.saleNo(r.id)}`,
        maxAmount: r.balance,
        info: view === 'cliente' ? 'Se aplicará a las facturas más antiguas.' : html`Cliente: <b>${r.customer_name}</b>`,
        onSubmit: async (f) => {
          await api('sales.pay', view === 'cliente' ? { customer_id: r.id, ...f } : { sale_id: r.id, ...f });
          toast('Abono registrado.');
          App.refreshCashBadge();
          load();
        },
      }));
      $('#ar-export', tb).onclick = () => exportExcel('cuentas-por-cobrar', cols, rows);
    };
    $$('#ar-view [data-v]', tb).forEach((b) => (b.onclick = () => {
      view = b.dataset.v;
      $$('#ar-view [data-v]', tb).forEach((x) => x.classList.toggle('active', x === b));
      load();
    }));
    await load();
  },
});
