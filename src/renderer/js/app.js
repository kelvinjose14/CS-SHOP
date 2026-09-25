'use strict';
/* Estructura principal: inicio de sesión, menú lateral y navegación entre pantallas. */

const NAV_ORDER = [
  'dashboard', 'pos', 'sales',
  'products', 'movements', 'purchases', 'suppliers',
  'customers', 'receivables', 'payables', 'expenses', 'cash',
  'accounting', 'cashflow', 'reports', 'audit',
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
        upd.textContent = 'Instalando: el programa se cerrará y volverá a abrir.';
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
            <label class="field"><span>Nueva contraseña (mínimo 6)</span><input name="password" type="password" required minlength="6"></label>
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
      return html`<div class="nav-group"><div class="nav-title">${g}</div>${items.map((r) => html`<a href="#" data-route="${r.id}">${icon(r.icon)}<span>${r.title}</span></a>`)}</div>`;
    });
    setHTML(document.body, html`
      <aside class="sidebar">
        <div class="brand"><img src="assets/logo.png" alt="CAPS._.SHOP"></div>
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
          <h1 id="page-title"></h1>
          <div class="topbar-right" id="topbar-right"></div>
        </header>
        <section id="page" class="page"></section>
      </main>`);
    $$('[data-route]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.go(a.dataset.route); }));
    $('#btn-logout').onclick = () => this.logout();
    $('#btn-password').onclick = () => this.changePasswordDialog();
  },

  async go(id, params = {}) {
    const route = this.routes.find((r) => r.id === id);
    if (!route || !this.can(route)) return;
    this.current = { id, params };
    $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === (route.navAs || id)));
    $('#page-title').textContent = route.title;
    setHTML($('#topbar-right'), '');
    const page = $('#page');
    page.className = `page page-${id}`;
    setHTML(page, html`<div class="loading">Cargando…</div>`);
    try {
      page.innerHTML = '';
      await route.render(page, params);
    } catch (err) {
      console.error(err);
      if (!SESSION_ERRORS.includes(err.code) && err.code !== 'OFFLINE') setHTML(page, html`<div class="error-box">${err.message}</div>`);
    }
    this.refreshCashBadge();
    this.refreshUpdateBadge();
  },

  // Aviso de versión nueva, solo para el administrador (él decide cuándo instalar).
  async refreshUpdateBadge() {
    if (!this.isAdmin()) return;
    try {
      const u = await window.capsApi.updates.status();
      const box = $('#topbar-right');
      if (!box || $('.update-pill', box) || !['available', 'downloading', 'ready'].includes(u.status)) return;
      const pill = el(html`<button class="cash-pill update-pill" title="Hay una versión nueva">${icon('download')} Versión ${u.version} disponible</button>`);
      pill.onclick = () => this.go('settings');
      box.prepend(pill);
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
      const old = $('.cash-pill', box);
      if (old) old.remove();
      const pill = el(st.open
        ? html`<button class="cash-pill open" title="Caja abierta">${icon('cash')} Caja abierta · ${Fmt.money(st.open.expected)}</button>`
        : html`<button class="cash-pill closed" title="Caja cerrada">${icon('cash')} Caja cerrada</button>`);
      pill.onclick = () => this.go('cash');
      box.appendChild(pill);
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
