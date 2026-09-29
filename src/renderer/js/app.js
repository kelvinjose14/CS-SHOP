'use strict';
/* Estructura principal: inicio de sesión, menú lateral y navegación entre pantallas. */

const NAV_ORDER = [
  'dashboard', 'pos', 'sales', 'reservations',
  'products', 'restock', 'movements', 'purchases', 'suppliers',
  'customers', 'receivables', 'payables', 'expenses', 'cash',
  'executive', 'accounting', 'cashflow', 'reports', 'audit',
  'users', 'settings',
];

const App = {
  info: null,
  user: null,
  settings: {},
  routes: [],
  current: null,
  groups: ['Principal', 'Inventario', 'Finanzas', 'Análisis', 'Sistema'],

  register(route) {
    this.routes.push(route);
  },

  isAdmin() {
    return this.user && this.user.role === 'admin';
  },

  can(route) {
    return !route.roles || route.roles.includes(this.user.role);
  },

  async start() {
    this.info = await window.capsApi.info();
    if (this.info.needsSetup) return this.showSetup();
    if (this.info.user) {
      this.user = this.info.user;
      await this.enter();
    } else {
      this.showLogin();
    }
  },

  async loadSettings() {
    this.settings = await api('settings.get');
    Fmt.currency = this.settings.currency || 'RD$';
  },

  // Nombre de esta PC y, si está conectada, a qué principal.
  pcLabel() {
    const i = this.info;
    if (!i.terminal) return '';
    return i.mode === 'terminal' ? `${i.terminal.name} · conectada a ${i.server.name || i.server.host}` : `${i.terminal.name} · PC principal`;
  },

  showLogin(message, code) {
    document.body.className = 'login-page';
    const canSetup = this.info.mode === 'terminal' && CONNECTION_ERRORS.includes(code);
    const canUpdate = this.info.mode === 'terminal' && code === 'VERSION';
    setHTML(document.body, html`
      <div class="login">
        <div class="login-card">
          <img src="assets/logo.png" alt="CAPS._.SHOP" class="login-logo">
          <form id="login-form" autocomplete="off">
            <label class="field"><span>Usuario</span><input name="username" required autofocus></label>
            <label class="field"><span>Contraseña</span><input name="password" type="password" required></label>
            <div class="login-error">${message || ''}</div>
            <button class="btn primary block" type="submit">Entrar</button>
          </form>
          ${canUpdate ? html`<button class="btn block" id="login-update">${icon('download')} Actualizar esta PC</button>` : ''}
          <p class="login-hint">${icon('pc')} ${this.pcLabel()}${canSetup ? html` · <a href="#" id="login-setup">Configurar esta PC</a> · <a href="#" id="login-diag">Guardar diagnóstico</a>` : ''}</p>
          ${this.info.mode === 'principal' ? html`<p class="login-hint"><a href="#" id="login-recover">¿Olvidó la contraseña del administrador?</a></p>` : ''}
          <p class="login-hint">Sistema de inventario y contabilidad · v${this.info.version}</p>
        </div>
      </div>`);
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      try {
        this.user = await window.capsApi.login(f.username, f.password);
        this.info = await window.capsApi.info();
        await this.enter();
      } catch (err) {
        if (CONNECTION_ERRORS.includes(err.code)) return this.showLogin(err.message, err.code);
        $('.login-error').textContent = err.message;
      }
    };
    const upd = $('#login-update');
    if (upd) upd.onclick = async () => {
      upd.disabled = true;
      upd.textContent = 'Buscando la versión nueva…';
      try {
        const u = await window.capsApi.updates.check();
        if (!['available', 'ready'].includes(u.status)) throw new Error(u.error || 'No hay una versión más nueva publicada. Si la PC principal tiene una versión más vieja, actualice la principal.');
        upd.textContent = `Descargando la versión ${u.version}…`;
        await window.capsApi.updates.install();
        upd.textContent = 'Instalando: el programa se cerrará y volverá a abrir solo.';
      } catch (err) {
        $('.login-error').textContent = err.message;
        upd.disabled = false;
        upd.textContent = 'Actualizar esta PC';
      }
    };
    const diag = $('#login-diag');
    if (diag) diag.onclick = async (e) => {
      e.preventDefault();
      try { if (await window.capsApi.support.diagnostic()) toast('Diagnóstico guardado.'); } catch (err) { toast(err.message, 'error'); }
    };
    const setup = $('#login-setup');
    if (setup) setup.onclick = (e) => { e.preventDefault(); this.showSetup({ back: () => this.showLogin(), terminalOnly: true }); };
    const rec = $('#login-recover');
    if (rec) rec.onclick = (e) => { e.preventDefault(); this.showRecover(); };
  },

  // Recuperar la contraseña del administrador con el código de un solo uso (RF-NUE-06).
  showRecover() {
    document.body.className = 'login-page';
    setHTML(document.body, html`
      <div class="login">
        <div class="login-card">
          <img src="assets/logo.png" alt="" class="login-logo small">
          <h2>Recuperar contraseña</h2>
          <p class="muted">Escriba el <b>código de recuperación</b> que se generó en Configuración → Usuarios. Sirve una sola vez.</p>
          <form id="rec-form" autocomplete="off">
            <label class="field"><span>Usuario administrador</span><input name="username" required value="admin"></label>
            <label class="field"><span>Código de recuperación</span><input name="code" required placeholder="XXXX-XXXX-XXXX-XXXX" class="mono"></label>
            <label class="field"><span>Nueva contraseña (mínimo 8)</span><input name="password" type="password" required minlength="8"></label>
            <label class="field"><span>Repetir nueva contraseña</span><input name="password2" type="password" required></label>
            <div class="login-error"></div>
            <button class="btn primary block" type="submit">Cambiar contraseña</button>
          </form>
          <p class="login-hint"><a href="#" id="rec-back">Volver</a></p>
          <p class="login-hint">¿No tiene el código? Otro administrador puede cambiarle la contraseña en Configuración → Usuarios.</p>
        </div>
      </div>`);
    $('#rec-back').onclick = (e) => { e.preventDefault(); this.showLogin(); };
    $('#rec-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      if (f.password !== f.password2) return ($('.login-error').textContent = 'Las contraseñas no coinciden.');
      try {
        await window.capsApi.recover({ username: f.username, code: f.code, password: f.password });
        this.showLogin();
        toast('Contraseña cambiada. Entre con la nueva. El código ya no sirve: genere otro.');
      } catch (err) {
        $('.login-error').textContent = err.message;
      }
    };
  },

  onLoggedOut(message, code) {
    // Varias llamadas pueden fallar a la vez: se conserva el primer aviso.
    if (!this.user && $('#login-form')) return;
    this.user = null;
    const off = $('#offline');
    if (off) off.remove();
    this.showLogin(message, code);
  },

  async logout() {
    await window.capsApi.logout();
    this.user = null;
    this.showLogin();
  },

  async enter() {
    await this.loadSettings();
    if (this.user.must_change) return this.forcePasswordChange();
    this.renderShell();
    this.go(this.isAdmin() ? 'dashboard' : 'pos');
  },

  forcePasswordChange() {
    document.body.className = 'login-page';
    setHTML(document.body, html`
      <div class="login">
        <div class="login-card">
          <img src="assets/logo.png" alt="" class="login-logo small">
          <h2>Hola, ${this.user.name}</h2>
          <p class="muted">Por seguridad, cambie su contraseña antes de continuar.</p>
          <form id="pw-form">
            <label class="field"><span>Contraseña actual</span><input name="current" type="password" required></label>
            <label class="field"><span>Nueva contraseña (mínimo 8)</span><input name="password" type="password" required minlength="8"></label>
            <label class="field"><span>Repetir nueva contraseña</span><input name="password2" type="password" required></label>
            <div class="login-error"></div>
            <button class="btn primary block" type="submit">Guardar y continuar</button>
          </form>
        </div>
      </div>`);
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      if (f.password !== f.password2) return ($('.login-error').textContent = 'Las contraseñas no coinciden.');
      try {
        this.user = await window.capsApi.call('auth.changePassword', f);
        await this.enter();
      } catch (err) {
        $('.login-error').textContent = err.message;
      }
    };
  },

  renderShell() {
    document.body.className = '';
    const nav = this.groups.map((g) => {
      const items = this.routes
        .filter((r) => r.group === g && !r.hidden && this.can(r))
        .sort((a, b) => NAV_ORDER.indexOf(a.id) - NAV_ORDER.indexOf(b.id));
      if (!items.length) return '';
      return html`<div class="nav-group"><div class="nav-title">${g}</div>${items.map((r) => html`<a href="#" data-route="${r.id}" title="${r.title}">${icon(r.icon)}<span>${r.title}</span></a>`)}</div>`;
    });
    setHTML(document.body, html`
      <aside class="sidebar">
        <div class="brand"><img src="assets/logo.png" alt="CAPS._.SHOP"><button class="icon-btn side-toggle" id="side-toggle" title="Contraer o expandir el menú" aria-label="Contraer o expandir el menú">${icon('panel')}</button></div>
        <nav>${nav}</nav>
        <div class="side-user">
          <div class="avatar">${this.user.name.slice(0, 1).toUpperCase()}</div>
          <div class="who"><strong>${this.user.name}</strong><small>${this.isAdmin() ? 'Administrador' : 'Vendedor'} · ${this.info.terminal ? this.info.terminal.name : ''}</small></div>
          <button class="icon-btn" id="btn-password" title="Cambiar contraseña">${icon('user')}</button>
          <button class="icon-btn" id="btn-logout" title="Cerrar sesión">${icon('logout')}</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="crumb"><small id="page-group"></small><h1 id="page-title"></h1></div>
          <button class="topbar-search" id="gsearch" type="button" title="Buscar productos, clientes, ventas o acciones (Ctrl + K)">${icon('search')}<span>Buscar o ir a…</span><kbd>Ctrl K</kbd></button>
          <div class="topbar-tools">
            <div class="topbar-right" id="topbar-right"></div>
            <button class="icon-btn theme-btn" id="theme-btn" type="button" aria-label="Cambiar entre modo claro y oscuro">${icon(Theme.dark() ? 'sun' : 'moon')}</button>
            <button class="icon-btn bell" id="bell" type="button" title="Alertas" aria-label="Alertas">${icon('bell')}<span class="bell-count hidden" id="bell-count"></span></button>
          </div>
        </header>
        <section id="page" class="page"></section>
      </main>`);
    $$('[data-route]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.go(a.dataset.route); }));
    $('#btn-logout').onclick = () => this.logout();
    $('#btn-password').onclick = () => this.changePasswordDialog();
    // Menú contraído (solo iconos): se recuerda en esta PC. En ventanas angostas empieza contraído.
    const pref = (() => { try { return localStorage.getItem('capsshop-menu'); } catch { return null; } })();
    if (pref === 'contraido') document.body.classList.add('side-collapsed');
    $('#gsearch').onclick = () => commandPalette();
    $('#bell').onclick = () => this.showAlerts();
    $('#theme-btn').onclick = () => Theme.toggle();
    Theme.apply();
    this.alertsAt = 0;
    clearInterval(this.alertsTimer);
    this.alertsTimer = setInterval(() => this.refreshAlerts(true), 120000);
    $('#side-toggle').onclick = () => {
      const narrow = window.matchMedia('(max-width: 1100px)').matches;
      const cls = narrow ? 'side-expanded' : 'side-collapsed';
      const on = document.body.classList.toggle(cls);
      if (!narrow) try { localStorage.setItem('capsshop-menu', on ? 'contraido' : 'abierto'); } catch { /* sin almacenamiento */ }
    };
  },

  async go(id, params = {}) {
    const route = this.routes.find((r) => r.id === id);
    if (!route || !this.can(route)) return;
    this.current = { id, params };
    const nav = (this.navSeq = (this.navSeq || 0) + 1);
    clearBigTables();
    $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === (route.navAs || id)));
    $('#page-title').textContent = route.title;
    const navRoute = this.routes.find((r) => r.id === (route.navAs || id));
    $('#page-group').textContent = (navRoute && navRoute.group) || '';
    // Una página nueva en cada cambio de pantalla: si el usuario pasa rápido por varias, lo que termina
    // de cargar una pantalla anterior queda en la página vieja (fuera de la vista) y no se mezcla.
    const old = $('#page');
    const page = el(html`<section id="page" class="page page-${id}"></section>`);
    old.replaceWith(page);
    // Si la pantalla tarda, un esqueleto con la forma de la página (no un "Cargando…" en blanco).
    const main = page.parentElement;
    $$('.page-skeleton', main).forEach((x) => x.remove());
    const skeleton = setTimeout(() => {
      if (this.navSeq !== nav || !page.isConnected) return;
      main.appendChild(el(html`<div class="page-skeleton" aria-hidden="true"><div class="sk-row"><div class="sk sk-bar"></div></div><div class="sk-row"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div><div class="sk sk-table"></div></div>`));
    }, 120);
    try {
      await route.render(page, params);
    } catch (err) {
      console.error(err);
      if (this.navSeq === nav && !SESSION_ERRORS.includes(err.code) && err.code !== 'OFFLINE') {
        setHTML(page, html`<div class="empty-state">${html`<div class="es-icon">${icon('alert')}</div>`}<b>No se pudo abrir esta pantalla</b><p>${err.message}</p><button class="btn" type="button" id="page-retry">Intentar de nuevo</button></div>`);
        const retry = $('#page-retry', page);
        if (retry) retry.onclick = () => this.go(id, params);
      }
    } finally {
      clearTimeout(skeleton);
    }
    if (this.navSeq !== nav) return;
    $$('.page-skeleton', main).forEach((x) => x.remove());
    if (!reduceMotion()) page.classList.add('page-enter');
    this.refreshCashBadge();
    this.refreshUpdateBadge();
    this.refreshAlerts();
  },

  /* ---------- Alertas (la campanita, 1.9) ---------- */
  // Se piden al cambiar de pantalla (a lo sumo cada 30 s) y cada 2 minutos. El número cuenta las que el
  // usuario todavía no vio; una alerta vuelve a ser nueva si cambia (por ejemplo, un agotado más).
  seenKey() { return `capsshop-alertas-${this.user ? this.user.id : 0}`; },
  seen() { try { return new Set(JSON.parse(localStorage.getItem(this.seenKey()) || '[]')); } catch { return new Set(); } },
  async refreshAlerts(force = false) {
    if (!this.user || !$('#bell')) return;
    if (!force && Date.now() - this.alertsAt < 30000 && this.alerts) return this.drawBell();
    this.alertsAt = Date.now();
    try {
      this.alerts = await api('alerts.list', null, { silent: true });
      this.drawBell();
    } catch { /* sin sesión o sin conexión: se intenta después */ }
  },
  drawBell() {
    const count = $('#bell-count');
    if (!count || !this.alerts) return;
    const seen = this.seen();
    const fresh = this.alerts.filter((a) => !seen.has(a.sig));
    count.textContent = fresh.length > 9 ? '9+' : String(fresh.length);
    count.classList.toggle('hidden', !fresh.length);
    count.classList.toggle('urgent', fresh.some((a) => a.level === 'danger'));
    $('#bell').title = this.alerts.length ? `${this.alerts.length} ${this.alerts.length === 1 ? 'alerta' : 'alertas'}` : 'Sin alertas';
  },
  async showAlerts() {
    const old = $('.alerts-panel');
    if (old) return old.remove();
    await this.refreshAlerts(true);
    const list = this.alerts || [];
    const seen = this.seen();
    const panel = el(html`
      <div class="alerts-panel" role="dialog" aria-label="Alertas">
        <div class="ap-head"><b>Alertas</b><small class="muted">${list.length ? `${list.length} ${list.length === 1 ? 'activa' : 'activas'}` : ''}</small></div>
        ${list.length ? html`<div class="ap-list">${list.map((a, i) => html`
          <button type="button" class="ap-item ${a.level} ${seen.has(a.sig) ? '' : 'new'}" data-i="${i}">
            <span class="ap-icon">${icon(a.icon || 'alert')}</span>
            <span class="ap-text"><b>${a.title}</b><small>${a.detail}${a.amount ? ` · ${Fmt.money(a.amount)}` : ''}</small></span>
            ${icon('chevron')}
          </button>`)}</div>`
          : html`<div class="empty-state"><div class="es-icon">${icon('check')}</div><b>Todo en orden</b><p>No hay alertas por ahora.</p></div>`}
      </div>`);
    document.body.appendChild(panel);
    // Abrir la lista las da por vistas (el número se apaga hasta que algo cambie).
    try { localStorage.setItem(this.seenKey(), JSON.stringify(list.map((a) => a.sig))); } catch { /* sin almacenamiento */ }
    this.drawBell();
    $$('[data-i]', panel).forEach((b) => (b.onclick = () => { const a = list[Number(b.dataset.i)]; panel.remove(); this.go(a.route, a.params || {}); }));
    const away = (e) => {
      if (!panel.isConnected) return document.removeEventListener('mousedown', away, true);
      if (!panel.contains(e.target) && !e.target.closest('#bell')) { panel.remove(); document.removeEventListener('mousedown', away, true); }
    };
    document.addEventListener('mousedown', away, true);
  },

  // Aviso de versión nueva, solo para el administrador (él decide cuándo instalar).
  async refreshUpdateBadge() {
    if (!this.isAdmin()) return;
    try {
      const u = await window.capsApi.updates.status();
      const box = $('#topbar-right');
      if (!box) return;
      const old = $('.update-pill', box);
      if (!['available', 'downloading', 'ready', 'scheduled'].includes(u.status)) { if (old) old.remove(); return; }
      const pill = el(html`<button class="cash-pill update-pill" title="Hay una versión nueva">${icon('download')} ${u.status === 'scheduled' ? `Versión ${u.version} al cerrar` : `Versión ${u.version} disponible`}</button>`);
      if (old && old.outerHTML === pill.outerHTML) return;
      pill.onclick = () => this.go('settings');
      if (old) old.replaceWith(pill); else box.prepend(pill);
    } catch { /* sin actualizaciones */ }
  },

  reload() {
    if (this.current) this.go(this.current.id, this.current.params);
  },

  async refreshCashBadge() {
    try {
      const st = await api('cash.status', null, { silent: true });
      const box = $('#topbar-right');
      if (!box) return;
      const markup = st.open
        ? html`<button class="cash-pill open" title="Caja abierta">${icon('cash')} Caja abierta · ${Fmt.money(st.open.expected)}</button>`
        : html`<button class="cash-pill closed" title="Caja cerrada">${icon('cash')} Caja cerrada</button>`;
      const old = $('.cash-pill:not(.update-pill)', box);
      // Igual que antes: no se toca (sin parpadeo al cambiar de pantalla).
      if (old && old.outerHTML === el(markup).outerHTML) return;
      const pill = el(markup);
      pill.onclick = () => this.go('cash');
      if (old) old.replaceWith(pill); else box.appendChild(pill);
    } catch { /* sin sesión */ }
  },

  changePasswordDialog() {
    modal({
      title: 'Cambiar contraseña',
      width: 420,
      body: html`
        <label class="field"><span>Contraseña actual</span><input name="current" type="password"></label>
        <label class="field"><span>Nueva contraseña</span><input name="password" type="password"></label>
        <label class="field"><span>Repetir nueva contraseña</span><input name="password2" type="password"></label>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar', primary: true,
          onClick: async ({ body }) => {
            const f = formData(body);
            if (f.password !== f.password2) { toast('Las contraseñas no coinciden.', 'error'); return false; }
            this.user = await api('auth.changePassword', f);
            toast('Contraseña actualizada.');
          },
        },
      ],
    });
  },
};

/* ---------- Buscador global y acciones rápidas (Ctrl + K, 1.9) ---------- */
// Una sola barra: escriba para buscar gorras, clientes, ventas (por número o cliente) y proveedores, o
// elija una acción ("Nueva venta", "Nuevo producto"…). Flechas para moverse, Enter para abrir, Esc para cerrar.
function paletteActions() {
  const admin = App.isAdmin();
  const acts = [
    { label: 'Nueva venta', hint: 'Punto de venta', icon: 'cart', run: () => App.go('pos') },
    admin && { label: 'Nuevo producto', hint: 'Inventario', icon: 'plus', run: async () => { await App.go('products'); productEditor(null, () => App.reload()); } },
    { label: 'Nuevo cliente', hint: 'Clientes', icon: 'users', run: () => customerForm(null, () => App.current && App.current.id === 'customers' && App.reload()) },
    admin && { label: 'Nueva compra', hint: 'Compras', icon: 'truck', run: () => App.go('purchase-new') },
    admin && { label: 'Qué comprar (reposición)', hint: 'Inventario', icon: 'restock', run: () => App.go('restock') },
    { label: 'Nuevo apartado', hint: 'Apartados', icon: 'bookmark', run: async () => { await App.go('reservations'); const b = $('#rs-new'); if (b) b.click(); } },
  ].filter(Boolean);
  const routes = App.routes.filter((r) => !r.hidden && App.can(r)).map((r) => ({ label: `Ir a ${r.title}`, hint: r.group, icon: r.icon, run: () => App.go(r.id) }));
  return [...acts, ...routes];
}

function commandPalette() {
  if ($('.palette-back.modal-back')) return; // la que se está yendo (animación) no cuenta
  const acts = paletteActions();
  const box = el(html`
    <div class="modal-back palette-back">
      <div class="palette" role="dialog" aria-label="Buscar">
        <div class="pal-input">${icon('search')}<input id="pal-q" placeholder="Buscar gorra, cliente, venta (V-123), proveedor o una acción…" autocomplete="off"><kbd>Esc</kbd></div>
        <div class="pal-list" id="pal-list"></div>
        <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl K</kbd> abrir desde cualquier pantalla</span></div>
      </div>
    </div>`);
  document.body.appendChild(box);
  const input = $('#pal-q', box);
  const listEl = $('#pal-list', box);
  let items = [];
  let active = 0;
  let seq = 0;
  const close = () => { document.removeEventListener('keydown', onKey, true); leave(box); };
  const reload = () => App.reload();
  const norm = (x) => plainText(x);
  const draw = (groups) => {
    items = groups.flatMap((g) => g.items);
    active = Math.min(active, Math.max(0, items.length - 1));
    let i = 0;
    setHTML(listEl, items.length ? groups.filter((g) => g.items.length).map((g) => html`
      <div class="pal-group">${g.title}</div>
      ${g.items.map((it) => html`<div class="pal-item ${i === active ? 'active' : ''}" data-i="${i++}">
        <span class="pal-icon">${it.thumb || icon(it.icon || 'chevron')}</span>
        <span class="pal-text"><b>${it.label}</b>${it.hint ? html`<small>${it.hint}</small>` : ''}</span>
        ${it.side ? html`<span class="pal-side">${it.side}</span>` : ''}
      </div>`)}`) : html`<div class="picker-empty">Sin resultados para "${input.value.trim()}".</div>`);
    $$('[data-i]', listEl).forEach((d) => {
      d.onmousemove = () => { if (active !== Number(d.dataset.i)) { active = Number(d.dataset.i); mark(); } };
      d.onclick = () => pick(items[Number(d.dataset.i)]);
    });
  };
  const mark = () => $$('[data-i]', listEl).forEach((d) => d.classList.toggle('active', Number(d.dataset.i) === active));
  const pick = (it) => { if (!it) return; close(); it.run(); };
  const localActs = (q) => acts.filter((a) => !q || norm(`${a.label} ${a.hint}`).includes(q)).slice(0, q ? 6 : 8);
  const search = debounce(async () => {
    const raw = input.value.trim();
    const q = norm(raw);
    const mine = ++seq;
    const groups = [{ title: 'Acciones', items: localActs(q) }];
    if (raw.length < 2) { active = 0; return draw(groups); }
    const r = await api('search.global', { q: raw }, { silent: true }).catch(() => null);
    if (mine !== seq || !r) return;
    groups.push(
      { title: 'Productos', items: r.products.map((p) => ({ label: p.name, hint: [p.brand, p.model, p.color, p.size, p.sku].filter(Boolean).join(' · '), thumb: productThumb(p, 28), side: html`${Fmt.money(p.price_retail)}<small class="${(p.available ?? p.stock) <= 0 ? 'text-danger' : ''}">Disp. ${p.available ?? p.stock}</small>`, run: () => productDetail(p.id, reload) })) },
      { title: 'Clientes', items: r.customers.map((c) => ({ label: c.name, hint: c.phone || '', icon: 'user', run: () => customerDetail(c.id, reload) })) },
      { title: 'Ventas', items: r.sales.map((x) => ({ label: `${Fmt.saleNo(x.id)}${x.customer_name ? ` · ${x.customer_name}` : ''}`, hint: `${Fmt.date(x.date)} · ${STATUS_LABELS[x.status] || x.status}`, icon: 'receipt', side: Fmt.money(x.total), run: () => saleDetail(x.id, reload) })) },
      { title: 'Proveedores', items: r.suppliers.map((x) => ({ label: x.name, hint: x.phone || '', icon: 'factory', run: () => supplierDetail(x.id, reload) })) },
    );
    groups[0].items = groups[0].items.slice(0, 3);
    active = 0;
    draw(groups);
  }, 200);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); mark(); scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); mark(); scrollActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
  };
  const scrollActive = () => { const d = $('.pal-item.active', listEl); if (d) d.scrollIntoView({ block: 'nearest' }); };
  document.addEventListener('keydown', onKey, true);
  box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
  input.addEventListener('input', search);
  draw([{ title: 'Acciones', items: localActs('') }]);
  input.focus();
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' && App.user && $('#gsearch')) {
    e.preventDefault();
    commandPalette();
  }
});

// Cabecera de página con botones de acción.
function toolbar(page, { left = '', right = '' } = {}) {
  const t = el(html`<div class="toolbar"><div class="tl">${left}</div><div class="tr">${right}</div></div>`);
  page.appendChild(t);
  return t;
}

function statCard(label, value, { tone = '', sub = '', iconName } = {}) {
  return html`<div class="stat ${tone}">${iconName ? html`<div class="stat-icon">${icon(iconName)}</div>` : ''}<div><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? html`<div class="stat-sub">${sub}</div>` : ''}</div></div>`;
}

// Errores de la interfaz no capturados: quedan en el registro para el soporte.
window.addEventListener('error', (e) => window.capsApi.logError(`${e.message} (${e.filename}:${e.lineno})\n${e.error && e.error.stack ? e.error.stack : ''}`));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason || {};
  if (r.code) return; // errores de la aplicación con mensaje para el usuario (ya se mostraron)
  window.capsApi.logError(`Promesa sin capturar: ${r.message || r}\n${r.stack || ''}`);
});

window.addEventListener('DOMContentLoaded', () => App.start());
