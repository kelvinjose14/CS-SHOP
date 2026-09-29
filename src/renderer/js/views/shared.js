'use strict';
/* Componentes compartidos: buscador de productos, cuadro de pago, etc. */

// Existencia en el buscador: con apartados (1.5) se muestra lo disponible y lo apartado.
function stockNote(p) {
  const avail = p.available ?? p.stock;
  return html`<small class="${avail <= 0 ? 'text-danger' : avail <= p.min_stock ? 'text-warn' : ''}">${p.reserved ? `Disp.: ${avail} · ${p.reserved} apart.` : `Exist.: ${p.stock}`}</small>`;
}

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
  // Un producto con varios colores o tallas se elige en dos pasos: el producto y luego su variante (1.7).
  const pick = async (p) => {
    close();
    input.value = '';
    const v = p.group ? await variantChooser(p, { priceKey }) : p;
    if (v) onPick(v);
    input.focus();
  };
  const price = (p) => (typeof priceKey === 'function' ? priceKey(p) : Fmt.money(p[priceKey]));
  const draw = () => {
    if (!items.length) { setHTML(results, html`<div class="picker-empty">Sin resultados</div>`); return; }
    setHTML(results, items.map((p, i) => (p.group ? html`
      <div class="picker-item ${i === active ? 'active' : ''}" data-i="${i}">
        ${productThumb(p, 34)}
        <div class="pi-main"><b>${p.name}</b><small>${[p.brand, `${p.variants.length} variantes`, p.colors.join(', ')].filter(Boolean).join(' · ')}</small></div>
        <div class="pi-side">${price(p.variants[0])}${showStock ? html`<small class="${p.available <= 0 ? 'text-danger' : ''}">Disp.: ${p.available}</small>` : ''}</div>
      </div>` : html`
      <div class="picker-item ${i === active ? 'active' : ''}" data-i="${i}">
        ${productThumb(p, 34)}
        <div class="pi-main"><b>${p.name}</b><small>${[p.brand, p.color, p.size, p.sku].filter(Boolean).join(' · ')}</small></div>
        <div class="pi-side">${price(p)}${showStock ? stockNote(p) : ''}</div>
      </div>`)));
    $$('.picker-item', results).forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); pick(items[Number(d.dataset.i)]); }));
  };
  // Agrupa por producto: si de un producto salen varias variantes, se muestra una sola fila.
  const group = (list) => {
    const byModel = new Map();
    for (const p of list) {
      const k = p.model_id || -p.id;
      if (!byModel.has(k)) byModel.set(k, []);
      byModel.get(k).push(p);
    }
    return [...byModel.values()].map((vs) => (vs.length === 1 ? vs[0] : {
      group: true, model_id: vs[0].model_id, name: vs[0].name, brand: vs[0].brand, photo: (vs.find((v) => v.photo) || {}).photo,
      variants: vs, colors: [...new Set(vs.map((v) => v.color).filter(Boolean))], available: vs.reduce((s, v) => s + (v.available ?? v.stock), 0),
    }));
  };
  // Al escribir rápido, solo cuenta la última búsqueda (una respuesta vieja no pisa a la nueva).
  let seq = 0;
  const search = debounce(async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q) return close();
    const found = group(await api('products.list', { search: q })).slice(0, 12);
    if (mine !== seq || input.value.trim() !== q) return;
    items = found;
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
      ${withDate ? html`<label class="field"><span>Fecha</span><input name="date" type="date" value="${todayStr()}" max="${todayStr()}"></label>` : ''}
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
        <label class="field"><span>Fecha de la deuda</span><input type="date" name="date" value="${todayStr()}" max="${todayStr()}"></label>
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

// Elegir la variante de un producto: primero el color y después la talla, con lo disponible de cada una.
// Busca todas las variantes activas del producto (no solo las que coincidieron con lo escrito).
async function variantChooser(g, { priceKey = 'price_retail' } = {}) {
  const all = g.model_id ? await api('products.list', { model_id: g.model_id }) : g.variants;
  const vs = all.length ? all : g.variants;
  const colors = [...new Set(vs.map((v) => v.color || ''))];
  const sizesOf = (c) => vs.filter((v) => (v.color || '') === c).sort((a, b) => (a.size_sort ?? 999) - (b.size_sort ?? 999));
  const avail = (v) => v.available ?? v.stock;
  const firstIn = (c) => sizesOf(c).find((v) => avail(v) > 0) || sizesOf(c)[0];
  const startColor = (g.variants.find((v) => avail(v) > 0) || g.variants[0]).color || '';
  const sum = (c) => sizesOf(c).reduce((s, v) => s + Math.max(0, avail(v)), 0);
  const body = el(html`
    <div class="grid-2">
      ${colors.length > 1 || colors[0] ? html`<label class="field"><span>Color</span><select id="vc-color">${colors.map((c) => html`<option value="${c}" ${c === startColor ? 'selected' : ''}>${c || 'Sin color'} (${sum(c)})</option>`)}</select></label>` : ''}
      <label class="field"><span>Talla</span><select id="vc-size"></select></label>
      <div class="span-2 vc-info"></div>
    </div>`);
  const colorSel = $('#vc-color', body);
  const sizeSel = $('#vc-size', body);
  const current = () => vs.find((v) => String(v.id) === sizeSel.value);
  const drawSizes = (keep) => {
    const list = sizesOf(colorSel ? colorSel.value : colors[0]);
    const chosen = keep && list.find((v) => (v.size || '') === keep) ? list.find((v) => (v.size || '') === keep) : firstIn(colorSel ? colorSel.value : colors[0]);
    setHTML(sizeSel, list.map((v) => html`<option value="${v.id}" ${chosen && v.id === chosen.id ? 'selected' : ''}>${v.size || 'Única'}${avail(v) <= 0 ? ' — agotada' : ` (${avail(v)})`}</option>`));
    drawInfo();
  };
  const drawInfo = () => {
    const v = current();
    if (!v) return;
    setHTML($('.vc-info', body), html`<div class="info-box vc-box">
      <div><span class="muted small">Disponible</span><b class="big ${avail(v) <= 0 ? 'text-danger' : ''}" id="vc-available">${avail(v)}</b>${v.reserved ? html`<small class="text-info"> · ${v.reserved} apartadas</small>` : ''}</div>
      <div><span class="muted small">Precio</span><b>${typeof priceKey === 'function' ? priceKey(v) : Fmt.money(v[priceKey])}</b></div>
      <div><span class="muted small">SKU</span><b>${v.sku}</b></div>
    </div>`);
  };
  if (colorSel) colorSel.onchange = () => drawSizes(current() && current().size);
  sizeSel.onchange = drawInfo;
  drawSizes();
  // Con el teclado: flechas para cambiar color y talla, Enter para agregar (como en el buscador).
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const add = body.closest('.modal') && $('.modal-foot .btn.primary', body.closest('.modal'));
    if (add) add.click();
  });
  return new Promise((resolve) => {
    let done = false;
    modal({
      title: g.name,
      width: 480,
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Cancelar' },
        { label: 'Agregar', primary: true, onClick: () => { done = true; resolve(current()); } },
      ],
    });
    (colorSel || sizeSel).focus();
  });
}

/* ---------- Catálogos de productos (1.7) ---------- */
const plainText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Selector con búsqueda (marca, modelo, categoría): se escribe para filtrar y al final está "+ Crear nueva …".
// items: [{ id, name }]. Devuelve { value } con la clave elegida (null si se deja vacío).
function comboSelect(root, { items, value = null, placeholder = 'Buscar o seleccionar…', createLabel, onCreate, id }) {
  const box = el(html`
    <div class="combo">
      <div class="combo-field"><input ${id ? html`id="${id}"` : ''} placeholder="${placeholder}" autocomplete="off"><span class="combo-arrow">▾</span></div>
      <div class="picker-results combo-list hidden"></div>
    </div>`);
  root.appendChild(box);
  const input = $('input', box);
  const list = $('.combo-list', box);
  let selected = items.find((i) => i.id === value) || null;
  let shown = [];
  let active = 0;
  const nameOf = () => (selected ? selected.name : '');
  input.value = nameOf();
  const close = () => list.classList.add('hidden');
  const choose = (item) => { selected = item; input.value = nameOf(); close(); box.dispatchEvent(new Event('change', { bubbles: true })); };
  const draw = () => {
    const q = plainText(input.value);
    const all = q && q !== plainText(nameOf()) ? items.filter((i) => plainText(i.name).includes(q)) : items;
    const exact = items.some((i) => plainText(i.name) === q);
    shown = [...all.map((i) => ({ item: i })), ...(onCreate ? [{ create: q && !exact ? input.value.trim() : '' }] : [])];
    active = Math.min(active, shown.length - 1);
    setHTML(list, shown.map((s, i) => (s.item
      ? html`<div class="picker-item combo-item ${i === active ? 'active' : ''} ${selected && selected.id === s.item.id ? 'selected' : ''}" data-i="${i}">${s.item.name}</div>`
      : html`<div class="picker-item combo-item combo-create ${i === active ? 'active' : ''}" data-i="${i}">${icon('plus')} ${createLabel}${s.create ? html` <b>“${s.create}”</b>` : ''}</div>`)));
    list.classList.remove('hidden');
    $$('[data-i]', list).forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); pick(shown[Number(d.dataset.i)]); }));
  };
  const pick = async (s) => {
    if (!s) return;
    if (s.item) return choose(s.item);
    close();
    const made = await onCreate(s.create);
    if (!made) { input.value = nameOf(); return; }
    if (!items.some((i) => i.id === made.id)) items.push(made);
    items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    choose(made);
    toast(made.existed ? `"${made.name}" ya existía: quedó elegida.` : `"${made.name}" agregada.`);
  };
  input.addEventListener('focus', () => { active = 0; draw(); input.select(); });
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && !list.classList.contains('hidden')) {
      // Con la lista abierta, Esc solo la cierra: no cierra el formulario (se perdería lo escrito).
      e.stopPropagation();
      input.value = nameOf();
      close();
    }
  });
  // Al salir del campo: vacío quita la elección; un nombre escrito completo (sin importar mayúsculas ni
  // acentos) elige esa opción aunque no se haya pulsado en la lista.
  input.addEventListener('blur', () => setTimeout(() => {
    const q = plainText(input.value);
    const exact = items.find((i) => plainText(i.name) === q);
    if (!q) selected = null;
    else if (exact && exact !== selected) { selected = exact; box.dispatchEvent(new Event('change', { bubbles: true })); }
    input.value = nameOf();
    close();
  }, 150));
  $('.combo-arrow', box).onmousedown = (e) => { e.preventDefault(); input.focus(); };
  return { get value() { return selected ? selected.id : null; }, get name() { return nameOf(); }, input, el: box };
}

// Opciones que se marcan con un clic (tallas). Varias a la vez; las elegidas llevan ✓.
// items: [{ id, name }]. onAdd: agrega una opción nueva al catálogo y la deja marcada.
function chipPicker(root, { items, selected = [], addLabel, onAdd, onChange, locked = [] }) {
  const sel = new Set(selected);
  const box = el(html`<div class="chips"></div>`);
  root.appendChild(box);
  const draw = () => {
    setHTML(box, html`${items.map((i) => html`<button type="button" class="chip-opt ${sel.has(i.id) ? 'on' : ''}" data-id="${i.id}" aria-pressed="${sel.has(i.id)}" title="${locked.includes(i.id) ? 'Ya tiene existencia registrada: al quitarla se desactiva' : ''}">
        ${sel.has(i.id) ? html`<span class="chip-check">✓</span>` : ''}${i.name}</button>`)}
      ${onAdd ? html`<button type="button" class="chip-opt chip-add">${icon('plus')} ${addLabel}</button>` : ''}`);
    $$('[data-id]', box).forEach((b) => (b.onclick = () => {
      const id = Number(b.dataset.id);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      draw();
      onChange && onChange();
    }));
    const add = $('.chip-add', box);
    if (add) add.onclick = async () => {
      const made = await onAdd();
      if (!made) return;
      if (!items.some((i) => i.id === made.id)) items.push(made);
      sel.add(made.id);
      draw();
      onChange && onChange();
    };
  };
  draw();
  // Las elegidas, en el orden del catálogo.
  return { get value() { return items.filter((i) => sel.has(i.id)); }, el: box };
}
