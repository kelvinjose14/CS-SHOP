'use strict';
// Actualizaciones desde GitHub Releases, con aviso: nada se descarga ni se instala sin que el
// administrador lo pida (decisión del dueño, 25/09/2026). El actualizador se recibe de afuera
// (electron-updater en la app, uno falso en las pruebas).

const EVERY = 6 * 60 * 60 * 1000;

function createUpdates({ updater, currentVersion, enabled = true, log, quit = () => updater.quitAndInstall(false, true) }) {
  const state = { status: enabled ? 'idle' : 'disabled', version: null, percent: 0, error: null, checked_at: null };
  let timer = null;

  const friendly = (err) => {
    const msg = String((err && err.message) || err);
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|net::/i.test(msg)) return 'No se pudo buscar actualizaciones: no hay conexión a internet.';
    if (/404|latest\.yml/i.test(msg)) return 'Todavía no hay versiones publicadas para actualizar.';
    return `No se pudo actualizar: ${msg.split('\n')[0]}`;
  };

  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => Object.assign(state, { status: 'checking', error: null }));
    updater.on('update-available', (info) => {
      Object.assign(state, { status: 'available', version: info.version });
      if (log) log.info('actualización', `Hay una versión nueva: ${info.version}`);
    });
    updater.on('update-not-available', () => Object.assign(state, { status: 'none', version: null }));
    updater.on('download-progress', (p) => Object.assign(state, { status: 'downloading', percent: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', (info) => Object.assign(state, { status: 'ready', version: info.version, percent: 100 }));
    updater.on('error', (err) => {
      Object.assign(state, { status: 'error', error: friendly(err) });
      if (log) log.warn('actualización', 'Falló la actualización', err);
    });
  }

  const api = {
    status: () => ({ ...state, current: currentVersion }),
    async check() {
      if (!enabled || ['checking', 'downloading'].includes(state.status)) return api.status();
      state.checked_at = new Date().toISOString();
      try {
        await updater.checkForUpdates();
        // Si el actualizador no avisó nada (por ejemplo, un sistema sin actualizaciones), no hay versión nueva.
        if (['idle', 'checking'].includes(state.status)) state.status = 'none';
      } catch (err) {
        Object.assign(state, { status: 'error', error: friendly(err) });
      }
      return api.status();
    },
    // Descarga (si falta) e instala: el programa se cierra y se abre en la versión nueva.
    async install() {
      if (!enabled) throw Object.assign(new Error('Las actualizaciones solo funcionan en el programa instalado.'), { userFacing: true, code: 'UPDATE' });
      if (state.status === 'available') {
        state.status = 'downloading';
        try {
          await updater.downloadUpdate();
        } catch (err) {
          Object.assign(state, { status: 'error', error: friendly(err) });
          throw Object.assign(new Error(state.error), { userFacing: true, code: 'UPDATE' });
        }
      }
      if (state.status !== 'ready') throw Object.assign(new Error('No hay una versión nueva lista para instalar.'), { userFacing: true, code: 'UPDATE' });
      if (log) log.info('actualización', `Instalando la versión ${state.version}`);
      setTimeout(quit, 200);
      return api.status();
    },
    start() {
      if (!enabled) return;
      api.check();
      timer = setInterval(api.check, EVERY);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
  return api;
}

module.exports = { createUpdates };
