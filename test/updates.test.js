'use strict';
// Actualizaciones con aviso (src/main/updates.js) usando un actualizador falso.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createUpdates } = require('../src/main/updates');

function fakeUpdater({ latest = null, failCheck = null } = {}) {
  const u = new EventEmitter();
  u.downloads = 0;
  u.checkForUpdates = async () => {
    u.emit('checking-for-update');
    if (failCheck) throw new Error(failCheck);
    if (latest) u.emit('update-available', { version: latest });
    else u.emit('update-not-available', {});
  };
  u.downloadUpdate = async () => {
    u.downloads++;
    u.emit('download-progress', { percent: 50 });
    u.emit('update-downloaded', { version: latest });
  };
  return u;
}

test('avisa de una versión nueva sin descargarla, y solo instala cuando se pide', async () => {
  const u = fakeUpdater({ latest: '1.2.0' });
  let quits = 0;
  const up = createUpdates({ updater: u, currentVersion: '1.1.0', quit: () => quits++ });
  assert.equal(u.autoDownload, false, 'no descarga solo');
  assert.equal(u.autoInstallOnAppQuit, false, 'no instala al cerrar');
  const st = await up.check();
  assert.equal(st.status, 'available');
  assert.equal(st.version, '1.2.0');
  assert.equal(st.current, '1.1.0');
  assert.equal(u.downloads, 0);
  await up.install();
  assert.equal(u.downloads, 1);
  assert.equal(up.status().status, 'ready');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(quits, 1, 'se cierra para instalar');
});

test('sin versión nueva, sin internet y en desarrollo', async () => {
  const none = createUpdates({ updater: fakeUpdater(), currentVersion: '1.1.0' });
  assert.equal((await none.check()).status, 'none');
  await assert.rejects(none.install(), /No hay una versión nueva/);

  const offline = createUpdates({ updater: fakeUpdater({ failCheck: 'getaddrinfo ENOTFOUND github.com' }), currentVersion: '1.1.0' });
  const st = await offline.check();
  assert.equal(st.status, 'error');
  assert.match(st.error, /no hay conexión a internet/);

  const dev = createUpdates({ updater: fakeUpdater(), currentVersion: '1.1.0', enabled: false });
  assert.equal((await dev.check()).status, 'disabled');
  await assert.rejects(dev.install(), /programa instalado/);
});
