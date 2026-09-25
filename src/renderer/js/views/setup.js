'use strict';
/* Configurar esta PC (principal o conectada) y aviso de "Sin conexión con la PC principal". */

Object.assign(App, {
  // back: función para volver sin cambiar (desde Configuración o desde la pantalla de entrada).
  // terminalOnly: desde la pantalla de entrada solo se puede volver a conectar a la principal.
  showSetup({ back = null, terminalOnly = false } = {}) {
    document.body.className = 'login-page';
    const info = this.info;
    setHTML(document.body, html`
      <div class="login">
        <div class="login-card setup-card">
          <img src="assets/logo.png" alt="CAPS._.SHOP" class="login-logo small">
          <h2>Configurar esta computadora</h2>
          <p class="muted">¿Cómo va a trabajar esta PC?</p>
          <div class="setup-choice">
            <button class="choice" data-mode="principal" ${terminalOnly ? 'hidden' : ''}>${icon('pc', 'big')}<b>Esta es la PC principal</b><small>Guarda todos los datos. Debe estar encendida mientras la tienda trabaja.</small></button>
            <button class="choice" data-mode="terminal">${icon('wifi', 'big')}<b>Conectar a la PC principal</b><small>Usa los datos de la PC principal por la red de la tienda.</small></button>
          </div>
          <form id="setup-principal" class="setup-form" hidden autocomplete="off">
            <label class="field"><span>Nombre de esta computadora</span><input name="name" value="${info.terminal ? info.terminal.name : 'Principal'}" required maxlength="40"></label>
            <p class="muted small">Después de configurarla, vea la <b>clave de conexión</b> en Configuración → Red y úsela en las demás computadoras.</p>
            <div class="login-error"></div>
            <button class="btn primary block" type="submit">Configurar como PC principal</button>
          </form>
          <form id="setup-terminal" class="setup-form" hidden autocomplete="off">
            ${info.hasLocalData ? html`<div class="warn-box small">${icon('alert')} Esta computadora tiene datos propios. Al conectarla a la principal dejará de usarlos (quedan guardados en su carpeta).</div>` : ''}
            <button class="btn block" type="button" id="st-find">${icon('search')} Buscar la PC principal en la red</button>
            <div id="st-found"></div>
            <div class="grid-2 tight">
              <label class="field"><span>Dirección de la PC principal</span><input name="host" placeholder="192.168.1.10" value="${info.server ? info.server.host : ''}" required></label>
              <label class="field"><span>Puerto</span><input name="port" type="number" value="${info.server ? info.server.port : 47810}" required></label>
            </div>
            <label class="field"><span>Clave de conexión</span><input name="key" placeholder="XXXX-XXXX" required></label>
            <label class="field"><span>Nombre de esta computadora</span><input name="name" placeholder="Caja 2" value="${info.mode === 'terminal' ? info.terminal.name : ''}" required maxlength="40"></label>
            <div class="login-error"></div>
            <div class="inline"><button class="btn" type="button" id="st-test">Probar conexión</button><button class="btn primary" type="submit">Conectar</button></div>
          </form>
          ${back ? html`<button class="btn block ghost" id="st-back">Volver sin cambiar</button>` : ''}
        </div>
      </div>`);
    const forms = { principal: $('#setup-principal'), terminal: $('#setup-terminal') };
    $$('.choice').forEach((b) => (b.onclick = () => {
      $$('.choice').forEach((x) => x.classList.toggle('active', x === b));
      for (const [k, f] of Object.entries(forms)) f.hidden = k !== b.dataset.mode;
    }));
    if (back) $('#st-back').onclick = () => back();
    if (terminalOnly) $('.choice[data-mode=terminal]').click();
    const fail = (form, err) => ($('.login-error', form).textContent = err.message);
    const restarting = () => setHTML($('.login-card'), html`<h2>Listo</h2><p class="muted">Reiniciando CAPS Shop…</p>`);

    forms.principal.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await window.capsApi.setup.principal(formData(e.target));
        restarting();
      } catch (err) { fail(e.target, err); }
    };

    const t = forms.terminal;
    $('#st-find', t).onclick = async (e) => {
      const box = $('#st-found', t);
      e.target.disabled = true;
      setHTML(box, html`<p class="muted small">Buscando…</p>`);
      try {
        const list = await window.capsApi.setup.discover();
        setHTML(box, list.length
          ? html`<div class="found-list">${list.map((d, i) => html`<button type="button" class="found" data-i="${i}">${icon('pc')} <b>${d.name}</b> · ${d.business_name} <small>${d.host}</small></button>`)}</div>`
          : html`<p class="muted small">No se encontró ninguna. Verifique que la PC principal esté encendida, con "Permitir que otras computadoras se conecten" activado, y escriba su dirección abajo.</p>`);
        $$('.found', box).forEach((b) => (b.onclick = () => {
          const d = list[b.dataset.i];
          t.host.value = d.host;
          t.port.value = d.port;
          t.key.focus();
        }));
      } catch (err) { fail(t, err); } finally { e.target.disabled = false; }
    };
    $('#st-test', t).onclick = async () => {
      $('.login-error', t).textContent = '';
      try {
        const h = await window.capsApi.setup.test(formData(t));
        toast(`Conexión correcta con "${h.name}" (${h.business_name}).`);
      } catch (err) { fail(t, err); }
    };
    t.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await window.capsApi.setup.terminal(formData(t));
        restarting();
      } catch (err) { fail(t, err); }
    };
  },

  // Capa que cubre la pantalla mientras no hay conexión con la PC principal. Reintenta sola.
  showOffline(message) {
    if ($('#offline')) return;
    const box = el(html`
      <div id="offline" class="modal-back offline">
        <div class="modal offline-card">
          <div class="offline-icon">${icon('wifi', 'huge')}</div>
          <h2>Sin conexión con la PC principal</h2>
          <p>${message}</p>
          <p class="muted small">Se reintenta cada 5 segundos. Mientras tanto no se puede vender en esta computadora.</p>
          <button class="btn primary" id="off-retry">Reintentar ahora</button>
        </div>
      </div>`);
    document.body.appendChild(box);
    let busy = false;
    const tryNow = async () => {
      // Si la capa ya no está (por ejemplo, se volvió a la pantalla de entrada), se deja de reintentar.
      if (!box.isConnected) return clearInterval(timer);
      if (busy) return;
      busy = true;
      try {
        await window.capsApi.ping();
      } catch {
        return;
      } finally {
        busy = false;
      }
      clearInterval(timer);
      if (!box.isConnected) return;
      box.remove();
      toast('Conexión recuperada.');
      if (this.user) this.reload();
    };
    const timer = setInterval(tryNow, 5000);
    $('#off-retry', box).onclick = tryNow;
  },
});
