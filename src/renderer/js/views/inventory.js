'use strict';
/* Inventario: productos, ajustes y movimientos. */

const MOVEMENT_TYPES = [
  ['', 'Todos los tipos'], ['inicial', 'Inventario inicial'], ['compra', 'Compra'], ['venta', 'Venta'], ['devolucion', 'Devolución'],
  ['ajuste', 'Ajuste manual'], ['entrada', 'Entrada'], ['salida', 'Salida'], ['anulacion_venta', 'Anulación de venta'], ['anulacion_compra', 'Anulación de compra'],
];

function productColumns() {
  const admin = App.isAdmin();
  return [
    { label: '', render: (p) => productThumb(p, 38), csv: false, cls: 'w-thumb' },
    { key: 'name', label: 'Producto', cls: 'col-product', render: (p) => html`<strong>${p.name}</strong><div class="muted small">${[p.brand, p.model].filter(Boolean).join(' · ')}</div>`, csv: (p) => p.name },
    { key: 'brand', label: 'Marca', hide: true },
    { key: 'model', label: 'Modelo', hide: true },
    { key: 'color', label: 'Color' },
    { key: 'size', label: 'Talla' },
    { key: 'sku', label: 'SKU', render: (p) => html`<code>${p.sku}</code>` , csv: (p) => p.sku },
    { key: 'barcode', label: 'Código de barras', hide: true },
    ...(admin ? [{ key: 'cost', label: 'Costo', money: true }] : []),
    { key: 'price_retail', label: 'Detalle', money: true },
    { key: 'price_wholesale', label: 'Por mayor', money: true },
    { key: 'stock', label: 'Existencia', num: true, total: true, render: (p) => html`<strong class="${p.status === 'agotado' ? 'text-danger' : p.status === 'bajo' ? 'text-warn' : ''}">${Fmt.num(p.stock)}</strong><div class="muted small">mín. ${Fmt.num(p.min_stock)}</div>`, csv: (p) => p.stock },
    // Sólo en la exportación: en pantalla el mínimo va debajo de la existencia y el valor está en el detalle.
    { key: 'min_stock', label: 'Mínimo', num: true, hide: true },
    ...(admin ? [{ key: 'value', label: 'Valor al costo', money: true, total: true, hide: true }] : []),
    { key: 'status', label: 'Estado', render: (p) => badge(p.status), csv: (p) => STATUS_LABELS[p.status] },
  ];
}

App.register({
  id: 'products', title: 'Inventario', icon: 'box', group: 'Inventario',
  async render(page) {
    const admin = App.isAdmin();
    const state = { search: '', status: 'todos', includeInactive: false };
    const summaryBox = el(html`<div class="stats"></div>`);
    page.appendChild(summaryBox);
    const tb = toolbar(page, {
      left: html`
        <div class="search">${icon('search')}<input id="p-search" placeholder="Buscar por nombre, marca, color, talla, SKU o código…"></div>
        <div class="seg" id="p-status">
          <button data-s="todos" class="active">Todos</button><button data-s="bajo">Stock bajo</button><button data-s="agotado">Agotados</button><button data-s="reponer">Reponer</button>
        </div>
        ${admin ? html`<label class="check"><input type="checkbox" id="p-inactive"> Ver inactivos</label>` : ''}`,
      right: html`
        <button class="btn" id="p-export">${icon('download')} Exportar</button>
        ${admin ? html`<button class="btn primary" id="p-new">${icon('plus')} Nuevo producto</button>` : ''}`,
    });
    const listBox = el(html`<div class="card"></div>`);
    page.appendChild(listBox);
    let rows = [];

    const load = async () => {
      const [list, sum] = await Promise.all([api('products.list', state), api('products.summary')]);
      rows = list.map((p) => ({ ...p, value: Math.max(p.stock, 0) * (p.cost || 0) }));
      setHTML(summaryBox, [
        statCard('Productos', Fmt.num(sum.products), { iconName: 'tag' }),
        statCard('Unidades en existencia', Fmt.num(sum.units), { iconName: 'box' }),
        admin ? statCard('Invertido en mercancía (costo)', Fmt.money(sum.value_cost), { iconName: 'wallet', tone: 'brand' }) : '',
        statCard('Valor a precio de venta', Fmt.money(sum.value_retail), { iconName: 'chart', sub: admin ? `Ganancia potencial ${Fmt.money(sum.potential_profit)}` : '' }),
        statCard('Stock bajo', Fmt.num(sum.low_stock), { tone: sum.low_stock ? 'warn' : '', iconName: 'alert' }),
        statCard('Agotados', Fmt.num(sum.out_of_stock), { tone: sum.out_of_stock ? 'danger' : '', iconName: 'alert' }),
      ]);
      const cols = productColumns().filter((c) => !c.hide);
      setHTML(listBox, table({ columns: cols, rows, clickable: true, empty: 'No hay productos. Agregue el primero con “Nuevo producto”.', rowClass: (p) => (p.active ? '' : 'inactive') }));
      onRowClick(listBox, rows, (p) => productDetail(p.id, load));
    };

    $('#p-search', tb).oninput = debounce((e) => { state.search = e.target.value; load(); });
    $$('#p-status [data-s]', tb).forEach((b) => (b.onclick = () => {
      $$('#p-status [data-s]', tb).forEach((x) => x.classList.toggle('active', x === b));
      state.status = b.dataset.s;
      load();
    }));
    if (admin) {
      $('#p-inactive', tb).onchange = (e) => { state.includeInactive = e.target.checked; load(); };
      $('#p-new', tb).onclick = () => productForm(null, load);
    }
    $('#p-export', tb).onclick = () => exportCsv('inventario', productColumns(), rows);
    await load();
    $('#p-search', tb).focus();
  },
});

async function productDetail(id, onChange) {
  const p = await api('products.get', { id });
  const movs = await api('products.movements', { product_id: id });
  const admin = App.isAdmin();
  const m = modal({
    title: productLabel(p),
    width: 900,
    body: html`
      <div class="product-detail">
        <div class="pd-photo">${productThumb(p, 180)}</div>
        <div class="pd-info">
          <div class="kv">
            <div><span>Marca</span><b>${p.brand || '—'}</b></div>
            <div><span>Modelo</span><b>${p.model || '—'}</b></div>
            <div><span>Color</span><b>${p.color || '—'}</b></div>
            <div><span>Talla</span><b>${p.size || '—'}</b></div>
            <div><span>SKU</span><b>${p.sku}</b></div>
            <div><span>Código de barras</span><b>${p.barcode || '—'}</b></div>
            ${admin ? html`<div><span>Costo promedio</span><b>${Fmt.money(p.cost)}</b></div>` : ''}
            <div><span>Precio detalle</span><b>${Fmt.money(p.price_retail)}</b></div>
            <div><span>Precio por mayor</span><b>${Fmt.money(p.price_wholesale)}</b></div>
            <div><span>Existencia</span><b class="big">${Fmt.num(p.stock)}</b></div>
            <div><span>Stock mínimo</span><b>${Fmt.num(p.min_stock)}</b></div>
            <div><span>Estado</span><b>${badge(p.status)} ${p.active ? '' : badge('anulada', 'Inactivo')}</b></div>
            ${admin ? html`<div><span>Valor al costo</span><b>${Fmt.money(Math.max(p.stock, 0) * p.cost)}</b></div>` : ''}
            ${admin && p.cost ? html`<div><span>Margen detalle</span><b>${Fmt.pct(((p.price_retail - p.cost) / (p.price_retail || 1)) * 100)}</b></div>` : ''}
          </div>
          ${p.notes ? html`<p class="muted">${p.notes}</p>` : ''}
        </div>
      </div>
      <h4 class="section-title">Historial de movimientos</h4>
      ${table({
        columns: [
          { key: 'created_at', label: 'Fecha', datetime: true },
          { key: 'type_label', label: 'Movimiento' },
          { key: 'qty', label: 'Cantidad', align: 'right', render: (r) => html`<b class="${r.qty < 0 ? 'text-danger' : 'text-ok'}">${r.qty > 0 ? '+' : ''}${r.qty}</b>` },
          { key: 'stock_after', label: 'Existencia', num: true },
          ...(admin ? [{ key: 'unit_cost', label: 'Costo', money: true }] : []),
          { key: 'note', label: 'Detalle' },
          { key: 'user_name', label: 'Usuario' },
        ],
        rows: movs,
        empty: 'Sin movimientos.',
      })}`,
    actions: admin
      ? [
          { label: 'Cerrar' },
          { label: 'Ajustar existencia', onClick: () => { adjustForm(p, () => { onChange(); }); } },
          { label: 'Editar', primary: true, onClick: () => { productForm(p, onChange); } },
        ]
      : [{ label: 'Cerrar' }],
  });
  return m;
}

function productForm(p, onSaved) {
  const isNew = !p;
  p = p || { min_stock: 2 };
  let photoData = null;
  const body = el(html`
    <form class="grid-form">
      <div class="photo-pick">
        <div class="photo-preview">${productThumb(p, 150)}</div>
        <label class="btn small">${icon('plus')} Foto<input type="file" accept="image/*" hidden name="__file"></label>
      </div>
      <div class="grid-2">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${p.name || ''}" placeholder="Ej. Gorra New York Yankees 59FIFTY"></label>
        <label class="field"><span>Marca</span><input name="brand" value="${p.brand || ''}" list="dl-brands"></label>
        <label class="field"><span>Modelo</span><input name="model" value="${p.model || ''}"></label>
        <label class="field"><span>Color</span><input name="color" value="${p.color || ''}"></label>
        <label class="field"><span>Talla</span><input name="size" value="${p.size || ''}" placeholder="Ej. 7 1/4, Ajustable, S/M"></label>
        <label class="field"><span>Código / SKU</span><input name="sku" value="${p.sku || ''}" placeholder="Automático si se deja vacío"></label>
        <label class="field"><span>Código de barras</span><input name="barcode" value="${p.barcode || ''}" placeholder="Escanee o escriba"></label>
        <label class="field"><span>Costo de compra</span><input name="cost" type="number" step="0.01" min="0" value="${p.cost ?? ''}"></label>
        <label class="field"><span>Precio al detalle *</span><input name="price_retail" type="number" step="0.01" min="0" value="${p.price_retail ?? ''}"></label>
        <label class="field"><span>Precio al por mayor</span><input name="price_wholesale" type="number" step="0.01" min="0" value="${p.price_wholesale ?? ''}"></label>
        <label class="field"><span>Stock mínimo</span><input name="min_stock" type="number" step="1" min="0" value="${p.min_stock ?? 0}"></label>
        ${isNew ? html`<label class="field"><span>Existencia inicial</span><input name="initial_stock" type="number" step="1" min="0" value="0"></label>` : html`<label class="field"><span>Existencia</span><input value="${p.stock}" disabled title="Use “Ajustar existencia” o registre una compra"></label>`}
        ${isNew ? '' : html`<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Producto activo</label>`}
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${p.notes || ''}</textarea></label>
      </div>
    </form>`);
  $('[name=__file]', body).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    photoData = await readImage(f);
    setHTML($('.photo-preview', body), html`<img class="thumb" src="${photoData}" style="width:150px;height:150px">`);
  };
  const margin = () => {
    const c = Number($('[name=cost]', body).value);
    const r = Number($('[name=price_retail]', body).value);
    const lbl = $('[name=price_retail]', body).previousElementSibling;
    lbl.textContent = c && r ? `Precio al detalle * (margen ${Fmt.pct(((r - c) / r) * 100)})` : 'Precio al detalle *';
  };
  $('[name=cost]', body).oninput = margin;
  $('[name=price_retail]', body).oninput = margin;
  margin();
  modal({
    title: isNew ? 'Nuevo producto' : 'Editar producto',
    width: 820,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar', primary: true,
        onClick: async () => {
          const f = formData(body);
          delete f.__file;
          const data = { ...f, id: p.id };
          if (photoData) data.photo_data = photoData;
          await api('products.save', data);
          toast('Producto guardado.');
          $$('.modal-back').forEach((x) => x.remove());
          onSaved && onSaved();
        },
      },
    ],
  });
}

function adjustForm(p, onSaved) {
  const body = el(html`
    <div>
      <p>Producto: <b>${productLabel(p)}</b> — existencia actual <b>${p.stock}</b></p>
      <div class="seg full" id="adj-type">
        <button data-t="entrada" class="active">Entrada (+)</button><button data-t="salida">Salida (−)</button><button data-t="ajuste">Conteo físico</button>
      </div>
      <label class="field" id="adj-qty"><span>Cantidad</span><input name="qty" type="number" min="1" step="1"></label>
      <label class="field hidden" id="adj-count"><span>Existencia real contada</span><input name="counted" type="number" min="0" step="1" value="${p.stock}"></label>
      <label class="field"><span>Motivo *</span><input name="note" placeholder="Ej. Mercancía dañada, regalo, conteo mensual, muestra…"></label>
    </div>`);
  let type = 'entrada';
  $$('#adj-type [data-t]', body).forEach((b) => (b.onclick = () => {
    type = b.dataset.t;
    $$('#adj-type [data-t]', body).forEach((x) => x.classList.toggle('active', x === b));
    $('#adj-qty', body).classList.toggle('hidden', type === 'ajuste');
    $('#adj-count', body).classList.toggle('hidden', type !== 'ajuste');
  }));
  modal({
    title: 'Ajustar existencia',
    width: 500,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Aplicar ajuste', primary: true,
        onClick: async () => {
          const f = formData(body);
          const stock = await api('products.adjust', { product_id: p.id, type, qty: f.qty, counted: f.counted, note: f.note });
          toast(`Existencia actualizada: ${stock}`);
          $$('.modal-back').forEach((x) => x.remove());
          onSaved && onSaved();
        },
      },
    ],
  });
}

App.register({
  id: 'movements', title: 'Movimientos de inventario', icon: 'swap', group: 'Inventario',
  async render(page) {
    const filters = { type: '' };
    let range = {};
    const tb = toolbar(page, {
      left: html`<select id="m-type">${options(MOVEMENT_TYPES, '')}</select><div class="search">${icon('search')}<input id="m-search" placeholder="Filtrar por producto o SKU…"></div>`,
      right: html`<button class="btn" id="m-export">${icon('download')} Exportar</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'created_at', label: 'Fecha y hora', datetime: true },
      { key: 'product_name', label: 'Producto', render: (r) => html`<b>${r.product_name}</b> <span class="muted small">${[r.color, r.size].filter(Boolean).join(' · ')}</span>`, csv: (r) => productLabel({ name: r.product_name, color: r.color, size: r.size }) },
      { key: 'sku', label: 'SKU' },
      { key: 'type_label', label: 'Movimiento' },
      { key: 'qty', label: 'Cantidad', align: 'right', render: (r) => html`<b class="${r.qty < 0 ? 'text-danger' : 'text-ok'}">${r.qty > 0 ? '+' : ''}${r.qty}</b>`, csv: (r) => r.qty },
      { key: 'stock_before', label: 'Antes', num: true },
      { key: 'stock_after', label: 'Después', num: true },
      ...(App.isAdmin() ? [{ key: 'unit_cost', label: 'Costo unit.', money: true }] : []),
      { key: 'note', label: 'Detalle' },
      { key: 'user_name', label: 'Usuario' },
    ];
    const render = () => {
      const q = $('#m-search', tb).value.trim().toLowerCase();
      const shown = q ? rows.filter((r) => `${r.product_name} ${r.sku} ${r.color} ${r.size}`.toLowerCase().includes(q)) : rows;
      setHTML(box, table({ columns: cols, rows: shown, empty: 'No hay movimientos en el período.' }));
      return shown;
    };
    const load = async () => {
      rows = await api('products.movements', { ...range, type: filters.type });
      render();
    };
    $('#m-type', tb).onchange = (e) => { filters.type = e.target.value; load(); };
    $('#m-search', tb).oninput = debounce(render, 150);
    $('#m-export', tb).onclick = () => exportCsv('movimientos-inventario', cols, render());
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'mes' });
  },
});
