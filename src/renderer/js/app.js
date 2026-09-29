'use strict';
/* Estructura principal: inicio de sesión, menú lateral y navegación entre pantallas. */

const NAV_ORDER = [
  'dashboard', 'pos', 'sales', 'reservations',
  'products', 'movements', 'purchases', 'suppliers',
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
          <div class="topbar-right" id="topbar-right"></div>
        </header>
        <section id="page" class="page"></section>
      </main>`);
    $$('[data-route]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.go(a.dataset.route); }));
    $('#btn-logout').onclick = () => this.logout();
    $('#btn-password').onclick = () => this.changePasswordDialog();
    // Menú contraído (solo iconos): se recuerda en esta PC. En ventanas angostas empieza contraído.
    const pref = (() => { try { return localStorage.getItem('capsshop-menu'); } catch { return null; } })();
    if (pref === 'contraido') document.body.classList.add('side-collapsed');
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
