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
        <button class="btn" id="p-labels">${icon('tag')} Etiquetas</button>
        <button class="btn" id="p-export">${icon('download')} Exportar</button>
        ${admin ? html`<button class="btn" id="p-count">${icon('box')} Conteo</button><button class="btn" id="p-import">${icon('upload')} Importar</button>` : ''}
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
      $('#p-import', tb).onclick = () => importProducts(load);
      $('#p-count', tb).onclick = () => App.go('count');
    }
    $('#p-labels', tb).onclick = () => labelsDialog(rows.filter((p) => p.active));
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
          { label: 'Etiquetas', onClick: () => { labelsDialog([p]); return false; } },
          { label: 'Ajustar existencia', onClick: () => { adjustForm(p, () => { onChange(); }); } },
          { label: 'Editar', primary: true, onClick: () => { productForm(p, onChange); } },
        ]
      : [{ label: 'Cerrar' }, { label: 'Etiquetas', onClick: () => { labelsDialog([p]); return false; } }],
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
          // Desactivar no saca la mercancía: sigue contando en el valor del inventario (auditoría 2.2).
          if (!isNew && p.active && !f.active && p.stock > 0
            && !(await confirmDialog(`Quedan ${p.stock} unidades de este producto. Al desactivarlo deja de aparecer en la venta, pero sigue contando en el valor del inventario. Si ya no están en la tienda, haga antes un ajuste de existencia.`, { title: 'Desactivar producto', okLabel: 'Desactivar' }))) return false;
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

/* ---------- Etiquetas de código de barras (RF-NUE-04) ---------- */

const LABEL_SIZES = { '50x25': [50, 25], '40x30': [40, 30], '60x40': [60, 40] };

// Una etiqueta por página del tamaño de la etiqueta: así funcionan las impresoras de etiquetas en rollo.
function labelsHtml(items, { size = '50x25', price = true } = {}) {
  const [w, h] = LABEL_SIZES[size] || LABEL_SIZES['50x25'];
  const one = (p) => `<div class="l">
      <div class="n">${esc([p.name, p.color, p.size].filter(Boolean).join(' · '))}</div>
      <div class="b">${barcodeSvg(p.barcode || p.sku)}</div>
      <div class="c">${esc(p.barcode || p.sku)}${price ? `<b>${esc(Fmt.money(p.price_retail))}</b>` : ''}</div>
    </div>`;
  const labels = items.flatMap((it) => Array.from({ length: it.qty }, () => one(it.p))).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .l { width: ${w}mm; height: ${h}mm; padding: 1.5mm 2mm; display: flex; flex-direction: column; page-break-after: always; overflow: hidden; }
    .n { font-size: ${h < 30 ? 7 : 8}pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .b { flex: 1; min-height: 0; margin: 1mm 0; }
    .b svg { width: 100%; height: 100%; display: block; }
    .c { font-size: 7pt; display: flex; justify-content: space-between; font-family: 'Courier New', monospace; }
    .c b { font-family: Arial, sans-serif; font-size: ${h < 30 ? 8 : 10}pt; }
  </style></head><body>${labels}</body></html>`;
}

function labelsDialog(products) {
  if (!products.length) return toast('No hay productos en la lista. Busque los productos y vuelva a pulsar Etiquetas.', 'error');
  const list = products.slice(0, 300);
  const m = modal({
    title: 'Imprimir etiquetas',
    width: 640,
    body: html`
      <p class="muted">Cada etiqueta lleva el código de barras del producto o, si no tiene, su SKU. El lector de la caja los reconoce igual.</p>
      <div class="grid-2">
        <label class="field"><span>Tamaño de la etiqueta</span><select name="size">${options([['50x25', '50 × 25 mm'], ['40x30', '40 × 30 mm'], ['60x40', '60 × 40 mm']], '50x25')}</select></label>
        <label class="check"><input type="checkbox" name="price" checked> Imprimir el precio al detalle</label>
      </div>
      <div class="inline"><button class="btn small" type="button" id="lb-stock">Una por unidad en existencia</button><button class="btn small" type="button" id="lb-one">Una de cada</button></div>
      <div class="table-wrap lb-list">
        <table class="table"><thead><tr><th>Producto</th><th>Código</th><th class="r">Cantidad</th></tr></thead>
        <tbody>${list.map((p, i) => html`<tr><td>${productLabel(p)}</td><td><code>${p.barcode || p.sku}</code></td><td class="r"><input type="number" min="0" max="500" step="1" value="1" data-lb="${i}" class="qty-input"></td></tr>`)}</tbody></table>
      </div>
      ${products.length > list.length ? html`<p class="muted small">Se muestran los primeros ${list.length}. Use la búsqueda para elegir otros.</p>` : ''}`,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Imprimir', primary: true,
        onClick: async ({ body }) => {
          const f = formData(body);
          const items = $$('[data-lb]', body).map((i) => ({ p: list[Number(i.dataset.lb)], qty: Math.max(0, Math.min(500, Math.floor(Number(i.value) || 0))) })).filter((x) => x.qty > 0);
          if (!items.length) throw new Error('Indique cuántas etiquetas quiere de al menos un producto.');
          await window.capsApi.printHtml(labelsHtml(items, { size: f.size, price: f.price }));
        },
      },
    ],
  });
  $('#lb-stock', m.body).onclick = () => $$('[data-lb]', m.body).forEach((i) => (i.value = Math.max(0, list[Number(i.dataset.lb)].stock)));
  $('#lb-one', m.body).onclick = () => $$('[data-lb]', m.body).forEach((i) => (i.value = 1));
}

/* ---------- Importar productos desde Excel o CSV (RF-NUE-05) ---------- */

const IMPORT_LABELS = {
  name: 'Nombre', brand: 'Marca', model: 'Modelo', color: 'Color', size: 'Talla', sku: 'SKU', barcode: 'Código de barras', cost: 'Costo',
  price_retail: 'Precio detalle', price_wholesale: 'Precio por mayor', initial_stock: 'Existencia', min_stock: 'Mínimo', notes: 'Notas',
};

function importProducts(onDone) {
  const m = modal({
    title: 'Importar productos',
    width: 820,
    body: html`
      <p>Cargue la lista de productos desde un archivo de <b>Excel (.xlsx)</b> o <b>CSV</b>. La primera fila debe tener los títulos: <b>Nombre</b> y <b>Precio detalle</b> son obligatorios; los demás (Marca, Modelo, Color, Talla, SKU, Código de barras, Costo, Precio por mayor, Existencia, Mínimo, Notas) son opcionales.</p>
      <ul class="muted small">
        <li>Si el SKU (o el código de barras) ya existe, se actualizan los datos y precios de ese producto. Su existencia no cambia: eso se hace con <b>Ajustar existencia</b>.</li>
        <li>Primero verá una vista previa. No se guarda nada hasta que pulse <b>Importar</b>.</li>
      </ul>
      <div class="inline"><button class="btn" type="button" id="imp-template">${icon('download')} Descargar plantilla</button><button class="btn primary" type="button" id="imp-file">${icon('upload')} Elegir archivo…</button></div>
      <div id="imp-preview"></div>`,
    actions: [{ label: 'Cerrar' }],
  });
  const box = $('#imp-preview', m.body);
  $('#imp-template', m.body).onclick = async () => { try { if (await window.capsApi.productTemplate()) toast('Plantilla guardada.'); } catch (e) { toast(e.message, 'error'); } };
  $('#imp-file', m.body).onclick = async () => {
    let file;
    try {
      file = await window.capsApi.readProducts();
    } catch (e) { return toast(e.message, 'error'); }
    if (!file) return;
    if (!file.records.length) return setHTML(box, html`<div class="error-box">El archivo ${file.file} no tiene filas de productos debajo de los títulos.</div>`);
    const preview = await api('products.import', { rows: file.records, dryRun: true });
    const ignored = file.mapped.filter((x) => !x.field && x.header).map((x) => x.header);
    const ok = preview.created + preview.updated;
    setHTML(box, html`
      <h4>${file.file}</h4>
      <p>Columnas: ${file.mapped.filter((x) => x.field).map((x) => html`<span class="chip">${x.header} → ${IMPORT_LABELS[x.field]}</span> `)}
      ${ignored.length ? html`<br><span class="muted small">Se ignoran: ${ignored.join(', ')}</span>` : ''}</p>
      <div class="kv cols-3">
        <div><span>Productos nuevos</span><b class="text-ok">${preview.created}</b></div>
        <div><span>Se actualizan</span><b>${preview.updated}</b></div>
        <div><span>Con error (no se importan)</span><b class="${preview.errors ? 'text-danger' : ''}">${preview.errors}</b></div>
      </div>
      <div class="imp-list"><table class="table"><thead><tr><th>Fila</th><th>Producto</th><th>Resultado</th></tr></thead><tbody>
        ${preview.results.map((r) => html`<tr class="${r.action === 'error' ? 'err' : ''}"><td>${r.line}</td><td>${r.name}${r.sku ? html` <code>${r.sku}</code>` : ''}</td>
          <td>${r.action === 'crear' ? 'Nuevo' : r.action === 'actualizar' ? 'Se actualiza' : html`<b class="text-danger">${r.message}</b>`}${r.note ? html`<div class="muted small">${r.note}</div>` : ''}</td></tr>`)}
      </tbody></table></div>
      <div class="inline"><button class="btn primary" type="button" id="imp-go" ${ok ? '' : 'disabled'}>Importar ${ok} ${ok === 1 ? 'producto' : 'productos'}</button></div>`);
    $('#imp-go', box).onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('products.import', { rows: file.records });
        toast(`Importación lista: ${r.created} nuevos, ${r.updated} actualizados${r.errors ? `, ${r.errors} con error` : ''}.`);
        m.close();
        onDone();
      } catch { e.target.disabled = false; }
    };
  };
}

/* ---------- Conteo de inventario (O6) ---------- */
// Se cuentan muchos productos (escribiendo o con el lector) y se aplican todas las diferencias de una
// vez. El borrador se guarda en esta PC por si se cierra el programa a mitad del conteo.

const COUNT_DRAFT = 'capsshop-conteo';
const countDraft = {
  load() { try { return JSON.parse(localStorage.getItem(COUNT_DRAFT)) || null; } catch { return null; } },
  save(d) { try { localStorage.setItem(COUNT_DRAFT, JSON.stringify(d)); } catch { /* sin almacenamiento: el conteo sigue en pantalla */ } },
  clear() { try { localStorage.removeItem(COUNT_DRAFT); } catch { /* nada */ } },
};

function countSheetHtml(products, { showStock }) {
  const rows = products.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.color || '')}</td><td>${esc(p.size || '')}</td><td class="m">${esc(p.sku)}</td><td class="m">${esc(p.barcode || '')}</td>${showStock ? `<td class="r">${p.stock}</td>` : ''}<td class="box"></td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 12mm; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; }
    h1 { font-size: 14pt; margin: 0 0 2mm; } p { margin: 0 0 4mm; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #555; padding: 1.6mm 2mm; text-align: left; }
    th { background: #eee; font-size: 9pt; } .m { font-family: 'Courier New', monospace; font-size: 9pt; } .r { text-align: right; }
    .box { width: 22mm; } tr { page-break-inside: avoid; }
  </style></head><body>
    <h1>${esc(App.settings.business_name)} · Hoja de conteo de inventario</h1>
    <p>Fecha: ________________ &nbsp; Contó: ______________________ &nbsp; Revisó: ______________________</p>
    <table><thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>SKU</th><th>Código</th>${showStock ? '<th>Sistema</th>' : ''}<th>Contado</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

App.register({
  id: 'count', title: 'Conteo de inventario', icon: 'box', group: 'Inventario', roles: ['admin'], hidden: true, navAs: 'products',
  async render(page) {
    const products = await api('products.list', {});
    let draft = countDraft.load();
    if (draft && Object.keys(draft.counts || {}).length) {
      const n = Object.keys(draft.counts).length;
      const keep = await confirmDialog(`Hay un conteo sin terminar en esta computadora (${n} ${n === 1 ? 'producto contado' : 'productos contados'}, empezado el ${Fmt.datetime(draft.started_at)}). ¿Seguir con ese conteo?`, { title: 'Conteo sin terminar', okLabel: 'Seguir' });
      if (!keep) draft = null;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    // expected: la existencia del sistema cuando empezó el conteo (para detectar ventas mientras se cuenta).
    draft = draft && draft.expected ? draft : {
      started_at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
      expected: Object.fromEntries(products.map((p) => [p.id, p.stock])),
      counts: {},
    };
    for (const p of products) if (!(p.id in draft.expected)) draft.expected[p.id] = p.stock;
    const byCode = new Map();
    for (const p of products) {
      byCode.set(String(p.sku).toLowerCase(), p);
      if (p.barcode) byCode.set(String(p.barcode).toLowerCase(), p);
    }

    const tb = toolbar(page, {
      left: html`
        <div class="search">${icon('search')}<input id="ct-scan" placeholder="Escanee o escriba el código y pulse Enter: suma 1" autocomplete="off"></div>
        <div class="search">${icon('search')}<input id="ct-filter" placeholder="Filtrar por nombre, color, talla…"></div>
        <label class="check"><input type="checkbox" id="ct-pending"> Solo sin contar</label>`,
      right: html`
        <button class="btn" id="ct-sheet">${icon('print')} Hoja de conteo</button>
        <button class="btn" id="ct-clear">Empezar de nuevo</button>
        <button class="btn primary" id="ct-review">Revisar y aplicar</button>`,
    });
    const info = el(html`<div class="info-box">Cuente con la tienda cerrada o sin vender. Escriba lo contado, o escanee cada gorra con el lector (cada lectura suma 1). <b>Los productos que deje vacíos no se tocan.</b> Nada cambia hasta pulsar <b>Revisar y aplicar</b>.</div>`);
    page.appendChild(info);
    const status = el(html`<div class="stats"></div>`);
    page.appendChild(status);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);

    setHTML(box, html`<div class="table-wrap"><table class="table" id="ct-table"><thead><tr><th>Producto</th><th>SKU / código</th><th class="r">Sistema</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>
      ${products.map((p) => html`<tr data-id="${p.id}"><td><b>${p.name}</b><div class="muted small">${[p.brand, p.color, p.size].filter(Boolean).join(' · ')}</div></td>
        <td><code>${p.sku}</code>${p.barcode ? html`<div class="muted small">${p.barcode}</div>` : ''}</td>
        <td class="r">${draft.expected[p.id]}</td>
        <td class="r"><input type="number" min="0" step="1" class="qty-input" data-count="${p.id}" value="${draft.counts[p.id] ?? ''}"></td>
        <td class="r" data-diff="${p.id}"></td></tr>`)}
    </tbody></table></div>`);
    const rowOf = (id) => $(`tr[data-id="${id}"]`, box);
    const showDiff = (id) => {
      const cell = $(`[data-diff="${id}"]`, box);
      const v = draft.counts[id];
      if (v === undefined) return setHTML(cell, '');
      const diff = v - draft.expected[id];
      setHTML(cell, html`<b class="${diff < 0 ? 'text-danger' : diff > 0 ? 'text-warn' : 'text-ok'}">${diff > 0 ? '+' : ''}${diff}</b>`);
    };
    const refreshStatus = () => {
      const ids = Object.keys(draft.counts);
      const diffs = ids.filter((id) => draft.counts[id] !== draft.expected[id]);
      setHTML(status, [
        statCard('Contados', `${ids.length} de ${products.length}`, { iconName: 'box' }),
        statCard('Con diferencia', Fmt.num(diffs.length), { tone: diffs.length ? 'warn' : '', iconName: 'alert' }),
      ]);
    };
    const set = (id, value) => {
      if (value === '' || value === null || value === undefined) delete draft.counts[id];
      else draft.counts[id] = Math.max(0, Math.floor(Number(value) || 0));
      countDraft.save(draft);
      showDiff(id);
      refreshStatus();
    };
    products.forEach((p) => showDiff(p.id));
    refreshStatus();

    $$('[data-count]', box).forEach((i) => (i.oninput = () => set(Number(i.dataset.count), i.value)));
    const scan = $('#ct-scan', tb);
    scan.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = scan.value.trim().toLowerCase();
      scan.value = '';
      if (!code) return;
      const p = byCode.get(code);
      if (!p) return toast(`No hay un producto activo con el código "${code}".`, 'error');
      const next = (draft.counts[p.id] || 0) + 1;
      $(`[data-count="${p.id}"]`, box).value = next;
      set(p.id, next);
      const tr = rowOf(p.id);
      tr.classList.remove('flash');
      void tr.offsetWidth;
      tr.classList.add('flash');
      tr.scrollIntoView({ block: 'nearest' });
    };
    const applyFilter = () => {
      const q = $('#ct-filter', tb).value.trim().toLowerCase();
      const pending = $('#ct-pending', tb).checked;
      for (const p of products) {
        const text = [p.name, p.brand, p.model, p.color, p.size, p.sku, p.barcode].filter(Boolean).join(' ').toLowerCase();
        rowOf(p.id).classList.toggle('hidden', (q && !text.includes(q)) || (pending && draft.counts[p.id] !== undefined));
      }
    };
    $('#ct-filter', tb).oninput = debounce(applyFilter, 150);
    $('#ct-pending', tb).onchange = applyFilter;
    $('#ct-clear', tb).onclick = async () => {
      if (!(await confirmDialog('Se borra lo contado en esta pantalla y se empieza un conteo nuevo con la existencia actual. ¿Empezar de nuevo?', { danger: true, okLabel: 'Empezar de nuevo' }))) return;
      countDraft.clear();
      App.reload();
    };
    $('#ct-sheet', tb).onclick = () => modal({
      title: 'Hoja de conteo',
      width: 460,
      body: html`<p class="muted">Una hoja para contar a mano, con los productos de la lista (respeta el filtro).</p>
        <label class="check"><input type="checkbox" name="stock"> Mostrar la existencia del sistema (si no, el conteo es "a ciegas", más confiable)</label>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Imprimir', primary: true,
          onClick: async ({ body }) => {
            const visible = products.filter((p) => !rowOf(p.id).classList.contains('hidden')).map((p) => ({ ...p, stock: draft.expected[p.id] }));
            await window.capsApi.printHtml(countSheetHtml(visible, { showStock: formData(body).stock }));
          },
        },
      ],
    });
    $('#ct-review', tb).onclick = async () => {
      const counts = Object.entries(draft.counts).map(([id, counted]) => ({ product_id: Number(id), counted, expected: draft.expected[id] }));
      if (!counts.length) return toast('Todavía no hay productos contados.', 'error');
      const r = await api('products.count', { counts, dryRun: true });
      const rows = r.results.filter((x) => x.action !== 'igual');
      const m = modal({
        title: 'Revisar el conteo',
        width: 760,
        body: html`
          <div class="kv cols-4">
            <div><span>Contados</span><b>${r.counted}</b></div>
            <div><span>Sin diferencia</span><b class="text-ok">${r.same}</b></div>
            <div><span>Faltan</span><b class="${r.missing_units ? 'text-danger' : ''}">${r.missing_units} unid.</b></div>
            <div><span>Sobran</span><b class="${r.extra_units ? 'text-warn' : ''}">${r.extra_units} unid.</b></div>
            <div><span>Diferencia al costo</span><b class="${r.value < 0 ? 'text-danger' : ''}">${Fmt.money(r.value)}</b></div>
            ${r.errors ? html`<div><span>Con error (no se aplican)</span><b class="text-danger">${r.errors}</b></div>` : ''}
          </div>
          ${rows.length ? html`<div class="imp-list"><table class="table"><thead><tr><th>Producto</th><th class="r">Sistema</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>
            ${rows.map((x) => html`<tr class="${x.action === 'error' ? 'err' : ''}"><td>${x.name} <code>${x.sku}</code>${x.message ? html`<div class="text-danger small">${x.message}</div>` : ''}</td>
              <td class="r">${x.stock ?? ''}</td><td class="r">${x.counted ?? ''}</td><td class="r">${x.diff === undefined ? '' : html`<b class="${x.diff < 0 ? 'text-danger' : 'text-warn'}">${x.diff > 0 ? '+' : ''}${x.diff}</b>`}</td></tr>`)}
          </tbody></table></div>` : html`<p class="text-ok">Todo lo contado coincide con el sistema.</p>`}
          <label class="field"><span>Motivo *</span><input name="note" placeholder="Ej. Conteo semanal del piloto"></label>`,
        actions: [
          { label: 'Seguir contando' },
          {
            label: r.adjusted ? `Aplicar ${r.adjusted} ${r.adjusted === 1 ? 'ajuste' : 'ajustes'}` : 'Terminar conteo', primary: true,
            onClick: async ({ body }) => {
              const done = await api('products.count', { counts, note: formData(body).note });
              countDraft.clear();
              toast(`${done.adjusted ? `Conteo aplicado: ${done.adjusted} ${done.adjusted === 1 ? 'producto ajustado' : 'productos ajustados'}.` : 'Conteo terminado: todo coincide.'}${done.errors ? ` ${done.errors} sin aplicar: vuelva a contarlos en un conteo nuevo.` : ''}`, done.errors ? 'error' : 'ok');
              App.go('products');
            },
          },
        ],
      });
      return m;
    };
    scan.focus();
  },
});
