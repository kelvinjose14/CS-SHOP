'use strict';
/* Dashboard, contabilidad, flujo de dinero, reportes e historial. */

App.register({
  id: 'dashboard', title: 'Inicio', icon: 'home', group: 'Principal',
  async render(page) {
    const d = await api('reports.dashboard');
    const admin = App.isAdmin();
    const inv = d.inventory;
    page.appendChild(el(html`
      <div class="dash">
        <div class="stats">
          ${statCard('Ventas de hoy', Fmt.money(d.sales_today), { tone: 'brand', iconName: 'receipt', sub: `${d.sales_today_count} ventas` })}
          ${statCard('Ventas del mes', Fmt.money(d.sales_month), { iconName: 'chart', sub: `${d.sales_month_count} ventas` })}
          ${admin ? statCard('Ganancia bruta (mes)', Fmt.money(d.gross_profit_month), { iconName: 'tag', tone: 'ok' }) : ''}
          ${admin ? statCard('Ganancia neta (mes)', Fmt.money(d.net_profit_month), { iconName: 'wallet', tone: d.net_profit_month >= 0 ? 'ok' : 'danger', sub: 'Después de gastos' }) : ''}
          ${admin ? statCard('Gastos del mes', Fmt.money(d.expenses_month), { iconName: 'outbox' }) : ''}
          ${admin ? statCard('Compras del mes', Fmt.money(d.purchases_month), { iconName: 'truck' }) : ''}
          ${statCard('Me deben (cuentas por cobrar)', Fmt.money(d.receivables), { iconName: 'inbox', tone: d.receivables_overdue ? 'warn' : '', sub: d.receivables_overdue ? `Vencido: ${Fmt.money(d.receivables_overdue)}` : '' })}
          ${admin ? statCard('Debo (cuentas por pagar)', Fmt.money(d.payables), { iconName: 'outbox', tone: d.payables_overdue ? 'warn' : '', sub: d.payables_overdue ? `Vencido: ${Fmt.money(d.payables_overdue)}` : '' }) : ''}
          ${statCard(d.cash_open ? 'Efectivo en caja' : 'Efectivo (último cierre)', Fmt.money(d.cash), { iconName: 'cash', sub: d.cash_open ? 'Caja abierta' : 'Caja cerrada' })}
          ${admin ? statCard('Invertido en mercancía', Fmt.money(inv.value_cost), { iconName: 'box', tone: 'brand', sub: `${Fmt.num(inv.units)} unidades · a precio de venta ${Fmt.money(inv.value_retail)}` }) : statCard('Unidades en inventario', Fmt.num(inv.units), { iconName: 'box' })}
        </div>
        <div class="dash-grid">
          <div class="card span-2">
            <div class="card-head"><h3>Últimos 30 días</h3></div>
            ${admin
              ? barChart(d.series, { keys: ['sales', 'gross_profit', 'expenses'], labels: ['Ventas', 'Ganancia bruta', 'Gastos'], colors: ['var(--brand)', 'var(--ok)', 'var(--chart-3)'], formatX: shortDate })
              : barChart(d.series, { keys: ['sales'], labels: ['Ventas'], colors: ['var(--brand)'], formatX: shortDate })}
          </div>
          <div class="card">
            <div class="card-head"><h3>Gorras más vendidas (mes)</h3><button class="link" data-go="${admin ? 'reports' : 'sales'}">Ver más</button></div>
            ${d.top_products.length ? html`<ol class="top-list">${d.top_products.map((p) => html`
              <li>${productThumb(p, 34)}<div><b>${p.name}</b><small>${[p.color, p.size].filter(Boolean).join(' · ')} · exist. ${p.stock}</small></div><span class="qty-pill">${p.qty}</span></li>`)}</ol>` : html`<div class="empty">Sin ventas este mes.</div>`}
          </div>
          <div class="card">
            <div class="card-head"><h3>${icon('alert')} Por reponer</h3><button class="link" data-go="products">Inventario</button></div>
            ${d.out_of_stock.length + d.low_stock.length ? html`<ul class="stock-list">
              ${d.out_of_stock.map((p) => html`<li><span>${productLabel(p)}</span>${badge('agotado')}</li>`)}
              ${d.low_stock.map((p) => html`<li><span>${productLabel(p)}</span><span class="badge warn">Quedan ${p.stock} (mín. ${p.min_stock})</span></li>`)}
            </ul>` : html`<div class="empty ok">Todo el inventario está sobre el mínimo.</div>`}
          </div>
          ${admin ? html`
          <div class="card span-2">
            <div class="card-head"><h3>Respuestas rápidas</h3></div>
            <div class="qa">
              <div><span>¿Cuánto inventario tengo?</span><b>${Fmt.num(inv.units)} gorras (${Fmt.num(inv.products)} productos)</b></div>
              <div><span>¿Cuánto tengo invertido en mercancía?</span><b>${Fmt.money(inv.value_cost)}</b></div>
              <div><span>¿Cuánto vendí hoy?</span><b>${Fmt.money(d.sales_today)}</b></div>
              <div><span>¿Cuánto gané realmente este mes?</span><b class="${d.net_profit_month >= 0 ? 'text-ok' : 'text-danger'}">${Fmt.money(d.net_profit_month)}</b></div>
              <div><span>¿Cuánto gasté este mes?</span><b>${Fmt.money(d.expenses_month)}</b></div>
              <div><span>¿Quién me debe dinero?</span><b><a href="#" data-go="receivables">${Fmt.money(d.receivables)}</a></b></div>
              <div><span>¿A qué proveedores les debo?</span><b><a href="#" data-go="payables">${Fmt.money(d.payables)}</a></b></div>
              <div><span>¿Qué debo volver a comprar?</span><b><a href="#" data-go="products">${d.out_of_stock.length + d.low_stock.length} productos</a></b></div>
              <div><span>¿Cuánto dinero debería tener en caja?</span><b>${Fmt.money(d.cash)}</b></div>
            </div>
          </div>` : ''}
        </div>
      </div>`));
    $$('[data-go]', page).forEach((a) => (a.onclick = (e) => { e.preventDefault(); App.go(a.dataset.go); }));
  },
});

App.register({
  id: 'accounting', title: 'Contabilidad y ganancias', icon: 'chart', group: 'Análisis', roles: ['admin'],
  async render(page) {
    const tb = toolbar(page, { right: html`<button class="btn" id="ac-pdf">${icon('download')} PDF</button>` });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const box = el(html`<div class="report-area"></div>`);
    page.appendChild(box);
    const load = async (range) => {
      const r = await api('reports.profit', range);
      const s = r.sales;
      setHTML(box, html`
        ${reportHeader('Estado de resultados', r)}
        <div class="stats">
          ${statCard('Ventas netas', Fmt.money(s.net), { tone: 'brand', iconName: 'receipt', sub: `${s.count} ventas` })}
          ${statCard('Costo de mercancía vendida', Fmt.money(r.cogs), { iconName: 'box' })}
          ${statCard('Ganancia bruta', Fmt.money(r.gross_profit), { tone: 'ok', iconName: 'tag', sub: `Margen ${Fmt.pct(r.gross_margin)}` })}
          ${statCard('Gastos', Fmt.money(r.expenses), { iconName: 'outbox' })}
          ${statCard('Ganancia neta', Fmt.money(r.net_profit), { tone: r.net_profit >= 0 ? 'ok' : 'danger', iconName: 'wallet', sub: `Margen ${Fmt.pct(r.net_margin)}` })}
        </div>
        <div class="dash-grid">
          <div class="card">
            <h3>Estado de resultados</h3>
            <table class="statement">
              <tr class="head"><td>Ingresos</td><td></td></tr>
              <tr><td class="in1">Ventas al detalle</td><td>${Fmt.money(s.retail)}</td></tr>
              <tr><td class="in1">Ventas al por mayor</td><td>${Fmt.money(s.wholesale)}</td></tr>
              <tr><td class="in1">(−) Devoluciones</td><td class="text-danger">${Fmt.money(-s.returns)}</td></tr>
              <tr class="sub"><td>Ventas netas</td><td>${Fmt.money(s.net)}</td></tr>
              <tr><td class="in1">(−) Costo de los productos vendidos</td><td class="text-danger">${Fmt.money(-r.cogs)}</td></tr>
              <tr class="sub"><td>Ganancia bruta <small>(ventas − costo)</small></td><td>${Fmt.money(r.gross_profit)}</td></tr>
              <tr class="head"><td>Gastos operativos</td><td></td></tr>
              ${r.expenses_by_category.map((e) => html`<tr><td class="in1">${e.category}</td><td class="text-danger">${Fmt.money(-e.amount)}</td></tr>`)}
              <tr class="sub"><td>Total gastos</td><td class="text-danger">${Fmt.money(-r.expenses)}</td></tr>
              <tr><td class="in1">(+) Otros ingresos</td><td>${Fmt.money(r.other_income)}</td></tr>
              <tr class="grand ${r.net_profit < 0 ? 'neg' : ''}"><td>GANANCIA NETA <small>(bruta − gastos + otros ingresos)</small></td><td>${Fmt.money(r.net_profit)}</td></tr>
            </table>
            <p class="muted small">Descuentos otorgados en el período: ${Fmt.money(s.discounts)} · Ventas de contado ${Fmt.money(s.cash_sales)} · a crédito ${Fmt.money(s.credit_sales)}</p>
          </div>
          <div class="card">
            <h3>Evolución (${r.granularity === 'mes' ? 'por mes' : 'por día'})</h3>
            ${barChart(r.series, { keys: ['sales', 'gross_profit', 'net_profit'], labels: ['Ventas', 'Ganancia bruta', 'Ganancia neta'], colors: ['var(--brand)', 'var(--ok)', 'var(--chart-4)'], formatX: shortDate })}
            ${table({
              columns: [
                { key: 'k', label: r.granularity === 'mes' ? 'Mes' : 'Día', render: (x) => (x.k.length === 7 ? shortDate(x.k) : Fmt.date(x.k)) },
                { key: 'sales', label: 'Ventas', money: true, total: true },
                { key: 'cogs', label: 'Costo', money: true, total: true },
                { key: 'gross_profit', label: 'G. bruta', money: true, total: true },
                { key: 'expenses', label: 'Gastos', money: true, total: true },
                { key: 'net_profit', label: 'G. neta', money: true, total: true },
              ],
              rows: r.series.filter((x) => x.sales || x.cogs || x.expenses || x.other).reverse(),
              empty: 'Sin movimientos.',
            })}
          </div>
        </div>`);
    };
    $('#ac-pdf', tb).onclick = () => exportPdf('estado-de-resultados');
    periodPicker(pp, load, { initial: 'mes' });
  },
});

App.register({
  id: 'cashflow', title: 'Flujo de dinero', icon: 'flow', group: 'Análisis', roles: ['admin'],
  async render(page) {
    const tb = toolbar(page, { right: html`<button class="btn" id="cf-csv">${icon('download')} Exportar</button><button class="btn" id="cf-pdf">${icon('download')} PDF</button>` });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const box = el(html`<div class="report-area"></div>`);
    page.appendChild(box);
    let movements = [];
    const mcols = [
      { key: 'created_at', label: 'Fecha', datetime: true },
      { key: 'label', label: 'Concepto' },
      { key: 'description', label: 'Detalle' },
      { key: 'method', label: 'Método', render: (m) => METHOD_LABELS[m.method], csv: (m) => m.method },
      { key: 'in', label: 'Entrada', align: 'right', render: (m) => (m.direction === 'in' ? html`<span class="text-ok">${Fmt.money(m.amount)}</span>` : ''), csv: (m) => (m.direction === 'in' ? m.amount.toFixed(2) : '') },
      { key: 'out', label: 'Salida', align: 'right', render: (m) => (m.direction === 'out' ? html`<span class="text-danger">${Fmt.money(m.amount)}</span>` : ''), csv: (m) => (m.direction === 'out' ? m.amount.toFixed(2) : '') },
      { key: 'user_name', label: 'Usuario' },
    ];
    const flowList = (items) => (items.length ? html`<div class="bars">${items.map((i) => html`
      <div class="bar-row"><div class="bar-label"><span>${i.label}</span><b>${Fmt.money(i.amount)}</b></div>
      <div class="muted small">${Object.entries(i.methods).map(([m, v]) => `${METHOD_LABELS[m]}: ${Fmt.money(v)}`).join(' · ')}</div></div>`)}</div>` : html`<div class="empty">Sin movimientos.</div>`);
    const load = async (range) => {
      const r = await api('reports.cashflow', range);
      movements = r.movements;
      setHTML(box, html`
        ${reportHeader('Flujo de dinero', r)}
        <div class="stats">
          ${statCard('Dinero que entró', Fmt.money(r.total_in), { tone: 'ok', iconName: 'inbox' })}
          ${statCard('Dinero que salió', Fmt.money(r.total_out), { tone: 'danger', iconName: 'outbox' })}
          ${statCard('Flujo neto', Fmt.money(r.net), { tone: r.net >= 0 ? 'brand' : 'danger', iconName: 'flow' })}
          ${statCard('Vendido', Fmt.money(r.sold), { iconName: 'receipt' })}
          ${statCard('Gastado', Fmt.money(r.spent), { iconName: 'wallet' })}
          ${statCard('Comprado en mercancía', Fmt.money(r.purchased), { iconName: 'truck' })}
          ${statCard('Me deben los clientes', Fmt.money(r.receivables), { iconName: 'users' })}
          ${statCard('Debo a proveedores', Fmt.money(r.payables), { iconName: 'factory' })}
          ${statCard('Efectivo que debería haber en caja', Fmt.money(r.cash_expected), { iconName: 'cash', tone: 'brand' })}
        </div>
        <div class="dash-grid">
          <div class="card"><h3 class="text-ok">Entradas</h3>${flowList(r.inflows)}</div>
          <div class="card"><h3 class="text-danger">Salidas</h3>${flowList(r.outflows)}</div>
          <div class="card span-2"><h3>Por método de pago</h3>${table({
            columns: [
              { key: 'method', label: 'Método', render: (m) => METHOD_LABELS[m.method] },
              { key: 'in', label: 'Entradas', money: true, total: true },
              { key: 'out', label: 'Salidas', money: true, total: true },
              { key: 'net', label: 'Neto', money: true, total: true },
            ],
            rows: r.by_method,
          })}</div>
          <div class="card span-2"><h3>Detalle de movimientos</h3>${table({ columns: mcols, rows: movements, empty: 'Sin movimientos.' })}</div>
        </div>`);
    };
    $('#cf-csv', tb).onclick = () => exportCsv('flujo-de-dinero', mcols, movements);
    $('#cf-pdf', tb).onclick = () => exportPdf('flujo-de-dinero');
    periodPicker(pp, load, { initial: 'mes' });
  },
});

function reportHeader(title, range) {
  return html`
    <div class="report-head">
      <img src="assets/logo.png" alt="">
      <div><h2>${title}</h2><div class="muted">${App.settings.business_name} · ${range.from ? (range.from === range.to ? Fmt.date(range.from) : `Del ${Fmt.date(range.from)} al ${Fmt.date(range.to)}`) : `Al ${Fmt.date(todayStr())}`}</div></div>
      <div class="muted small">Generado ${Fmt.datetime(new Date().toISOString().replace('T', ' '))} por ${App.user.name}</div>
    </div>`;
}

/* ---------- Reportes ---------- */

const REPORTS = [
  { id: 'inventario', title: 'Inventario actual', icon: 'box', noPeriod: true, desc: 'Existencia, precios y estado de cada gorra.',
    load: async () => ({ rows: await api('products.list'), columns: productColumns() }) },
  { id: 'valor', title: 'Valor del inventario', icon: 'wallet', noPeriod: true, desc: 'Dinero invertido al costo y valor a precio de venta.',
    load: async () => {
      const rows = (await api('products.list')).filter((p) => p.stock > 0).map((p) => ({ ...p, v_cost: p.stock * p.cost, v_retail: p.stock * p.price_retail, v_wholesale: p.stock * p.price_wholesale }));
      return { rows, columns: [
        { key: 'name', label: 'Producto', render: (p) => productLabel(p), csv: (p) => productLabel(p) },
        { key: 'brand', label: 'Marca' }, { key: 'sku', label: 'SKU' },
        { key: 'stock', label: 'Existencia', num: true, total: true },
        { key: 'cost', label: 'Costo unit.', money: true },
        { key: 'v_cost', label: 'Valor al costo', money: true, total: true },
        { key: 'v_retail', label: 'Valor al detalle', money: true, total: true },
        { key: 'v_wholesale', label: 'Valor por mayor', money: true, total: true },
      ] };
    } },
  { id: 'movimientos', title: 'Movimientos de inventario', icon: 'swap', desc: 'Entradas y salidas de mercancía.',
    load: async (r) => ({ rows: await api('products.movements', r), columns: [
      { key: 'created_at', label: 'Fecha', datetime: true },
      { key: 'product_name', label: 'Producto', render: (m) => productLabel({ name: m.product_name, color: m.color, size: m.size }), csv: (m) => productLabel({ name: m.product_name, color: m.color, size: m.size }) },
      { key: 'sku', label: 'SKU' }, { key: 'type_label', label: 'Movimiento' },
      { key: 'qty', label: 'Cantidad', num: true }, { key: 'stock_after', label: 'Existencia', num: true },
      { key: 'note', label: 'Detalle' }, { key: 'user_name', label: 'Usuario' },
    ] }) },
  { id: 'compras', title: 'Compras', icon: 'truck', desc: 'Todas las compras de mercancía.',
    load: async (r) => ({ rows: await api('purchases.list', r), columns: PURCHASE_COLUMNS }) },
  { id: 'ventas', title: 'Ventas', icon: 'receipt', desc: 'Todas las ventas del período.',
    load: async (r) => ({ rows: await api('sales.list', r), columns: SALE_COLUMNS() }) },
  { id: 'ventas-detalle', title: 'Ventas al detalle', icon: 'tag', desc: 'Sólo ventas al detalle.',
    load: async (r) => ({ rows: await api('sales.list', { ...r, sale_type: 'detalle' }), columns: SALE_COLUMNS() }) },
  { id: 'ventas-mayor', title: 'Ventas al por mayor', icon: 'box', desc: 'Sólo ventas al por mayor.',
    load: async (r) => ({ rows: await api('sales.list', { ...r, sale_type: 'mayor' }), columns: SALE_COLUMNS() }) },
  { id: 'ganancias', title: 'Ganancias', icon: 'chart', desc: 'Ventas, costo, gastos y ganancia por día o mes.',
    load: async (r) => {
      const p = await api('reports.profit', r);
      return { rows: p.series, columns: [
        { key: 'k', label: 'Período', render: (x) => (x.k.length === 7 ? shortDate(x.k) : Fmt.date(x.k)), csv: (x) => x.k },
        { key: 'sales', label: 'Ventas netas', money: true, total: true },
        { key: 'cogs', label: 'Costo vendido', money: true, total: true },
        { key: 'gross_profit', label: 'Ganancia bruta', money: true, total: true },
        { key: 'other', label: 'Otros ingresos', money: true, total: true },
        { key: 'expenses', label: 'Gastos', money: true, total: true },
        { key: 'net_profit', label: 'Ganancia neta', money: true, total: true },
      ] };
    } },
  { id: 'gastos', title: 'Gastos', icon: 'wallet', desc: 'Gastos por categoría y fecha.',
    load: async (r) => ({ rows: await api('expenses.list', r), columns: [
      { key: 'date', label: 'Fecha', date: true }, { key: 'category', label: 'Categoría' }, { key: 'description', label: 'Descripción' },
      { key: 'method', label: 'Método', render: (e) => METHOD_LABELS[e.method], csv: (e) => e.method },
      { key: 'amount', label: 'Monto', money: true, total: true }, { key: 'user_name', label: 'Usuario' },
    ] }) },
  { id: 'flujo', title: 'Flujo de caja', icon: 'flow', desc: 'Todo el dinero que entró y salió.',
    load: async (r) => {
      const f = await api('reports.cashflow', r);
      return { rows: f.movements, columns: [
        { key: 'created_at', label: 'Fecha', datetime: true }, { key: 'label', label: 'Concepto' }, { key: 'description', label: 'Detalle' },
        { key: 'method', label: 'Método', render: (m) => METHOD_LABELS[m.method], csv: (m) => m.method },
        { key: 'in', label: 'Entrada', money: true, total: true }, { key: 'out', label: 'Salida', money: true, total: true },
      ], transform: (rows) => rows.map((m) => ({ ...m, in: m.direction === 'in' ? m.amount : 0, out: m.direction === 'out' ? m.amount : 0 })) };
    } },
  { id: 'cxc', title: 'Cuentas por cobrar', icon: 'inbox', noPeriod: true, desc: 'Facturas a crédito pendientes de cobro.',
    load: async () => ({ rows: await api('receivables.list'), columns: [
      { key: 'customer_name', label: 'Cliente' }, { key: 'id', label: 'Venta', render: (r) => Fmt.saleNo(r.id), csv: (r) => Fmt.saleNo(r.id) },
      { key: 'date', label: 'Fecha', date: true }, { key: 'total', label: 'Total', money: true, total: true },
      { key: 'paid', label: 'Pagado', money: true, total: true }, { key: 'balance', label: 'Balance', money: true, total: true },
      { key: 'due_date', label: 'Vence', date: true }, { key: 'status', label: 'Estado', render: accountBadge, csv: (r) => (r.overdue ? 'vencido' : r.status) },
    ] }) },
  { id: 'cxp', title: 'Cuentas por pagar', icon: 'outbox', noPeriod: true, desc: 'Compras a crédito pendientes de pago.',
    load: async () => ({ rows: await api('payables.list'), columns: [
      { key: 'supplier_name', label: 'Proveedor' }, { key: 'id', label: 'Compra', render: (r) => Fmt.purchaseNo(r.id), csv: (r) => Fmt.purchaseNo(r.id) },
      { key: 'date', label: 'Fecha', date: true }, { key: 'total', label: 'Total', money: true, total: true },
      { key: 'paid', label: 'Pagado', money: true, total: true }, { key: 'balance', label: 'Balance', money: true, total: true },
      { key: 'due_date', label: 'Vence', date: true }, { key: 'status', label: 'Estado', render: accountBadge, csv: (r) => (r.overdue ? 'vencido' : r.status) },
    ] }) },
  { id: 'clientes', title: 'Clientes', icon: 'users', noPeriod: true, desc: 'Lista de clientes con compras y balance.',
    load: async () => ({ rows: await api('customers.list', { includeInactive: true }), columns: [
      { key: 'name', label: 'Cliente' }, { key: 'phone', label: 'Teléfono' }, { key: 'document', label: 'Cédula/RNC' }, { key: 'email', label: 'Correo' },
      { key: 'total_bought', label: 'Total comprado', money: true, total: true }, { key: 'balance', label: 'Balance', money: true, total: true },
      { key: 'last_purchase', label: 'Última compra', date: true },
    ] }) },
  { id: 'proveedores', title: 'Proveedores', icon: 'factory', noPeriod: true, desc: 'Lista de proveedores con compras y balance.',
    load: async () => ({ rows: await api('suppliers.list', { includeInactive: true }), columns: [
      { key: 'name', label: 'Proveedor' }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo' }, { key: 'address', label: 'Dirección' },
      { key: 'total_purchased', label: 'Total comprado', money: true, total: true }, { key: 'balance', label: 'Balance', money: true, total: true },
      { key: 'last_purchase', label: 'Última compra', date: true },
    ] }) },
  { id: 'top', title: 'Productos más vendidos', icon: 'chart', desc: 'Ranking de gorras por unidades vendidas.',
    load: async (r) => ({ rows: (await api('reports.topProducts', { ...r, limit: 200 })).rows, columns: [
      { key: 'name', label: 'Producto', render: (p) => productLabel(p), csv: (p) => productLabel(p) },
      { key: 'brand', label: 'Marca' }, { key: 'sku', label: 'SKU' },
      { key: 'qty', label: 'Unidades vendidas', num: true, total: true },
      { key: 'revenue', label: 'Ventas', money: true, total: true },
      { key: 'cost', label: 'Costo', money: true, total: true },
      { key: 'profit', label: 'Ganancia', money: true, total: true },
      { key: 'stock', label: 'Existencia', num: true },
    ] }) },
];

App.register({
  id: 'reports', title: 'Reportes', icon: 'file', group: 'Análisis', roles: ['admin'],
  async render(page, params) {
    const rep = REPORTS.find((r) => r.id === params.report);
    if (!rep) {
      page.appendChild(el(html`<div class="report-grid">${REPORTS.map((r) => html`
        <button class="report-card" data-r="${r.id}">${icon(r.icon)}<b>${r.title}</b><span>${r.desc}</span></button>`)}</div>`));
      $$('[data-r]', page).forEach((b) => (b.onclick = () => App.go('reports', { report: b.dataset.r })));
      return;
    }
    $('#page-title').textContent = `Reportes · ${rep.title}`;
    const tb = toolbar(page, {
      left: html`<button class="btn" id="r-back">← Todos los reportes</button>`,
      right: html`<button class="btn" id="r-csv">${icon('download')} Excel (CSV)</button><button class="btn" id="r-pdf">${icon('download')} PDF</button><button class="btn" id="r-print">${icon('print')} Imprimir</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const box = el(html`<div class="report-area"></div>`);
    page.appendChild(box);
    let current = { rows: [], columns: [] };
    const load = async (range) => {
      const res = await rep.load(range || {});
      const rows = res.transform ? res.transform(res.rows) : res.rows;
      current = { rows, columns: res.columns };
      setHTML(box, html`${reportHeader(rep.title, range || {})}<div class="card">${table({ columns: res.columns.filter((c) => !c.hide), rows, empty: 'Sin datos para este reporte.' })}</div><p class="muted small">${rows.length} registros</p>`);
    };
    $('#r-back', tb).onclick = () => App.go('reports');
    $('#r-csv', tb).onclick = () => exportCsv(rep.id, current.columns, current.rows);
    $('#r-pdf', tb).onclick = () => exportPdf(`reporte-${rep.id}`, { landscape: current.columns.length > 7 });
    $('#r-print', tb).onclick = async () => { document.body.classList.add('printing'); try { await window.capsApi.printPage(); } finally { document.body.classList.remove('printing'); } };
    if (rep.noPeriod) await load();
    else periodPicker(pp, load, { initial: 'mes' });
  },
});

const AUDIT_LABELS = {
  inicio_sesion: 'Inicio de sesión', cambio_contrasena: 'Cambio de contraseña', crear_usuario: 'Usuario creado', editar_usuario: 'Usuario editado',
  editar_configuracion: 'Configuración', crear_producto: 'Producto creado', editar_producto: 'Producto editado', cambio_precio: 'Cambio de precio/costo',
  ajuste_inventario: 'Ajuste de inventario', crear_proveedor: 'Proveedor creado', editar_proveedor: 'Proveedor editado', registrar_compra: 'Compra',
  pago_proveedor: 'Pago a proveedor', anular_compra: 'Compra anulada', crear_cliente: 'Cliente creado', editar_cliente: 'Cliente editado',
  registrar_venta: 'Venta', abono_cliente: 'Abono de cliente', devolucion: 'Devolución', anular_venta: 'Venta anulada',
  registrar_gasto: 'Gasto', anular_gasto: 'Gasto anulado', registrar_ingreso: 'Otro ingreso', anular_ingreso: 'Ingreso anulado',
  apertura_caja: 'Apertura de caja', cierre_caja: 'Cierre de caja', retiro_caja: 'Retiro de caja', entrada_caja: 'Entrada a caja',
};

function auditDetails(d) {
  if (!d) return '';
  try {
    const o = JSON.parse(d);
    return Object.entries(o).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => {
      if (v && typeof v === 'object' && 'antes' in v) return `${k.replace(/_/g, ' ')}: ${v.antes} → ${v.despues}`;
      if (Array.isArray(v)) return `${k}: ${v.join(', ')}`;
      if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
      return `${k.replace(/_/g, ' ')}: ${v}`;
    }).join(' · ');
  } catch {
    return d;
  }
}

App.register({
  id: 'audit', title: 'Historial de movimientos', icon: 'history', group: 'Análisis', roles: ['admin'],
  async render(page) {
    const users = await api('users.list');
    const f = { action: '', user_id: '', search: '' };
    let range = {};
    const tb = toolbar(page, {
      left: html`
        <select data-f="action">${options(Object.entries(AUDIT_LABELS).sort((a, b) => a[1].localeCompare(b[1])), '', { empty: 'Todas las acciones' })}</select>
        <select data-f="user_id">${options(users.map((u) => [u.id, u.name]), '', { empty: 'Todos los usuarios' })}</select>
        <div class="search">${icon('search')}<input data-f="search" placeholder="Buscar en el detalle…"></div>`,
      right: html`<button class="btn" id="au-export">${icon('download')} Exportar</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'created_at', label: 'Fecha y hora', datetime: true },
      { key: 'user_name', label: 'Usuario' },
      { key: 'action', label: 'Acción', render: (r) => html`<span class="chip">${AUDIT_LABELS[r.action] || r.action}</span>`, csv: (r) => AUDIT_LABELS[r.action] || r.action },
      { key: 'entity_id', label: 'Ref.', render: (r) => (r.entity === 'venta' ? Fmt.saleNo(r.entity_id) : r.entity === 'compra' ? Fmt.purchaseNo(r.entity_id) : r.entity_id ? `${r.entity} #${r.entity_id}` : '') },
      { key: 'details', label: 'Detalle', render: (r) => auditDetails(r.details), csv: (r) => auditDetails(r.details), cls: 'wrap' },
    ];
    const load = async () => {
      rows = await api('reports.audit', { ...range, ...f });
      setHTML(box, table({ columns: cols, rows, empty: 'Sin registros.' }));
    };
    $$('[data-f]', tb).forEach((i) => (i[i.tagName === 'INPUT' ? 'oninput' : 'onchange'] = debounce(() => { f[i.dataset.f] = i.value; load(); }, 200)));
    $('#au-export', tb).onclick = () => exportCsv('historial', cols, rows);
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'semana' });
  },
});
