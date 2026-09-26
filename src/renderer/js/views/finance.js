'use strict';
/* Gastos, otros ingresos y caja. */

const financeTabs = (active) => html`<div class="seg"><button data-go="expenses" class="${active === 'gasto' ? 'active' : ''}">Gastos</button><button data-go="incomes" class="${active === 'ingreso' ? 'active' : ''}">Otros ingresos</button><button data-go="capital" class="${active === 'aporte' ? 'active' : ''}">Aportes del dueño</button></div>`;

function entryScreen({ kind }) {
  const isExpense = kind === 'gasto';
  const apiBase = isExpense ? 'expenses' : 'incomes';
  const catKey = isExpense ? 'expense_categories' : 'income_categories';
  return async (page) => {
    let range = {};
    let category = '';
    const cats = JSON.parse(App.settings[catKey] || '[]');
    const tb = toolbar(page, {
      left: html`${financeTabs(kind)}
        <select id="e-cat">${options(cats, '', { empty: 'Todas las categorías' })}</select>`,
      right: html`<button class="btn" id="e-export">${icon('download')} Exportar</button><button class="btn primary" id="e-new">${icon('plus')} ${isExpense ? 'Registrar gasto' : 'Registrar ingreso'}</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    const wrap = el(html`<div class="split"><div class="card" id="e-list"></div><div class="card side" id="e-cats"></div></div>`);
    page.appendChild(wrap);
    let rows = [];
    const cols = [
      { key: 'date', label: 'Fecha', date: true },
      { key: 'category', label: 'Categoría', render: (r) => html`<span class="chip">${r.category}</span>`, csv: (r) => r.category },
      { key: 'description', label: 'Descripción' },
      { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method], csv: (r) => r.method },
      { key: 'amount', label: 'Monto', money: true, total: true },
      { key: 'user_name', label: 'Registrado por' },
      { key: 'created_at', label: 'Registro', datetime: true },
      { label: '', render: () => html`<button class="icon-btn danger" data-void title="Anular">${icon('trash')}</button>`, csv: false },
    ];
    const load = async () => {
      rows = await api(`${apiBase}.list`, { ...range, category });
      setHTML($('#e-list', wrap), table({ columns: cols, rows, empty: isExpense ? 'No hay gastos en el período.' : 'No hay ingresos en el período.' }));
      $$('#e-list tbody tr[data-idx]', wrap).forEach((tr) => {
        const r = rows[Number(tr.dataset.idx)];
        const b = $('[data-void]', tr);
        if (b) b.onclick = async () => {
          const reason = await promptDialog({ title: `Anular ${isExpense ? 'gasto' : 'ingreso'}`, label: `Motivo · ${r.category} ${Fmt.money(r.amount)}` });
          if (!reason) return;
          await api(`${apiBase}.void`, { id: r.id, reason });
          toast('Registro anulado.');
          App.refreshCashBadge();
          load();
        };
      });
      const byCat = {};
      rows.forEach((r) => (byCat[r.category] = (byCat[r.category] || 0) + r.amount));
      const total = rows.reduce((s, r) => s + r.amount, 0);
      setHTML($('#e-cats', wrap), html`
        <h3>${isExpense ? 'Gastos' : 'Ingresos'} por categoría</h3>
        <div class="total-big">${Fmt.money(total)}</div>
        <div class="bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => html`
          <div class="bar-row"><div class="bar-label"><span>${c}</span><b>${Fmt.money(v)}</b></div><div class="bar"><i style="width:${total ? (v / total) * 100 : 0}%"></i></div></div>`)}
        </div>`);
    };
    $$('[data-go]', tb).forEach((b) => (b.onclick = () => App.go(b.dataset.go)));
    $('#e-cat', tb).onchange = (e) => { category = e.target.value; load(); };
    $('#e-export', tb).onclick = () => exportCsv(isExpense ? 'gastos' : 'otros-ingresos', cols, rows);
    $('#e-new', tb).onclick = () => modal({
      title: isExpense ? 'Registrar gasto' : 'Registrar otro ingreso',
      width: 520,
      body: html`
        <div class="grid-2">
          <label class="field"><span>Categoría *</span><select name="category">${options(cats, cats[0])}</select></label>
          <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayStr()}"></label>
          <label class="field span-2"><span>Descripción</span><input name="description" placeholder="${isExpense ? 'Ej. Pago de luz de agosto' : 'Ej. Venta de cajas vacías'}"></label>
          <label class="field"><span>Monto *</span><input name="amount" type="number" min="0.01" step="0.01"></label>
          <label class="field"><span>Método de pago</span><select name="method">${methodOptions()}</select></label>
        </div>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar', primary: true,
          onClick: async ({ body }) => {
            await api(`${apiBase}.create`, formData(body));
            toast(isExpense ? 'Gasto registrado.' : 'Ingreso registrado.');
            App.refreshCashBadge();
            load();
          },
        },
      ],
    });
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'mes' });
  };
}

App.register({ id: 'expenses', title: 'Gastos', icon: 'wallet', group: 'Finanzas', roles: ['admin'], render: entryScreen({ kind: 'gasto' }) });
App.register({ id: 'incomes', title: 'Otros ingresos', icon: 'inbox', group: 'Finanzas', roles: ['admin'], hidden: true, navAs: 'expenses', render: entryScreen({ kind: 'ingreso' }) });

// Aportes de capital del dueño (DT-21): entran al flujo de dinero, pero no son ganancia.
App.register({
  id: 'capital', title: 'Aportes del dueño', icon: 'inbox', group: 'Finanzas', roles: ['admin'], hidden: true, navAs: 'expenses',
  async render(page) {
    let range = {};
    const tb = toolbar(page, {
      left: financeTabs('aporte'),
      right: html`<button class="btn" id="c-export">${icon('download')} Exportar</button><button class="btn primary" id="c-new">${icon('plus')} Registrar aporte</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    page.appendChild(el(html`<div class="info-box">Dinero que el dueño pone en el negocio (por ejemplo, para comprar mercancía). Aparece en el <b>Flujo de dinero</b>, pero <b>no suma a la ganancia</b>: no lo produjo la tienda.</div>`));
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'date', label: 'Fecha', date: true },
      { key: 'description', label: 'Descripción' },
      { key: 'method', label: 'Método', render: (r) => METHOD_LABELS[r.method], csv: (r) => r.method },
      { key: 'amount', label: 'Monto', money: true, total: true },
      { key: 'user_name', label: 'Registrado por' },
      { label: '', render: () => html`<button class="icon-btn danger" data-void title="Anular">${icon('trash')}</button>`, csv: false },
    ];
    const load = async () => {
      rows = await api('capital.list', range);
      setHTML(box, table({ columns: cols, rows, empty: 'No hay aportes en el período.' }));
      $$('tbody tr[data-idx]', box).forEach((tr) => {
        const r = rows[Number(tr.dataset.idx)];
        $('[data-void]', tr).onclick = async () => {
          const reason = await promptDialog({ title: 'Anular aporte', label: `Motivo · ${Fmt.money(r.amount)}` });
          if (!reason) return;
          await api('capital.void', { id: r.id, reason });
          toast('Aporte anulado.');
          App.refreshCashBadge();
          load();
        };
      });
    };
    $$('[data-go]', tb).forEach((b) => (b.onclick = () => App.go(b.dataset.go)));
    $('#c-export', tb).onclick = () => exportCsv('aportes-del-dueno', cols, rows);
    $('#c-new', tb).onclick = () => modal({
      title: 'Registrar aporte del dueño',
      width: 480,
      body: html`
        <div class="grid-2">
          <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayStr()}"></label>
          <label class="field"><span>Monto *</span><input name="amount" type="number" min="0.01" step="0.01"></label>
          <label class="field"><span>Método</span><select name="method">${methodOptions('transferencia')}</select></label>
          <label class="field span-2"><span>Descripción</span><input name="description" placeholder="Ej. Capital para la compra de septiembre"></label>
        </div>`,
      actions: [
        { label: 'Cancelar' },
        { label: 'Guardar', primary: true, onClick: async ({ body }) => { await api('capital.create', formData(body)); toast('Aporte registrado.'); App.refreshCashBadge(); load(); } },
      ],
    });
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'anio' });
  },
});

App.register({
  id: 'cash', title: 'Caja', icon: 'cash', group: 'Finanzas',
  async render(page) {
    const st = await api('cash.status');
    const admin = App.isAdmin();
    if (!st.open) {
      const last = st.last_closed;
      page.appendChild(el(html`
        <div class="cash-closed card">
          <div class="cash-icon">${icon('cash', 'huge')}</div>
          <h2>La caja de esta computadora está cerrada</h2>
          ${st.terminal ? html`<p class="muted">${icon('pc')} ${st.terminal.name}</p>` : ''}
          ${last ? html`<p class="muted">Último cierre: ${Fmt.datetime(last.closed_at)} · Efectivo contado ${Fmt.money(last.counted_amount)} · Diferencia <b class="${last.difference < 0 ? 'text-danger' : last.difference > 0 ? 'text-warn' : 'text-ok'}">${Fmt.money(last.difference)}</b></p>` : html`<p class="muted">Todavía no se ha abierto ninguna caja.</p>`}
          <div class="open-form">
            <label class="field"><span>Efectivo inicial</span><input id="open-amount" type="number" min="0" step="0.01" value="${last ? last.counted_amount : 0}"></label>
            <button class="btn primary big" id="open-cash">Abrir caja</button>
          </div>
        </div>`));
      $('#open-cash', page).onclick = async () => {
        await api('cash.open', { amount: $('#open-amount', page).value });
        toast('Caja abierta.');
        App.reload();
      };
    } else {
      const s = st.open;
      page.appendChild(el(html`
        <div>
          <div class="toolbar"><div class="tl"><span class="muted">${st.terminal ? html`${icon('pc')} <b>${st.terminal.name}</b> · ` : ''}Abierta el ${Fmt.datetime(s.opened_at)}</span></div>
            <div class="tr">
              <button class="btn" id="cash-in">${icon('plus')} Entrada de efectivo</button>
              <button class="btn" id="cash-bank">${icon('outbox')} Depósito al banco</button>
              ${admin ? html`<button class="btn" id="cash-out">${icon('outbox')} Retiro</button>` : ''}
              <button class="btn primary" id="cash-close">Cerrar caja</button>
            </div>
          </div>
          <div class="cash-grid">
            <div class="card cash-summary">
              <div class="cs-row"><span>Efectivo inicial</span><b>${Fmt.money(s.opening_amount)}</b></div>
              <div class="cs-row plus"><span>+ Ventas en efectivo</span><b>${Fmt.money(s.cash_sales)}</b></div>
              <div class="cs-row plus"><span>+ Abonos de clientes</span><b>${Fmt.money(s.customer_payments)}</b></div>
              <div class="cs-row plus"><span>+ Otros ingresos</span><b>${Fmt.money(s.other_income)}</b></div>
              <div class="cs-row minus"><span>− Gastos y pagos en efectivo</span><b>${Fmt.money(s.expenses_paid)}</b></div>
              <div class="cs-row minus"><span>− Depósitos al banco</span><b>${Fmt.money(s.bank_deposits)}</b></div>
              <div class="cs-row minus"><span>− Retiros</span><b>${Fmt.money(s.withdrawals)}</b></div>
              ${s.other_out ? html`<div class="cs-row minus"><span>− Devoluciones y anulaciones</span><b>${Fmt.money(s.other_out)}</b></div>` : ''}
              <div class="cs-row total"><span>Efectivo esperado en caja</span><b>${Fmt.money(s.expected)}</b></div>
            </div>
            <div class="card">
              <h3>Movimientos de efectivo</h3>
              ${table({
                columns: [
                  { key: 'created_at', label: 'Hora', render: (r) => r.created_at.slice(11, 16) },
                  { key: 'label', label: 'Concepto' },
                  { key: 'description', label: 'Detalle' },
                  { key: 'amount', label: 'Monto', align: 'right', render: (r) => html`<b class="${r.direction === 'in' ? 'text-ok' : 'text-danger'}">${r.direction === 'in' ? '+' : '−'}${Fmt.money(r.amount)}</b>` },
                  { key: 'user_name', label: 'Usuario' },
                ],
                rows: s.movements,
                empty: 'Sin movimientos de efectivo todavía.',
              })}
            </div>
          </div>
        </div>`));
      const MOVES = {
        entrada: { title: 'Entrada de efectivo', hint: 'Ej. Cambio / sencillo' },
        deposito_banco: { title: 'Depósito al banco', hint: 'Ej. Banco Popular, boleta 123456', note: 'El efectivo sale de la caja y pasa al banco. No es un gasto: el dinero sigue siendo del negocio.' },
        retiro: { title: 'Retiro de efectivo', hint: 'Ej. Retiro del dueño', note: 'Dinero que sale del negocio. Si va al banco, use "Depósito al banco".' },
      };
      const move = (type) => modal({
        title: MOVES[type].title,
        width: 440,
        body: html`
          ${MOVES[type].note ? html`<p class="muted small">${MOVES[type].note}</p>` : ''}
          <label class="field"><span>Monto</span><input name="amount" type="number" min="0.01" step="0.01"></label>
          <label class="field"><span>Descripción *</span><input name="description" placeholder="${MOVES[type].hint}"></label>`,
        actions: [
          { label: 'Cancelar' },
          { label: 'Registrar', primary: true, onClick: async ({ body }) => { await api('cash.movement', { type, ...formData(body) }); toast('Movimiento registrado.'); App.reload(); } },
        ],
      });
      $('#cash-in', page).onclick = () => move('entrada');
      $('#cash-bank', page).onclick = () => move('deposito_banco');
      if (admin) $('#cash-out', page).onclick = () => move('retiro');
      $('#cash-close', page).onclick = () => {
        const body = el(html`
          <div>
            <div class="info-box">Efectivo esperado: <b>${Fmt.money(s.expected)}</b></div>
            <label class="field"><span>Efectivo real contado</span><input name="counted" type="number" min="0" step="0.01"></label>
            <div id="diff" class="diff"></div>
            <label class="field"><span>Nota</span><input name="note" placeholder="Opcional"></label>
          </div>`);
        $('[name=counted]', body).oninput = (e) => {
          const d = (Number(e.target.value) || 0) - s.expected;
          setHTML($('#diff', body), html`Diferencia: <b class="${Math.abs(d) < 0.005 ? 'text-ok' : d < 0 ? 'text-danger' : 'text-warn'}">${Fmt.money(d)}</b> ${Math.abs(d) < 0.005 ? '(cuadrada)' : d < 0 ? '(faltante)' : '(sobrante)'}`);
        };
        modal({
          title: 'Cerrar caja',
          width: 440,
          body,
          actions: [
            { label: 'Cancelar' },
            {
              label: 'Cerrar caja', primary: true,
              onClick: async () => {
                const r = await api('cash.close', formData(body));
                toast(`Caja cerrada. Diferencia: ${Fmt.money(r.difference)}`, Math.abs(r.difference) < 0.005 ? 'ok' : 'error');
                App.reload();
              },
            },
          ],
        });
      };
    }

    if (admin && st.others && st.others.length) {
      page.appendChild(el(html`<div class="card"><h3>Cajas abiertas en otras computadoras</h3>${table({
        columns: [
          { key: 'terminal_name', label: 'PC' },
          { key: 'opened_at', label: 'Apertura', datetime: true },
          { key: 'opened_by_name', label: 'Abrió' },
          { key: 'opening_amount', label: 'Inicial', money: true },
          { key: 'total_in', label: 'Entradas', money: true },
          { key: 'total_out', label: 'Salidas', money: true },
          { key: 'expected', label: 'Esperado', money: true },
        ],
        rows: st.others,
      })}</div>`));
    }

    if (admin) {
      const hist = await api('cash.history');
      const h = el(html`<div class="card"><h3>Historial de cierres</h3>${table({
        columns: [
          { key: 'terminal_name', label: 'PC' },
          { key: 'opened_at', label: 'Apertura', render: (r) => html`${Fmt.datetime(r.opened_at)}<br><small class="muted">${r.opened_by_name}</small>` },
          { key: 'closed_at', label: 'Cierre', render: (r) => (r.closed_at ? html`${Fmt.datetime(r.closed_at)}<br><small class="muted">${r.closed_by_name}</small>` : '') },
          { key: 'opening_amount', label: 'Inicial', money: true },
          { key: 'expected_amount', label: 'Esperado', money: true, render: (r) => (r.status === 'cerrada' ? Fmt.money(r.expected_amount) : '') },
          { key: 'counted_amount', label: 'Real', money: true, render: (r) => (r.status === 'cerrada' ? Fmt.money(r.counted_amount) : '') },
          { key: 'difference', label: 'Diferencia', align: 'right', render: (r) => (r.status === 'cerrada' ? html`<b class="${r.difference < 0 ? 'text-danger' : r.difference > 0 ? 'text-warn' : 'text-ok'}">${Fmt.money(r.difference)}</b>` : '') },
          { key: 'status', label: 'Estado', render: (r) => badge(r.status) },
        ],
        rows: hist, clickable: true, empty: 'Sin historial.',
      })}</div>`);
      page.appendChild(h);
      onRowClick(h, hist, async (r) => {
        const d = await api('cash.session', { id: r.id });
        modal({
          title: `Caja #${d.id} · ${d.terminal_name || ''} · ${Fmt.datetime(d.opened_at)}`,
          width: 820,
          body: html`
            <div class="kv cols-4">
              <div><span>Inicial</span><b>${Fmt.money(d.opening_amount)}</b></div>
              <div><span>Entradas</span><b class="text-ok">${Fmt.money(d.total_in)}</b></div>
              <div><span>Salidas</span><b class="text-danger">${Fmt.money(d.total_out)}</b></div>
              <div><span>Esperado</span><b>${Fmt.money(d.expected)}</b></div>
              ${d.status === 'cerrada' ? html`<div><span>Real</span><b>${Fmt.money(d.counted_amount)}</b></div><div><span>Diferencia</span><b>${Fmt.money(d.difference)}</b></div>` : ''}
            </div>
            ${table({
              columns: [
                { key: 'created_at', label: 'Fecha', datetime: true },
                { key: 'label', label: 'Concepto' },
                { key: 'description', label: 'Detalle' },
                { key: 'amount', label: 'Monto', align: 'right', render: (m) => html`<b class="${m.direction === 'in' ? 'text-ok' : 'text-danger'}">${m.direction === 'in' ? '+' : '−'}${Fmt.money(m.amount)}</b>` },
                { key: 'user_name', label: 'Usuario' },
              ],
              rows: d.movements,
            })}`,
          actions: [{ label: 'Cerrar' }],
        });
      });
    }
  },
});
