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
    { key: 'name', label: 'Producto', cls: 'col-product', render: (p) => html`<strong>${p.name}</strong><div class="muted small">${[p.brand, p.model, p.category].filter(Boolean).join(' · ')}</div>`, csv: (p) => p.name },
    { key: 'brand', label: 'Marca', hide: true },
    { key: 'model', label: 'Modelo', hide: true },
    { key: 'category', label: 'Categoría', hide: true },
    // El color es de productos anteriores a 1.7: solo va en la exportación.
    { key: 'color', label: 'Color', hide: true },
    { key: 'size', label: 'Talla' },
    { key: 'sku', label: 'SKU', render: (p) => html`<code>${p.sku}</code>` , csv: (p) => p.sku },
    { key: 'barcode', label: 'Código de barras', hide: true },
    ...(admin ? [{ key: 'cost', label: 'Costo', money: true }] : []),
    { key: 'price_retail', label: 'Detalle', money: true },
    { key: 'price_wholesale', label: 'Por mayor', money: true },
    { key: 'stock', label: 'Existencia', num: true, total: true, render: (p) => html`<strong class="${p.status === 'agotado' ? 'text-danger' : p.status === 'bajo' ? 'text-warn' : ''}">${Fmt.num(p.stock)}</strong><div class="muted small">${p.reserved ? html`<span class="text-info">${p.reserved} apartadas</span> · ` : ''}mín. ${Fmt.num(p.min_stock)}</div>`, csv: (p) => p.stock },
    { key: 'reserved', label: 'Apartadas', num: true, total: true, hide: true },
    { key: 'available', label: 'Disponible', num: true, total: true, hide: true },
    // Sólo en la exportación: en pantalla el mínimo va debajo de la existencia y el valor está en el detalle.
    { key: 'min_stock', label: 'Mínimo', num: true, hide: true },
    ...(admin ? [{ key: 'value', label: 'Valor al costo', money: true, total: true, hide: true }] : []),
    { key: 'status', label: 'Estado', render: (p) => badge(p.status), csv: (p) => STATUS_LABELS[p.status] },
  ];
}

/* ---------- Modelos con variantes (1.5) ---------- */

const MODEL_COLUMNS = [
  { label: '', render: (m) => productThumb(m, 38), csv: false, cls: 'w-thumb' },
  { key: 'name', label: 'Modelo', cls: 'col-product', render: (m) => html`<strong>${m.name}</strong><div class="muted small">${[m.brand, m.model, m.category].filter(Boolean).join(' · ')}</div>` },
  { key: 'colors', label: 'Colores', hide: true, csv: (m) => m.colors.join(', ') },
  { key: 'sizes', label: 'Tallas', cls: 'wrap', render: (m) => m.sizes.join(', ') || '—', csv: (m) => m.sizes.join(', ') },
  { key: 'variants', label: 'Variantes', num: true, total: true },
  { key: 'stock', label: 'Existencia', num: true, total: true, render: (m) => html`<strong>${Fmt.num(m.stock)}</strong>${m.reserved ? html`<div class="muted small"><span class="text-info">${m.reserved} apartadas</span></div>` : ''}` },
  { key: 'price_min', label: 'Precio', align: 'right', render: (m) => (m.price_min === m.price_max ? Fmt.money(m.price_min) : `${Fmt.money(m.price_min)} – ${Fmt.money(m.price_max)}`) },
  { key: 'low', label: 'Estado', render: (m) => (m.out ? badge('agotado', `${m.out} agotada${m.out === 1 ? '' : 's'}`) : m.low ? badge('bajo', `${m.low} en stock bajo`) : badge('ok')), csv: (m) => `${m.out} agotadas, ${m.low} bajas` },
];

// Detalle de un modelo: la existencia de cada talla (y de cada color, en productos anteriores a 1.7).
async function modelDetail(id, onChange) {
  const m = await api('products.modelGet', { id });
  const admin = App.isAdmin();
  const k = (c, z) => `${(c || '').toLowerCase()}|${(z || '').toLowerCase()}`;
  const byId = new Map(m.variants.map((v) => [v.id, v]));
  const cellOf = (c, z) => byId.get(m.cells[k(c, z)]);
  const sizes = m.sizes.length ? m.sizes : [''];
  const colors = m.colors.length ? m.colors : [''];
  const body = el(html`
    <div>
      <div class="product-detail">
        <div class="pd-photo">${productThumb(m, 140)}</div>
        <div class="pd-info"><div class="kv">
          <div><span>Marca</span><b>${m.brand || '—'}</b></div>
          <div><span>Modelo</span><b>${m.model || '—'}</b></div>
          <div><span>Categoría</span><b>${m.category || '—'}</b></div>
          <div><span>Variantes</span><b>${m.variants.length}</b></div>
          <div><span>Existencia</span><b class="big">${Fmt.num(m.stock)}</b></div>
          <div><span>Disponible</span><b>${Fmt.num(m.available)}${m.reserved ? html` <small class="text-info">(${m.reserved} apartadas)</small>` : ''}</b></div>
        </div></div>
      </div>
      <h4 class="section-title">Existencia por ${m.colors.length ? 'color y talla' : 'talla'} <small class="muted">— toque una casilla para ver esa variante</small></h4>
      <div class="table-wrap"><table class="table vgrid">
        <thead><tr><th></th>${sizes.map((z) => html`<th class="text-center">${z || 'Única'}</th>`)}<th class="text-right">Total</th></tr></thead>
        <tbody>${colors.map((c) => html`<tr><th>${c || 'Único'}</th>${sizes.map((z) => {
          const v = cellOf(c, z);
          if (!v) return html`<td class="text-center muted">—</td>`;
          return html`<td class="text-center"><button class="cell ${!v.active ? 'off' : v.status}" data-v="${v.id}" title="${v.sku}${v.reserved ? ` · ${v.reserved} apartadas` : ''}">${v.stock}${v.reserved ? html`<small>−${v.reserved}</small>` : ''}</button></td>`;
        })}<td class="text-right"><b>${m.variants.filter((v) => (v.color || '') === c).reduce((s, v) => s + v.stock, 0)}</b></td></tr>`)}</tbody>
      </table></div>
      <p class="muted small">Rojo: agotada · amarillo: stock bajo · gris: desactivada. "−2" son unidades apartadas.</p>
    </div>`);
  const md = modal({
    title: m.name,
    width: 860,
    body,
    actions: admin
      ? [
          { label: 'Cerrar' },
          { label: 'Editar producto', primary: true, onClick: () => { productEditor(m, (newId) => { md.close(); modelDetail(newId, onChange); onChange && onChange(); }); return false; } },
        ]
      : [{ label: 'Cerrar' }],
  });
  $$('[data-v]', body).forEach((b) => (b.onclick = () => productDetail(Number(b.dataset.v), async () => { md.close(); await modelDetail(id, onChange).catch(() => {}); onChange && onChange(); })));
}

App.register({
  id: 'products', title: 'Inventario', icon: 'box', group: 'Inventario',
  async render(page) {
    const admin = App.isAdmin();
    const state = { search: '', status: 'todos', includeInactive: false, view: 'variantes' };
    const summaryBox = el(html`<div class="stats"></div>`);
    page.appendChild(summaryBox);
    const tb = toolbar(page, {
      left: html`
        <div class="search">${icon('search')}<input id="p-search" placeholder="Buscar por nombre, marca, modelo, categoría, talla, SKU o código…"></div>
        <div class="seg" id="p-view" title="Ver cada variante o agrupar por modelo">
          <button data-v="variantes" class="active">Variantes</button><button data-v="modelos">${icon('grid')} Modelos</button>
        </div>
        <div class="seg" id="p-status">
          <button data-s="todos" class="active">Todos</button><button data-s="bajo">Stock bajo</button><button data-s="agotado">Agotados</button><button data-s="reponer">Reponer</button><button data-s="apartado">Apartados</button>
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
      if (state.view === 'modelos') {
        const models = await api('products.models', state);
        drawSummary(sum);
        setHTML(listBox, table({ columns: MODEL_COLUMNS.filter((c) => !c.hide), rows: models, clickable: true, empty: 'No hay productos con este filtro.' }));
        onRowClick(listBox, models, (m) => (m.id ? modelDetail(m.id, load) : productDetail(m.first_id, load)));
        return;
      }
      drawSummary(sum);
      const cols = productColumns().filter((c) => !c.hide);
      setHTML(listBox, table({ columns: cols, rows, clickable: true, empty: 'No hay productos. Agregue el primero con “Nuevo producto”.', rowClass: (p) => (p.active ? '' : 'inactive') }));
      onRowClick(listBox, rows, (p) => productDetail(p.id, load));
    };
    const drawSummary = (sum) => {
      setHTML(summaryBox, [
        statCard('Productos', Fmt.num(sum.products), { iconName: 'tag' }),
        statCard('Unidades en existencia', Fmt.num(sum.units), { iconName: 'box', sub: sum.reserved_units ? `${Fmt.num(sum.reserved_units)} apartadas` : '' }),
        admin ? statCard('Invertido en mercancía (costo)', Fmt.money(sum.value_cost), { iconName: 'wallet', tone: 'brand' }) : '',
        statCard('Valor a precio de venta', Fmt.money(sum.value_retail), { iconName: 'chart', sub: admin ? `Ganancia potencial ${Fmt.money(sum.potential_profit)}` : '' }),
        statCard('Stock bajo', Fmt.num(sum.low_stock), { tone: sum.low_stock ? 'warn' : '', iconName: 'alert' }),
        statCard('Agotados', Fmt.num(sum.out_of_stock), { tone: sum.out_of_stock ? 'danger' : '', iconName: 'alert' }),
      ]);
    };

    $('#p-search', tb).oninput = debounce((e) => { state.search = e.target.value; load(); });
    $$('#p-view [data-v]', tb).forEach((b) => (b.onclick = () => {
      $$('#p-view [data-v]', tb).forEach((x) => x.classList.toggle('active', x === b));
      state.view = b.dataset.v;
      load();
    }));
    $$('#p-status [data-s]', tb).forEach((b) => (b.onclick = () => {
      $$('#p-status [data-s]', tb).forEach((x) => x.classList.toggle('active', x === b));
      state.status = b.dataset.s;
      load();
    }));
    if (admin) {
      $('#p-inactive', tb).onchange = (e) => { state.includeInactive = e.target.checked; load(); };
      $('#p-new', tb).onclick = () => productEditor(null, load);
      $('#p-import', tb).onclick = () => importProducts(load);
      $('#p-count', tb).onclick = () => App.go('count');
    }
    $('#p-labels', tb).onclick = () => labelsDialog(rows.filter((p) => p.active));
    $('#p-export', tb).onclick = () => exportExcel('inventario', productColumns(), rows);
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
            <div><span>Categoría</span><b>${p.category || '—'}</b></div>
            ${p.color ? html`<div><span>Color</span><b>${p.color}</b></div>` : ''}
            <div><span>Talla</span><b>${p.size || '—'}</b></div>
            <div><span>SKU</span><b>${p.sku}</b></div>
            <div><span>Código de barras</span><b>${p.barcode || '—'}</b></div>
            ${admin ? html`<div><span>Costo promedio</span><b>${Fmt.money(p.cost)}</b></div>` : ''}
            <div><span>Precio detalle</span><b>${Fmt.money(p.price_retail)}</b></div>
            <div><span>Precio por mayor</span><b>${Fmt.money(p.price_wholesale)}</b></div>
            <div><span>Existencia</span><b class="big">${Fmt.num(p.stock)}</b></div>
            ${p.reserved ? html`<div><span>Disponible</span><b>${Fmt.num(p.available)} <small class="text-info">(${p.reserved} apartadas)</small></b></div>` : ''}
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
          ...(p.variants > 1 ? [{ label: `Ver modelo (${p.variants} variantes)`, onClick: () => { modelDetail(p.model_id, onChange); } }] : []),
          { label: 'Etiquetas', onClick: () => { labelsDialog([p]); return false; } },
          { label: 'Ajustar existencia', onClick: () => { adjustForm(p, () => { onChange(); }); } },
          { label: 'Editar esta variante', onClick: () => { variantForm(p, onChange); } },
          { label: 'Editar producto', primary: true, onClick: async () => { productEditor(await api('products.modelGet', { id: p.model_id }), () => onChange && onChange()); } },
        ]
      : [{ label: 'Cerrar' }, ...(p.variants > 1 ? [{ label: `Ver modelo (${p.variants} variantes)`, onClick: () => { modelDetail(p.model_id, onChange); } }] : []), { label: 'Etiquetas', onClick: () => { labelsDialog([p]); return false; } }],
  });
  return m;
}

/* ---------- Producto: marca, modelo, categoría y tallas del catálogo (1.7, DT-45, DT-46) ---------- */
const newCatalogItem = (type, label) => async (typed) => {
  const name = typed || (await promptDialog({ title: `Nueva ${label}`, label: 'Nombre' }));
  return name ? api('catalog.create', { type, name }) : null;
};
const newSize = async () => {
  const name = await promptDialog({ title: 'Agregar talla', label: 'Talla (ej. 7 1/4, S/M, XL)' });
  return name ? api('catalog.create', { type: 'sizes', name }) : null;
};
const MONEY_ATTRS = 'type="number" step="0.01" min="0" inputmode="decimal" data-money';

// Producto nuevo, o uno existente con todas sus tallas (m = products.modelGet). Cada talla elegida es una
// variante con su existencia; sin tallas, es una sola.
async function productEditor(m, onSaved) {
  const isNew = !m;
  const all = await api('catalog.list', { includeInactive: true });
  const variants = isNew ? [] : m.variants;
  const used = (key) => new Set(variants.map((v) => v[key]).filter(Boolean));
  // Lo desactivado del catálogo solo aparece si este producto ya lo usa.
  const pick = (list, key) => { const u = used(key); return all[list].filter((x) => x.active || u.has(x.id)); };
  const first = variants.find((v) => v.active) || variants[0] || { min_stock: 2 };
  const modelNow = !isNew && m.model ? all.models.find((x) => x.name.toLowerCase() === m.model.toLowerCase()) : null;
  const cat = {
    brands: pick('brands', 'brand_id'),
    models: all.models.filter((x) => x.active || x === modelNow),
    categories: pick('categories', 'category_id'),
    sizes: pick('sizes', 'size_id'),
  };
  const activeVs = variants.filter((v) => v.active);
  const startSizes = [...new Set(activeVs.map((v) => v.size_id).filter(Boolean))];
  const samePrices = new Set(activeVs.map((v) => `${v.price_retail}|${v.price_wholesale}`)).size <= 1;
  const sameCost = new Set(activeVs.map((v) => v.cost)).size <= 1;
  let photoData = null;
  const body = el(html`
    <form class="grid-form editor">
      ${isNew ? html`<div class="photo-pick">
        <div class="photo-preview">${productThumb({}, 120)}</div>
        <label class="btn small">${icon('plus')} Foto<input type="file" accept="image/*" hidden name="__file"></label>
      </div>` : ''}
      <div class="grid-2 ${isNew ? '' : 'span-all'}">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${isNew ? '' : m.name}" placeholder="Ej. Gorra New York Yankees"></label>
        <div class="field"><span>Marca</span><div id="pe-brand"></div></div>
        <div class="field"><span>Modelo</span><div id="pe-model"></div></div>
        <div class="field"><span>Categoría</span><div id="pe-category"></div></div>
        <div class="field"><span>Tallas</span><div id="pe-sizes"></div></div>
        <div class="span-2" id="pe-stock"></div>
        <label class="field"><span>Costo</span><input name="cost" ${MONEY_ATTRS} value="${isNew ? '' : sameCost ? first.cost : ''}" placeholder="${!isNew && !sameCost ? 'Distinto en cada talla' : ''}"></label>
        <label class="field"><span>Precio detalle *</span><input name="price_retail" ${MONEY_ATTRS} value="${first.price_retail ?? ''}"></label>
        <label class="field"><span>Precio por mayor</span><input name="price_wholesale" ${MONEY_ATTRS} value="${first.price_wholesale ?? ''}"></label>
        <label class="field"><span>Stock mínimo</span><input name="min_stock" type="number" step="1" min="0" value="${first.min_stock ?? 2}"></label>
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${first.notes || ''}</textarea></label>
      </div>
    </form>`);
  const brand = comboSelect($('#pe-brand', body), { items: cat.brands, value: isNew ? null : m.brand_id ?? first.brand_id, placeholder: 'Seleccionar marca…', createLabel: 'Crear nueva marca', onCreate: newCatalogItem('brands', 'marca'), id: 'pe-brand-input' });
  const model = comboSelect($('#pe-model', body), { items: cat.models, value: modelNow ? modelNow.id : null, placeholder: 'Seleccionar modelo…', createLabel: 'Crear nuevo modelo', onCreate: newCatalogItem('models', 'modelo'), id: 'pe-model-input' });
  const category = comboSelect($('#pe-category', body), { items: cat.categories, value: first.category_id ?? null, placeholder: 'Seleccionar categoría…', createLabel: 'Crear nueva categoría', onCreate: newCatalogItem('categories', 'categoría'), id: 'pe-category-input' });
  const sizes = chipPicker($('#pe-sizes', body), { items: cat.sizes, selected: startSizes, addLabel: 'Otra talla', onAdd: newSize, onChange: () => drawStock(), locked: startSizes });

  // Existencia por talla. Las tallas que ya tiene muestran lo que hay (se cambia con un ajuste); una talla
  // que se quita se desactiva (no se borra: tiene ventas y movimientos).
  const typed = {}; // existencia escrita en las tallas nuevas
  const bySize = (id) => variants.filter((v) => (v.size_id || 0) === (id || 0));
  let plan = { add: [], deactivate: [], activate: [] };
  const drawStock = () => {
    const zs = sizes.value;
    const cur = new Set(zs.map((z) => z.id));
    plan = { add: [], deactivate: activeVs.filter((v) => v.size_id && !cur.has(v.size_id)).map((v) => v.id), activate: [] };
    const rows = zs.map((z) => {
      const vs = bySize(z.id);
      const on = vs.filter((v) => v.active);
      if (!on.length && vs.length) plan.activate.push(...vs.map((v) => v.id));
      if (!vs.length) plan.add.push({ size_id: z.id });
      return { z, vs, isNew: !vs.length, stock: vs.reduce((s, v) => s + v.stock, 0), back: !on.length && vs.length > 0 };
    });
    const loose = activeVs.filter((v) => !v.size_id); // sin talla
    const removed = activeVs.filter((v) => plan.deactivate.includes(v.id));
    const box = $('#pe-stock', body);
    if (!zs.length && !loose.length) {
      plan.add.push({ size_id: null });
      setHTML(box, html`<label class="field stock-one"><span>Existencia inicial</span><input type="number" min="0" step="1" data-stock="0" value="${typed[0] ?? 0}"></label>`);
    } else {
      setHTML(box, html`<div class="field"><span>${zs.length ? 'Existencia por talla' : 'Existencia'}</span><div class="size-stock">
        ${rows.map((r) => html`<label class="ss-item ${r.isNew ? '' : 'has'}"><b>${r.z.name}</b>${r.isNew
          ? html`<input type="number" min="0" step="1" data-stock="${r.z.id}" value="${typed[r.z.id] ?? 0}">`
          : html`<span>${Fmt.num(r.stock)}</span>${r.back ? html`<small class="text-ok">se reactiva</small>` : ''}`}</label>`)}
        ${loose.map((v) => html`<label class="ss-item has"><b>Sin talla</b><span>${Fmt.num(v.stock)}</span></label>`)}
        ${removed.map((v) => html`<label class="ss-item off"><b>${v.size}${v.color ? ` · ${v.color}` : ''}</b><span>${Fmt.num(v.stock)}</span><small>se desactiva</small></label>`)}
      </div></div>`);
    }
    $$('[data-stock]', box).forEach((i) => (i.oninput = () => { typed[i.dataset.stock] = i.value; }));
  };
  drawStock();

  const photo = $('[name=__file]', body);
  if (photo) photo.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    photoData = await readImage(f);
    setHTML($('.photo-preview', body), html`<img class="thumb" src="${photoData}" style="width:120px;height:120px">`);
  };

  modal({
    title: isNew ? 'Nuevo producto' : `Editar producto · ${m.name}`,
    width: 720,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar', primary: true,
        onClick: async () => {
          const f = formData(body);
          delete f.__file;
          const common = { name: f.name, model: model.name || null, brand_id: brand.value, category_id: category.value, price_retail: f.price_retail, price_wholesale: f.price_wholesale, notes: f.notes };
          const rowsNew = plan.add.map((a) => ({ size_id: a.size_id, initial_stock: Math.max(0, parseInt(typed[a.size_id || 0], 10) || 0) }));
          if (isNew) {
            const r = await api('products.createModel', { ...common, cost: f.cost, min_stock: f.min_stock, variants: rowsNew, ...(photoData ? { photo_data: photoData } : {}) });
            toast(r.ids.length === 1 ? 'Producto creado.' : `Producto creado con ${r.ids.length} tallas.`);
            $$('.modal-back').forEach((x) => x.remove());
            onSaved && onSaved(r.model_id);
            return;
          }
          const withStock = variants.filter((v) => plan.deactivate.includes(v.id) && v.stock > 0);
          if (withStock.length && !(await confirmDialog(`${withStock.map((v) => `${[v.size, v.color].filter(Boolean).join(' · ')}: ${v.stock}`).join(', ')}. Esas tallas tienen existencia: al quitarlas dejan de aparecer en la venta, pero siguen contando en el valor del inventario. Si ya no están en la tienda, haga antes un ajuste.`, { title: 'Quitar tallas con existencia', okLabel: 'Quitar' }))) return false;
          const priceChanged = Number(f.price_retail) !== Number(first.price_retail) || Number(f.price_wholesale || 0) !== Number(first.price_wholesale || 0);
          // El costo sale de las compras: solo se cambia en todas si se escribió uno distinto.
          const costChanged = f.cost !== '' && !(sameCost && Number(f.cost) === Number(first.cost));
          const newId = await api('products.saveModel', {
            id: m.id, ...common, apply_prices: priceChanged || samePrices,
            ...(costChanged ? { cost: f.cost } : {}),
            ...(Number(f.min_stock) !== Number(first.min_stock) ? { min_stock: f.min_stock } : {}),
            add: rowsNew, deactivate: plan.deactivate, activate: plan.activate,
          });
          toast('Producto guardado.');
          $$('.modal-back').forEach((x) => x.remove());
          onSaved && onSaved(newId);
        },
      },
    ],
  });
  $('[name=name]', body).focus();
}

// Una sola variante: su SKU, código de barras, costo, precios, talla y estado. El color (de productos
// anteriores a 1.7) se conserva como está.
async function variantForm(p, onSaved) {
  const all = await api('catalog.list', { includeInactive: true });
  const avail = (list, current) => all[list].filter((x) => x.active || x.id === current);
  let photoData = null;
  const opts = (list, current, empty) => options([['', empty], ...avail(list, current).map((x) => [x.id, x.name])], current ?? '');
  const body = el(html`
    <form class="grid-form editor">
      <div class="photo-pick">
        <div class="photo-preview">${productThumb(p, 150)}</div>
        <label class="btn small">${icon('plus')} Foto<input type="file" accept="image/*" hidden name="__file"></label>
      </div>
      <div class="grid-2">
        <label class="field span-2"><span>Nombre *</span><input name="name" value="${p.name}"></label>
        <div class="field"><span>Marca</span><div id="vf-brand"></div></div>
        <div class="field"><span>Modelo</span><div id="vf-model"></div></div>
        <div class="field"><span>Categoría</span><div id="vf-category"></div></div>
        <label class="field"><span>Talla</span><select name="size_id">${opts('sizes', p.size_id, 'Sin talla')}</select></label>
        <label class="field"><span>Código / SKU</span><input name="sku" value="${p.sku || ''}"></label>
        <label class="field"><span>Código de barras</span><input name="barcode" value="${p.barcode || ''}" placeholder="Escanee o escriba"></label>
        <label class="field"><span>Costo promedio</span><input name="cost" ${MONEY_ATTRS} value="${p.cost ?? ''}"></label>
        <label class="field"><span>Precio detalle *</span><input name="price_retail" ${MONEY_ATTRS} value="${p.price_retail ?? ''}"></label>
        <label class="field"><span>Precio por mayor</span><input name="price_wholesale" ${MONEY_ATTRS} value="${p.price_wholesale ?? ''}"></label>
        <label class="field"><span>Stock mínimo</span><input name="min_stock" type="number" step="1" min="0" value="${p.min_stock ?? 0}"></label>
        <label class="field"><span>Existencia</span><input value="${p.stock}" disabled title="Use “Ajustar existencia” o registre una compra"></label>
        <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Variante activa</label>
        <label class="field span-2"><span>Notas</span><textarea name="notes" rows="2">${p.notes || ''}</textarea></label>
      </div>
    </form>`);
  const brand = comboSelect($('#vf-brand', body), { items: avail('brands', p.brand_id), value: p.brand_id, placeholder: 'Seleccionar marca…', createLabel: 'Crear nueva marca', onCreate: newCatalogItem('brands', 'marca') });
  const modelNow = p.model ? all.models.find((x) => x.name.toLowerCase() === p.model.toLowerCase()) : null;
  const model = comboSelect($('#vf-model', body), { items: all.models.filter((x) => x.active || x === modelNow), value: modelNow ? modelNow.id : null, placeholder: 'Seleccionar modelo…', createLabel: 'Crear nuevo modelo', onCreate: newCatalogItem('models', 'modelo') });
  const category = comboSelect($('#vf-category', body), { items: avail('categories', p.category_id), value: p.category_id, placeholder: 'Seleccionar categoría…', createLabel: 'Crear nueva categoría', onCreate: newCatalogItem('categories', 'categoría') });
  $('[name=__file]', body).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    photoData = await readImage(f);
    setHTML($('.photo-preview', body), html`<img class="thumb" src="${photoData}" style="width:150px;height:150px">`);
  };
  modal({
    title: `Editar variante · ${productLabel(p)}`,
    width: 820,
    body,
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar', primary: true,
        onClick: async () => {
          const f = formData(body);
          delete f.__file;
          const data = { ...f, id: p.id, brand_id: brand.value, model: model.name || null, category_id: category.value, color_id: p.color_id || null, size_id: f.size_id || null };
          if (photoData) data.photo_data = photoData;
          // Desactivar no saca la mercancía: sigue contando en el valor del inventario (auditoría 2.2).
          if (p.active && !f.active && p.stock > 0
            && !(await confirmDialog(`Quedan ${p.stock} unidades de esta variante. Al desactivarla deja de aparecer en la venta, pero sigue contando en el valor del inventario. Si ya no están en la tienda, haga antes un ajuste de existencia.`, { title: 'Desactivar variante', okLabel: 'Desactivar' }))) return false;
          await api('products.save', data);
          toast('Variante guardada.');
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
    $('#m-export', tb).onclick = () => exportExcel('movimientos-inventario', cols, render());
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
        <button class="btn" id="ct-cycle" title="Lo que toca contar esta semana: lo que más se vende, más seguido">${icon('history')} Conteo sugerido</button>
        <button class="btn" id="ct-sheet">${icon('print')} Hoja de conteo</button>
        <button class="btn" id="ct-clear">Empezar de nuevo</button>
        <button class="btn primary" id="ct-review">Revisar y aplicar</button>`,
    });
    const cycleBox = el(html`<div class="info-box hidden" id="ct-cycle-info"></div>`);
    page.appendChild(cycleBox);
    let suggested = null;
    const info = el(html`<div class="info-box">Cuente con la tienda cerrada o sin vender. Escriba lo contado, o escanee cada gorra con el lector (cada lectura suma 1). <b>Los productos que deje vacíos no se tocan.</b> Nada cambia hasta pulsar <b>Revisar y aplicar</b>.</div>`);
    page.appendChild(info);
    const status = el(html`<div class="stats"></div>`);
    page.appendChild(status);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);

    setHTML(box, html`<div class="table-wrap"><table class="table" id="ct-table"><thead><tr><th>Producto</th><th>SKU / código</th><th class="r">Sistema</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>
      ${products.map((p) => html`<tr data-id="${p.id}"><td><b>${p.name}</b> <span data-cls="${p.id}"></span><div class="muted small">${[p.brand, p.color, p.size].filter(Boolean).join(' · ')}</div></td>
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
        rowOf(p.id).classList.toggle('hidden', (q && !text.includes(q)) || (pending && draft.counts[p.id] !== undefined) || (suggested && !suggested.has(p.id)));
      }
    };
    $('#ct-filter', tb).oninput = debounce(applyFilter, 150);
    // Conteo cíclico (1.5): muestra solo lo que toca contar esta semana, con su clase A, B o C.
    $('#ct-cycle', tb).onclick = async () => {
      if (suggested) {
        suggested = null;
        cycleBox.classList.add('hidden');
        $$('[data-cls]', box).forEach((x) => setHTML(x, ''));
        return applyFilter();
      }
      const c = await api('products.cycleCount', {});
      suggested = new Set(c.rows.map((r) => r.id));
      for (const r of c.rows) {
        const cell = $(`[data-cls="${r.id}"]`, box);
        if (cell) setHTML(cell, html`<span class="badge ${r.class === 'A' ? 'danger' : r.class === 'B' ? 'warn' : 'muted'}" title="Se cuenta cada ${r.every_days} días">${r.class}</span> <small class="muted">${r.days_since === null ? 'nunca contada' : `contada hace ${r.days_since} días`}</small>`);
      }
      setHTML(cycleBox, html`${icon('history')} <div><b>Conteo sugerido de esta semana: ${c.rows.length} ${c.rows.length === 1 ? 'gorra' : 'gorras'}</b>${c.due > c.rows.length ? ` (de ${c.due} que tocan; el resto sale la semana que viene)` : ''}.
        A = lo que más se vende, cada ${c.every_days.A} días · B, cada ${c.every_days.B} · C, cada ${c.every_days.C}. Las que cuente, aunque coincidan, salen de la lista. <a href="#" id="ct-cycle-all">Ver todas</a></div>`);
      cycleBox.classList.remove('hidden');
      $('#ct-cycle-all', cycleBox).onclick = (e) => { e.preventDefault(); $('#ct-cycle', tb).click(); };
      if (!c.rows.length) toast('No hay nada pendiente: todo está contado a tiempo.');
      applyFilter();
    };
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
