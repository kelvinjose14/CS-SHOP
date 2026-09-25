'use strict';
/* Usuarios y configuración. */

App.register({
  id: 'users', title: 'Usuarios', icon: 'user', group: 'Sistema', roles: ['admin'],
  async render(page) {
    const tb = toolbar(page, { right: html`<button class="btn primary" id="u-new">${icon('plus')} Nuevo usuario</button>` });
    const box = el(html`<div class="card"></div>`);
    page.appendChild(box);
    page.appendChild(el(html`
      <div class="card roles">
        <div><h3>Administrador</h3><ul><li>Ver contabilidad, ganancias y costos</li><li>Registrar compras y gastos</li><li>Ajustar inventario y precios</li><li>Devoluciones y anulaciones</li><li>Ver reportes y administrar usuarios</li></ul></div>
        <div><h3>Vendedor</h3><ul><li>Realizar ventas (detalle y por mayor)</li><li>Consultar inventario (sin costos)</li><li>Registrar clientes</li><li>Registrar abonos de clientes (si está permitido en Configuración)</li><li>Abrir y cerrar caja</li></ul></div>
      </div>`));
    const load = async () => {
      const rows = await api('users.list');
      setHTML(box, table({
        columns: [
          { key: 'name', label: 'Nombre', render: (u) => html`<b>${u.name}</b>` },
          { key: 'username', label: 'Usuario' },
          { key: 'role', label: 'Rol', render: (u) => (u.role === 'admin' ? 'Administrador' : 'Vendedor') },
          { key: 'active', label: 'Estado', render: (u) => (u.active ? badge('ok', 'Activo') : badge('anulada', 'Inactivo')) },
          { key: 'must_change', label: '', render: (u) => (u.must_change ? html`<span class="muted small">Debe cambiar contraseña</span>` : '') },
          { key: 'created_at', label: 'Creado', datetime: true },
        ],
        rows, clickable: true,
      }));
      onRowClick(box, rows, (u) => userForm(u, load));
    };
    $('#u-new', tb).onclick = () => userForm(null, load);
    await load();
  },
});

function userForm(u, onSaved) {
  u = u || { role: 'vendedor', active: 1 };
  modal({
    title: u.id ? 'Editar usuario' : 'Nuevo usuario',
    width: 480,
    body: html`
      <label class="field"><span>Nombre *</span><input name="name" value="${u.name || ''}"></label>
      <label class="field"><span>Usuario (para entrar) *</span><input name="username" value="${u.username || ''}"></label>
      <label class="field"><span>Rol</span><select name="role">${options([['vendedor', 'Vendedor'], ['admin', 'Administrador']], u.role)}</select></label>
      <label class="field"><span>${u.id ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña inicial *'}</span><input name="password" type="password"></label>
      <label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo</label>
      <p class="muted small">Al asignar una contraseña, el usuario deberá cambiarla la próxima vez que entre.</p>`,
    actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', primary: true, onClick: async ({ body }) => { await api('users.save', { ...formData(body), id: u.id }); toast('Usuario guardado.'); onSaved(); } },
    ],
  });
}

App.register({
  id: 'settings', title: 'Configuración', icon: 'gear', group: 'Sistema', roles: ['admin'],
  async render(page) {
    const s = await api('settings.get');
    const expCats = JSON.parse(s.expense_categories || '[]').join('\n');
    const incCats = JSON.parse(s.income_categories || '[]').join('\n');
    const form = el(html`
      <div class="settings">
        <div class="card">
          <h3>Negocio</h3>
          <div class="grid-2">
            <label class="field"><span>Nombre del negocio</span><input name="business_name" value="${s.business_name}"></label>
            <label class="field"><span>Eslogan</span><input name="business_tagline" value="${s.business_tagline}"></label>
            <label class="field"><span>Teléfono</span><input name="business_phone" value="${s.business_phone}"></label>
            <label class="field"><span>Dirección</span><input name="business_address" value="${s.business_address}"></label>
            <label class="field"><span>Símbolo de moneda</span><input name="currency" value="${s.currency}"></label>
            <label class="field"><span>Mensaje al pie del recibo</span><input name="receipt_footer" value="${s.receipt_footer}"></label>
          </div>
        </div>
        <div class="card">
          <h3>Ventas, crédito y caja</h3>
          <div class="grid-2">
            <label class="field"><span>Días de crédito por defecto</span><input name="credit_days" type="number" min="0" value="${s.credit_days}"></label>
            <label class="field"><span>Descuento máximo del vendedor (%)</span><input name="seller_max_discount_pct" type="number" min="0" max="100" value="${s.seller_max_discount_pct}"></label>
            <label class="check"><input type="checkbox" name="require_open_cash" ${s.require_open_cash === '1' ? 'checked' : ''}> Exigir caja abierta para movimientos en efectivo</label>
            <label class="check"><input type="checkbox" name="allow_negative_stock" ${s.allow_negative_stock === '1' ? 'checked' : ''}> Permitir vender sin existencia (inventario negativo)</label>
            <label class="check"><input type="checkbox" name="seller_can_receive_payments" ${s.seller_can_receive_payments === '1' ? 'checked' : ''}> El vendedor puede registrar abonos de clientes</label>
            <label class="check"><input type="checkbox" name="seller_can_discount" ${s.seller_can_discount === '1' ? 'checked' : ''}> El vendedor puede aplicar descuentos</label>
          </div>
        </div>
        <div class="card">
          <h3>Categorías</h3>
          <div class="grid-2">
            <label class="field"><span>Categorías de gastos (una por línea)</span><textarea name="expense_categories" rows="8">${expCats}</textarea></label>
            <label class="field"><span>Categorías de otros ingresos (una por línea)</span><textarea name="income_categories" rows="8">${incCats}</textarea></label>
          </div>
        </div>
        <div class="row-end"><button class="btn primary big" id="st-save">Guardar configuración</button></div>
        <div class="card" id="net-card"></div>
        ${App.info.mode === 'principal' ? html`
        <div class="card">
          <h3>Copias de seguridad</h3>
          <p class="muted">El sistema guarda automáticamente una copia diaria (últimos 30 días). Guarde también copias en una memoria USB o en la nube.</p>
          <p class="muted small">Carpeta de datos: <code>${App.info.dataDir}</code></p>
          <div class="inline">
            <button class="btn" id="bk-create">${icon('download')} Crear copia de seguridad…</button>
            <button class="btn" id="bk-folder">Abrir carpeta de respaldos automáticos</button>
            <button class="btn danger" id="bk-restore">Restaurar desde copia…</button>
          </div>
          <h4>Copia fuera de esta computadora</h4>
          <p class="muted">Una copia diaria de los datos <b>y las fotos</b> en una memoria USB o en la carpeta de OneDrive o Google Drive. Si la memoria no está conectada, la copia se hace sola al conectarla.</p>
          <div id="ext-box"></div>
        </div>` : html`
        <div class="card">
          <h3>Copias de seguridad</h3>
          <p class="muted">Las copias se hacen en la PC principal: ahí están todos los datos.</p>
        </div>`}
        <div class="card" id="upd-card"></div>
        <div class="card">
          <h3>Soporte</h3>
          <p class="muted">Si algo falla, guarde el diagnóstico y envíelo al soporte. Incluye la versión, el estado de la base y de la red, y el registro de errores. No incluye contraseñas ni la clave de conexión.</p>
          <div class="inline">
            <button class="btn" id="sp-diag">${icon('download')} Guardar diagnóstico…</button>
            <button class="btn" id="sp-logs">Abrir carpeta de registros</button>
          </div>
        </div>
        <p class="muted small center">CAPS Shop v${App.info.version}</p>
      </div>`);
    page.appendChild(form);
    $('#st-save', form).onclick = async () => {
      const f = formData(form);
      const lines = (t) => JSON.stringify(t.split('\n').map((x) => x.trim()).filter(Boolean));
      const data = {
        ...f,
        require_open_cash: f.require_open_cash ? '1' : '0',
        allow_negative_stock: f.allow_negative_stock ? '1' : '0',
        seller_can_receive_payments: f.seller_can_receive_payments ? '1' : '0',
        seller_can_discount: f.seller_can_discount ? '1' : '0',
        expense_categories: lines(f.expense_categories),
        income_categories: lines(f.income_categories),
      };
      await api('settings.save', data);
      await App.loadSettings();
      toast('Configuración guardada.');
    };
    renderNetwork($('#net-card', form));
    renderUpdates($('#upd-card', form));
    if (App.info.mode === 'principal') renderExternal($('#ext-box', form));
    $('#sp-diag', form).onclick = async () => {
      try { if (await window.capsApi.support.diagnostic()) toast('Diagnóstico guardado.'); } catch (e) { toast(e.message, 'error'); }
    };
    $('#sp-logs', form).onclick = () => window.capsApi.support.openLogs();
    if (App.info.mode !== 'principal') return;
    $('#bk-create', form).onclick = async () => {
      try { const p = await window.capsApi.backupCreate(); if (p) toast('Copia de seguridad guardada.'); } catch (e) { toast(e.message, 'error'); }
    };
    $('#bk-folder', form).onclick = () => window.capsApi.backupOpenFolder();
    $('#bk-restore', form).onclick = async () => {
      try {
        const p = await window.capsApi.backupRestore();
        if (p) { toast('Datos restaurados. Inicie sesión nuevamente.'); App.onLoggedOut(); }
      } catch (e) { toast(e.message, 'error'); }
    };
  },
});

// Configuración → Red: cómo trabaja esta PC y, en la principal, las computadoras conectadas.
async function renderNetwork(card) {
  App.info = await window.capsApi.info();
  const i = App.info;
  const change = html`<button class="btn" id="net-setup">Cambiar configuración de esta PC…</button>`;
  if (i.mode === 'terminal') {
    setHTML(card, html`
      <h3>${icon('wifi')} Red</h3>
      <p>Esta computadora es <b>${i.terminal.name}</b> y está conectada a la PC principal <b>${i.server.name || ''}</b> (<code>${i.server.host}:${i.server.port}</code>).</p>
      <p class="muted small">Todos los datos se guardan en la PC principal. Si se apaga, esta computadora no puede trabajar hasta que vuelva.</p>
      <div class="inline">${change}</div>`);
  } else {
    const n = i.network;
    const pcs = await api('terminals.list');
    setHTML(card, html`
      <h3>${icon('wifi')} Red</h3>
      <p>Esta computadora es la <b>PC principal</b> (<b>${i.terminal.name}</b>): guarda todos los datos.</p>
      <label class="check"><input type="checkbox" id="net-share" ${n.share ? 'checked' : ''}> Permitir que otras computadoras se conecten</label>
      ${n.error ? html`<div class="error-box">${n.error}</div>` : ''}
      ${n.sharing ? html`
        <div class="kv cols-3">
          <div><span>Dirección de esta PC</span><b>${n.addresses.join(', ') || 'Sin red'}</b></div>
          <div><span>Puerto</span><b>${n.port}</b></div>
          <div><span>Clave de conexión</span><b class="net-key">${n.key}</b></div>
        </div>
        <p class="muted small">En cada computadora nueva elija "Conectar a la PC principal", pulse Buscar (o escriba la dirección) y escriba esta clave. Si Windows pregunta, permita el acceso en <b>Redes privadas</b>.</p>` : ''}
      <h4>Computadoras</h4>
      ${table({
        columns: [
          { key: 'name', label: 'Nombre', render: (t) => html`${t.name}${t.principal ? html` <span class="chip">PC principal</span>` : ''}` },
          { key: 'last_seen_at', label: 'Última actividad', datetime: true },
          { key: 'cash_open', label: 'Caja', render: (t) => (t.cash_open ? badge('abierta') : badge('cerrada')) },
          { key: 'active', label: 'Estado', render: (t) => (t.active ? 'Activa' : html`<span class="text-danger">Desactivada</span>`) },
        ],
        rows: pcs, clickable: true,
      })}
      <div class="inline">
        ${n.sharing ? html`<button class="btn" id="net-key">Cambiar clave…</button>` : ''}
        ${change}
      </div>`);
    $('#net-share', card).onchange = async (e) => {
      try {
        await window.capsApi.net.setShare(e.target.checked);
        toast(e.target.checked ? 'Las demás computadoras ya se pueden conectar.' : 'Se dejó de compartir en la red.');
      } catch (err) { toast(err.message, 'error'); }
      renderNetwork(card);
    };
    const keyBtn = $('#net-key', card);
    if (keyBtn) keyBtn.onclick = async () => {
      if (!(await confirmDialog('Las computadoras conectadas dejarán de funcionar hasta que escriba la clave nueva en cada una (Configurar esta PC). ¿Cambiar la clave?', { danger: true, okLabel: 'Cambiar clave' }))) return;
      try { await window.capsApi.net.newKey(); } catch (err) { toast(err.message, 'error'); }
      renderNetwork(card);
    };
    onRowClick(card, pcs, (t) => modal({
      title: `Computadora: ${t.name}`,
      width: 420,
      body: html`
        <label class="field"><span>Nombre</span><input name="name" value="${t.name}" maxlength="40"></label>
        ${t.principal ? '' : html`<label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Activa (si la desactiva, no podrá trabajar hasta que la active de nuevo)</label>`}`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar', primary: true,
          onClick: async ({ body }) => {
            const f = formData(body);
            await api('terminals.save', { id: t.id, name: f.name, ...(t.principal ? {} : { active: !!f.active }) });
            toast('Computadora actualizada.');
            renderNetwork(card);
          },
        },
      ],
    }));
  }
  $('#net-setup', card).onclick = () => App.showSetup({ back: () => App.enter() });
}

// Copia externa: carpeta elegida, última copia y botones.
async function renderExternal(box) {
  const st = await window.capsApi.external.status();
  const last = st.last_at ? `${Fmt.datetime(st.last_at)}${st.days_since > 0 ? ` (hace ${st.days_since} ${st.days_since === 1 ? 'día' : 'días'})` : ''}` : 'Nunca';
  setHTML(box, html`
    ${st.dir ? html`<p>Carpeta: <code>${st.dir}</code> · Última copia: <b class="${st.overdue ? 'text-danger' : 'text-ok'}">${last}</b></p>` : html`<div class="warn-box">${icon('alert')} Todavía no hay copia fuera de esta computadora. Si el disco se daña, se pierde todo.</div>`}
    ${st.last_error ? html`<div class="error-box">${st.last_error}</div>` : ''}
    <div class="inline">
      <button class="btn" id="ext-choose">${st.dir ? 'Cambiar carpeta…' : 'Elegir carpeta…'}</button>
      ${st.dir ? html`<button class="btn primary" id="ext-now">Copiar ahora</button><button class="btn" id="ext-clear">Quitar</button>` : ''}
    </div>`);
  const run = (fn, ok) => async () => {
    try {
      const r = await fn();
      if (r !== null) toast(ok);
    } catch (e) { toast(e.message, 'error'); }
    renderExternal(box);
  };
  $('#ext-choose', box).onclick = run(() => window.capsApi.external.choose(), 'Carpeta guardada y copia hecha.');
  const now = $('#ext-now', box);
  if (now) now.onclick = run(() => window.capsApi.external.now(), 'Copia hecha.');
  const clear = $('#ext-clear', box);
  if (clear) clear.onclick = async () => {
    if (!(await confirmDialog('¿Dejar de hacer la copia fuera de esta computadora?', { danger: true, okLabel: 'Quitar' }))) return;
    run(() => window.capsApi.external.clear(), 'Copia externa desactivada.')();
  };
}

// Actualizaciones: se buscan solas; instalar lo decide el administrador.
async function renderUpdates(card, st) {
  const u = st || (await window.capsApi.updates.status());
  const text = {
    disabled: 'Las actualizaciones funcionan en el programa instalado.',
    idle: 'Todavía no se buscó.',
    checking: 'Buscando…',
    none: 'Tiene la versión más reciente.',
    available: `Hay una versión nueva: ${u.version}.`,
    downloading: `Descargando la versión ${u.version}… ${u.percent || 0}%`,
    ready: `La versión ${u.version} está lista para instalar.`,
    error: u.error,
  }[u.status];
  setHTML(card, html`
    <h3>${icon('download')} Actualizaciones</h3>
    <p>Versión instalada: <b>${u.current}</b> · ${text}</p>
    ${['available', 'ready'].includes(u.status) ? html`<p class="muted small">Al instalar, el programa se cierra y se abre en la versión nueva, sin perder datos. Con varias computadoras, actualice <b>primero la PC principal</b> y después las demás: todas deben tener la misma versión.</p>` : ''}
    <div class="inline">
      <button class="btn" id="upd-check" ${['disabled', 'checking', 'downloading'].includes(u.status) ? 'disabled' : ''}>Buscar ahora</button>
      ${['available', 'ready'].includes(u.status) ? html`<button class="btn primary" id="upd-install">Instalar la versión ${u.version}</button>` : ''}
    </div>`);
  const check = $('#upd-check', card);
  check.onclick = async () => renderUpdates(card, await window.capsApi.updates.check());
  const install = $('#upd-install', card);
  if (install) install.onclick = async () => {
    if (!(await confirmDialog(`Se instalará la versión ${u.version}. El programa se cerrará y volverá a abrir. ¿Instalar ahora?`, { okLabel: 'Instalar' }))) return;
    install.disabled = true;
    install.textContent = 'Descargando…';
    try { await window.capsApi.updates.install(); } catch (e) { toast(e.message, 'error'); renderUpdates(card); }
  };
}
