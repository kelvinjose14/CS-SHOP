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
        <div class="card">
          <h3>Copias de seguridad</h3>
          <p class="muted">El sistema guarda automáticamente una copia diaria (últimos 30 días). Guarde también copias en una memoria USB o en la nube.</p>
          <p class="muted small">Carpeta de datos: <code>${App.info.dataDir}</code></p>
          <div class="inline">
            <button class="btn" id="bk-create">${icon('download')} Crear copia de seguridad…</button>
            <button class="btn" id="bk-folder">Abrir carpeta de respaldos automáticos</button>
            <button class="btn danger" id="bk-restore">Restaurar desde copia…</button>
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
