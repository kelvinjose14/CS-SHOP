'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Un Error que cruza contextBridge pierde sus propiedades (solo queda el mensaje), así que se rechaza
// con un objeto simple: la interfaz necesita el código (AUTH, OFFLINE…) para saber qué mostrar.
async function unwrap(p) {
  const r = await p;
  if (!r.ok) throw { message: r.error, code: r.code }; // eslint-disable-line no-throw-literal
  return r.data;
}

contextBridge.exposeInMainWorld('capsApi', {
  info: () => unwrap(ipcRenderer.invoke('app:info')),
  login: (username, password) => unwrap(ipcRenderer.invoke('auth:login', { username, password })),
  logout: () => unwrap(ipcRenderer.invoke('auth:logout')),
  call: (name, params) => unwrap(ipcRenderer.invoke('api:call', name, params)),
  ping: () => unwrap(ipcRenderer.invoke('net:ping')),
  setup: {
    discover: () => unwrap(ipcRenderer.invoke('setup:discover')),
    test: (opts) => unwrap(ipcRenderer.invoke('setup:test', opts)),
    principal: (opts) => unwrap(ipcRenderer.invoke('setup:principal', opts)),
    terminal: (opts) => unwrap(ipcRenderer.invoke('setup:terminal', opts)),
  },
  net: {
    setShare: (on) => unwrap(ipcRenderer.invoke('net:setShare', on)),
    newKey: () => unwrap(ipcRenderer.invoke('net:newKey')),
  },
  saveText: (opts) => unwrap(ipcRenderer.invoke('file:saveText', opts)),
  savePdf: (opts) => unwrap(ipcRenderer.invoke('file:savePdf', opts)),
  printPage: () => unwrap(ipcRenderer.invoke('print:page')),
  printHtml: (html) => unwrap(ipcRenderer.invoke('print:html', { html })),
  backupCreate: () => unwrap(ipcRenderer.invoke('backup:create')),
  backupRestore: () => unwrap(ipcRenderer.invoke('backup:restore')),
  backupOpenFolder: () => unwrap(ipcRenderer.invoke('backup:openFolder')),
  updates: {
    status: () => unwrap(ipcRenderer.invoke('update:status')),
    check: () => unwrap(ipcRenderer.invoke('update:check')),
    install: () => unwrap(ipcRenderer.invoke('update:install')),
  },
  external: {
    status: () => unwrap(ipcRenderer.invoke('backup:externalStatus')),
    choose: () => unwrap(ipcRenderer.invoke('backup:chooseExternal')),
    clear: () => unwrap(ipcRenderer.invoke('backup:clearExternal')),
    now: () => unwrap(ipcRenderer.invoke('backup:externalNow')),
  },
  logError: (message) => ipcRenderer.invoke('log:renderer', message).catch(() => {}),
  support: {
    diagnostic: () => unwrap(ipcRenderer.invoke('support:diagnostic')),
    openLogs: () => unwrap(ipcRenderer.invoke('support:openLogs')),
  },
});
