'use strict';
/* Reposición (1.9, DT-48): qué comprar según el ritmo de venta, y la mercancía sin movimiento. */

const RESTOCK_WINDOWS = [[15, '15 días'], [30, '30 días'], [60, '60 días'], [90, '90 días']];
const COVER_WINDOWS = [[15, '15 días'], [30, '30 días'], [45, '45 días'], [60, '60 días']];

App.register({
  id: 'restock', title: 'Reposición', icon: 'restock', group: 'Inventario', roles: ['admin'],
  async render(page, params = {}) {
    const state = { tab: params.tab === 'stagnant' ? 'stagnant' : 'buy', days: 30, cover: 30, still: Number(params.days) || 60 };
    const tb = toolbar(page, {
      left: html`<div class="seg" id="rs-tabs"><button data-t="buy">${icon('restock')} Qué comprar</button><button data-t="stagnant">${icon('history')} Sin movimiento</button></div>`,
      right: html`<button class="btn" id="rs-export">${icon('download')} Exportar</button>`,
    });
    const box = el(html`<div></div>`);
    page.appendChild(box);
    let current = { cols: [], rows: [], name: 'reposicion' };

    const nameOf = (r) => html`<b>${r.name}</b><div class="muted small">${[r.brand, r.model, r.color, r.size, r.sku].filter(Boolean).join(' · ')}</div>`;
    const label = (r) => [r.name, r.color, r.size].filter(Boolean).join(' · ');

    const drawBuy = async () => {
      const r = await api('products.restock', { days: state.days, cover: state.cover });
      const typed = {};
      const cols = [
        { key: 'name', label: 'Producto', cls: 'col-product', render: nameOf, csv: label },
        { key: 'available', label: 'Disponible', num: true },
        { key: 'min_stock', label: 'Mínimo', num: true },
        { key: 'sold', label: `Vendidas (${r.days} d)`, num: true },
        { key: 'per_week', label: 'Por semana', align: 'right', render: (x) => (x.per_week ? x.per_week.toLocaleString('es-DO', { maximumFractionDigits: 1 }) : '—'), csv: (x) => x.per_week },
        { key: 'days_left', label: 'Alcanza para', render: (x) => (x.days_left === null ? html`<span class="muted">Sin ventas</span>` : badge(x.days_left <= 7 ? 'agotado' : x.days_left <= 15 ? 'bajo' : 'ok', x.days_left === 0 ? 'Se acabó' : `${x.days_left} ${x.days_left === 1 ? 'día' : 'días'}`)), csv: (x) => x.days_left ?? '' },
        { key: 'suggested', label: 'Comprar', align: 'right', render: (x) => html`<input class="num qty-input" type="number" min="0" step="1" data-buy="${x.id}" value="${x.suggested}">`, csv: (x) => x.suggested, total: true },
        { key: 'cost_total', label: 'Costo estimado', money: true, total: true },
      ];
      current = { cols, rows: r.rows, name: 'reposicion' };
      setHTML(box, html`
        <div class="rs-controls">Según lo vendido en los últimos <select id="rs-days">${options(RESTOCK_WINDOWS, state.days)}</select> para que alcance <select id="rs-cover">${options(COVER_WINDOWS, state.cover)}</select> más el stock mínimo.</div>
        <div class="stats">
          ${statCard('Productos a reponer', Fmt.num(r.rows.length), { iconName: 'restock', tone: r.rows.length ? 'warn' : '' })}
          ${statCard('Unidades sugeridas', Fmt.num(r.units), { iconName: 'box' })}
          ${statCard('Costo estimado', Fmt.money(r.cost), { iconName: 'wallet', tone: 'brand', sub: 'Al costo promedio de hoy' })}
        </div>
        <div class="card" id="rs-table"></div>
        ${r.rows.length ? html`<div class="row-end rs-actions"><button class="btn primary" id="rs-buy">${icon('truck')} Crear compra con estas cantidades</button></div>` : ''}`);
      setHTML($('#rs-table', box), table({ columns: cols, rows: r.rows, clickable: true, empty: emptyState({ icon: 'check', title: 'No hace falta comprar nada', text: 'Todas las gorras alcanzan para ese tiempo según su ritmo de venta.' }) }));
      onRowClick($('#rs-table', box), r.rows, (x) => productDetail(x.id, drawBuy));
      $$('[data-buy]', box).forEach((i) => (i.oninput = () => { typed[i.dataset.buy] = Math.max(0, parseInt(i.value, 10) || 0); }));
      $('#rs-days', box).onchange = (e) => { state.days = Number(e.target.value); drawBuy(); };
      $('#rs-cover', box).onchange = (e) => { state.cover = Number(e.target.value); drawBuy(); };
      const buy = $('#rs-buy', box);
      if (buy) buy.onclick = () => {
        const lines = r.rows.map((x) => ({ product_id: x.id, qty: typed[x.id] ?? x.suggested })).filter((l) => l.qty > 0);
        if (!lines.length) return toast('Todas las cantidades están en 0.', 'error');
        App.go('purchase-new', { lines });
      };
    };

    const drawStill = async () => {
      const r = await api('products.stagnant', { days: state.still });
      const cols = [
        { key: 'name', label: 'Producto', cls: 'col-product', render: nameOf, csv: label },
        { key: 'stock', label: 'Existencia', num: true, total: true },
        { key: 'value', label: 'Valor al costo', money: true, total: true },
        { key: 'price_retail', label: 'Precio detalle', money: true },
        { key: 'last_sale', label: 'Última venta', render: (x) => (x.last_sale ? Fmt.date(x.last_sale) : html`<span class="muted">Nunca</span>`), csv: (x) => x.last_sale || '' },
        { key: 'days_without_sale', label: 'Sin vender', align: 'right', render: (x) => badge(x.days_without_sale >= 90 ? 'agotado' : 'bajo', `${Fmt.num(x.days_without_sale)} días`), csv: (x) => x.days_without_sale },
      ];
      current = { cols, rows: r.rows, name: 'sin-movimiento' };
      setHTML(box, html`
        <div class="rs-controls">Gorras con existencia que no se venden hace <div class="seg" id="rs-still">${[30, 60, 90].map((d) => html`<button data-d="${d}" class="${d === state.still ? 'active' : ''}">${d} días</button>`)}</div></div>
        <div class="stats">
          ${statCard('Productos sin movimiento', Fmt.num(r.count), { iconName: 'history', tone: r.count ? 'warn' : '' })}
          ${statCard('Unidades paradas', Fmt.num(r.units), { iconName: 'box' })}
          ${statCard('Dinero parado (al costo)', Fmt.money(r.value), { iconName: 'wallet', tone: 'brand', sub: 'Considere una oferta o un combo' })}
        </div>
        <div class="card" id="rs-table"></div>`);
      setHTML($('#rs-table', box), table({ columns: cols, rows: r.rows, clickable: true, empty: emptyState({ icon: 'check', title: 'Todo se está moviendo', text: `Ninguna gorra lleva ${state.still} días sin venderse.` }) }));
      onRowClick($('#rs-table', box), r.rows, (x) => productDetail(x.id, drawStill));
      $$('#rs-still [data-d]', box).forEach((b) => (b.onclick = () => { state.still = Number(b.dataset.d); drawStill(); }));
    };

    const draw = () => {
      $$('#rs-tabs [data-t]', tb).forEach((b) => b.classList.toggle('active', b.dataset.t === state.tab));
      return state.tab === 'buy' ? drawBuy() : drawStill();
    };
    $$('#rs-tabs [data-t]', tb).forEach((b) => (b.onclick = () => { state.tab = b.dataset.t; draw(); }));
    $('#rs-export', tb).onclick = () => exportExcel(current.name, current.cols, current.rows);
    await draw();
  },
});
