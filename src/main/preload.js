'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function unwrap(p) {
  const r = await p;
  if (!r.ok) {
    const err = new Error(r.error);
    err.code = r.code;
    throw err;
  }
  return r.data;
}

contextBridge.exposeInMainWorld('capsApi', {
  info: () => unwrap(ipcRenderer.invoke('app:info')),
  login: (username, password) => unwrap(ipcRenderer.invoke('auth:login', { username, password })),
  logout: () => unwrap(ipcRenderer.invoke('auth:logout')),
  call: (name, params) => unwrap(ipcRenderer.invoke('api:call', name, params)),
  saveText: (opts) => unwrap(ipcRenderer.invoke('file:saveText', opts)),
  savePdf: (opts) => unwrap(ipcRenderer.invoke('file:savePdf', opts)),
  printPage: () => unwrap(ipcRenderer.invoke('print:page')),
  printHtml: (html) => unwrap(ipcRenderer.invoke('print:html', { html })),
  backupCreate: () => unwrap(ipcRenderer.invoke('backup:create')),
  backupRestore: () => unwrap(ipcRenderer.invoke('backup:restore')),
  backupOpenFolder: () => unwrap(ipcRenderer.invoke('backup:openFolder')),
});
