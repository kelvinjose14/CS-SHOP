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
      onRowButton($('#e-list', wrap), '[data-void]', rows, async (r) => {
        const reason = await promptDialog({ title: `Anular ${isExpense ? 'gasto' : 'ingreso'}`, label: `Motivo · ${r.category} ${Fmt.money(r.amount)}` });
        if (!reason) return;
        await api(`${apiBase}.void`, { id: r.id, reason });
        toast('Registro anulado.');
        App.refreshCashBadge();
        load();
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
          <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayStr()}" max="${todayStr()}"></label>
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
      onRowButton(box, '[data-void]', rows, async (r) => {
        const reason = await promptDialog({ title: 'Anular aporte', label: `Motivo · ${Fmt.money(r.amount)}` });
        if (!reason) return;
        await api('capital.void', { id: r.id, reason });
        toast('Aporte anulado.');
        App.refreshCashBadge();
        load();
      });
    };
    $$('[data-go]', tb).forEach((b) => (b.onclick = () => App.go(b.dataset.go)));
    $('#c-export', tb).onclick = () => exportCsv('aportes-del-dueno', cols, rows);
    $('#c-new', tb).onclick = () => modal({
      title: 'Registrar aporte del dueño',
      width: 480,
      body: html`
        <div class="grid-2">
          <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayStr()}" max="${todayStr()}"></label>
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
            <label class="field wide hidden" id="open-reason-field"><span id="open-diff"></span><input id="open-reason" placeholder="Motivo. Ej. El dueño se llevó el efectivo al banco"></label>
            <button class="btn primary big" id="open-cash">Abrir caja</button>
          </div>
        </div>`));
      // Si el efectivo inicial no es lo contado en el último cierre, se pide el motivo (auditoría 2.1).
      const diff = () => (last ? Math.round(((Number($('#open-amount', page).value) || 0) - last.counted_amount) * 100) / 100 : 0);
      $('#open-amount', page).oninput = () => {
        const d = diff();
        $('#open-reason-field', page).classList.toggle('hidden', !d);
        $('#open-diff', page).textContent = d ? `${d < 0 ? 'Faltan' : 'Sobran'} ${Fmt.money(Math.abs(d))} respecto al último cierre. Motivo *` : '';
      };
      $('#open-cash', page).onclick = async () => {
        const reason = $('#open-reason', page).value.trim();
        if (diff() && !reason) return toast('Escriba el motivo de la diferencia con el último cierre.', 'error');
        await api('cash.open', { amount: $('#open-amount', page).value, reason: diff() ? reason : undefined });
        toast('Caja abierta.');
        App.reload();
      };
    } else {
      const s = st.open;
      page.appendChild(el(html`
        <div>
          <div class="toolbar"><div class="tl"><span class="muted">${st.terminal ? html`${icon('pc')} <b>${st.terminal.name}</b> · ` : ''}Abierta el ${Fmt.datetime(s.opened_at)}</span></div>
            <div class="tr">
              ${admin ? html`<button class="btn" data-go="deposits">${icon('file')} Depósitos por verificar</button>` : ''}
              <button class="btn" id="cash-in">${icon('plus')} Entrada de efectivo</button>
              <button class="btn" id="cash-bank">${icon('outbox')} Depósito al banco</button>
              ${admin ? html`<button class="btn" id="cash-out">${icon('outbox')} Retiro</button>` : ''}
              <button class="btn primary" id="cash-close">Cerrar caja</button>
            </div>
          </div>
          <div class="cash-grid">
            <div class="card cash-summary">
              <div class="cs-row"><span>Efectivo inicial</span><b>${Fmt.money(s.opening_amount)}</b></div>
              ${s.opening_difference ? html`<div class="cs-note">${s.opening_difference < 0 ? 'Faltaban' : 'Sobraban'} ${Fmt.money(Math.abs(s.opening_difference))} respecto al último cierre: ${s.opening_reason}</div>` : ''}
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
                  { label: '', render: (r) => (r.voided ? badge('anulada', 'Anulado') : admin && r.voidable ? html`<button class="btn small danger" data-void-mov>Anular</button>` : '') },
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
      // Entrada, depósito o retiro registrado por error: el administrador lo anula con un motivo.
      onRowButton(page, '[data-void-mov]', s.movements, async (r) => {
        const reason = await promptDialog({ title: `Anular: ${r.label}`, label: `Motivo · ${Fmt.money(r.amount)}${r.description ? ` (${r.description})` : ''}` });
        if (!reason) return;
        await api('cash.voidMovement', { movement_id: r.id, reason });
        toast('Movimiento anulado.');
        App.reload();
      });
      $$('[data-go]', page).forEach((b) => (b.onclick = () => App.go(b.dataset.go)));
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
          { key: 'opening_amount', label: 'Inicial', money: true, render: (r) => html`${Fmt.money(r.opening_amount)}${r.opening_difference ? html`<br><small class="text-danger" title="${r.opening_reason || ''}">${Fmt.money(r.opening_difference)} vs. cierre</small>` : ''}` },
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
            ${d.opening_difference ? html`<div class="warn-box">${icon('alert')} Se abrió con ${Fmt.money(d.opening_amount)}: ${d.opening_difference < 0 ? 'faltaban' : 'sobraban'} ${Fmt.money(Math.abs(d.opening_difference))} respecto al cierre anterior. Motivo: ${d.opening_reason}</div>` : ''}
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
                { key: 'voided', label: '', render: (m) => (m.voided ? badge('anulada', 'Anulado') : '') },
              ],
              rows: d.movements,
            })}`,
          actions: [{ label: 'Cerrar' }],
        });
      });
    }
  },
});

// Depósitos al banco por verificar (auditoría 4.2). Cualquiera puede registrar un depósito y la caja
// cuadra aunque el dinero no llegue: el administrador compara cada uno con el estado de cuenta.
const DEPOSIT_STATUS = { pendiente: ['warn', 'Por verificar'], verificado: ['ok', 'En el banco'], no_recibido: ['danger', 'No llegó'], anulado: ['muted', 'Anulado'] };

App.register({
  id: 'deposits', title: 'Depósitos al banco', icon: 'file', group: 'Finanzas', roles: ['admin'], hidden: true, navAs: 'cash',
  async render(page) {
    let range = {};
    let status = 'pendiente';
    const tb = toolbar(page, {
      left: html`<div class="seg" id="d-status">${[['pendiente', 'Por verificar'], ['verificado', 'En el banco'], ['no_recibido', 'No llegaron'], ['', 'Todos']].map(([v, l]) => html`<button data-v="${v}" class="${v === status ? 'active' : ''}">${l}</button>`)}</div>`,
      right: html`<button class="btn" id="d-export">${icon('download')} Exportar</button>`,
    });
    const pp = el(html`<div></div>`);
    tb.after(pp);
    page.appendChild(el(html`<div class="info-box">Compare cada depósito con el estado de cuenta del banco. Si aparece, márquelo <b>En el banco</b>. Si no llegó, márquelo <b>No llegó</b>: se descuenta del banco y queda en el historial como dinero que salió del negocio.</div>`));
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    let rows = [];
    const cols = [
      { key: 'created_at', label: 'Fecha', datetime: true },
      { key: 'terminal_name', label: 'PC' },
      { key: 'user_name', label: 'Registró' },
      { key: 'description', label: 'Detalle (banco, boleta)' },
      { key: 'amount', label: 'Monto', money: true, total: (list) => list.filter((r) => r.status !== 'anulado').reduce((s, r) => s + r.amount, 0) },
      {
        key: 'status', label: 'Estado', csv: (r) => DEPOSIT_STATUS[r.status][1],
        render: (r) => html`<span class="badge ${DEPOSIT_STATUS[r.status][0]}">${DEPOSIT_STATUS[r.status][1]}</span>${r.checked_at ? html`<div class="muted small">${r.checked_by_name} · ${Fmt.date(r.checked_at)}${r.check_note ? ` · ${r.check_note}` : ''}</div>` : ''}`,
      },
      {
        label: '', csv: false,
        render: (r) => (r.status === 'pendiente' ? html`<div class="inline nowrap"><button class="btn small" data-ok>En el banco</button><button class="btn small danger" data-missing>No llegó</button></div>`
          : r.status === 'verificado' ? html`<button class="btn small" data-undo>Desmarcar</button>` : ''),
      },
    ];
    const load = async () => {
      rows = await api('deposits.list', { ...range, status: status || undefined });
      setHTML(box, table({ columns: cols, rows, empty: status === 'pendiente' ? 'No hay depósitos por verificar.' : 'No hay depósitos en el período.' }));
      onRowButton(box, '[data-ok]', rows, async (r) => {
        const note = await promptDialog({ title: `Depósito de ${Fmt.money(r.amount)} en el banco`, label: 'Nota (opcional)', placeholder: 'Ej. Estado de cuenta de octubre', required: false });
        if (note === null) return;
        await api('deposits.check', { movement_id: r.id, status: 'verificado', note });
        toast('Depósito verificado.');
        load();
      });
      onRowButton(box, '[data-missing]', rows, async (r) => {
        const note = await promptDialog({
          title: 'Depósito que no llegó al banco',
          label: `Motivo · ${Fmt.money(r.amount)} registrado por ${r.user_name} el ${Fmt.date(r.date)}. Se descuenta del banco y queda como dinero que salió del negocio. No se puede deshacer.`,
        });
        if (!note) return;
        await api('deposits.check', { movement_id: r.id, status: 'no_recibido', note });
        toast('Registrado: el depósito no llegó al banco.', 'error');
        load();
      });
      onRowButton(box, '[data-undo]', rows, async (r) => {
        if (!(await confirmDialog(`¿Volver a poner por verificar el depósito de ${Fmt.money(r.amount)}?`, { okLabel: 'Desmarcar' }))) return;
        await api('deposits.uncheck', { movement_id: r.id });
        load();
      });
    };
    $$('#d-status [data-v]', tb).forEach((b) => (b.onclick = () => {
      status = b.dataset.v;
      $$('#d-status [data-v]', tb).forEach((x) => x.classList.toggle('active', x === b));
      load();
    }));
    $('#d-export', tb).onclick = () => exportCsv('depositos-al-banco', cols, rows);
    periodPicker(pp, (r) => { range = { from: r.from, to: r.to }; load(); }, { initial: 'todo', allowAll: true });
  },
});
