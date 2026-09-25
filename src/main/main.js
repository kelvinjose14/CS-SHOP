'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { openDatabase, validateDatabaseFile } = require('../core/db');
const { createApi } = require('../core/api');
const { today } = require('../core/util');

let win = null;
let db = null;
let api = null;

const dataDir = () => process.env.CAPSSHOP_DATA || path.join(app.getPath('userData'), 'data');
const dbFile = () => path.join(dataDir(), 'capsshop.db');
const photosDir = () => path.join(dataDir(), 'fotos');
const backupsDir = () => path.join(dataDir(), 'respaldos');

// Copia de seguridad automática (una por día, se conservan las últimas 30).
function autoBackup() {
  try {
    fs.mkdirSync(backupsDir(), { recursive: true });
    const target = path.join(backupsDir(), `capsshop-${today()}.db`);
    if (!fs.existsSync(target) && fs.existsSync(dbFile())) fs.copyFileSync(dbFile(), target);
    const files = fs.readdirSync(backupsDir()).filter((f) => /^capsshop-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    while (files.length > 30) fs.unlinkSync(path.join(backupsDir(), files.shift()));
  } catch (err) {
    console.error('Respaldo automático falló:', err);
  }
}

function savePhoto(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Imagen inválida.');
  fs.mkdirSync(photosDir(), { recursive: true });
  const name = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(photosDir(), name), Buffer.from(m[2], 'base64'));
  return name;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0b0c',
    title: 'CAPS Shop',
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  // Los enlaces externos se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function wrap(fn) {
  return async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      if (!err.userFacing) console.error(err);
      return { ok: false, error: err.userFacing ? err.message : `Error inesperado: ${err.message}`, code: err.code || 'ERROR' };
    }
  };
}

function registerIpc() {
  ipcMain.handle('app:info', wrap(() => ({
    version: app.getVersion(),
    dataDir: dataDir(),
    photosUrl: pathToFileURL(photosDir() + path.sep).href,
    user: api.user,
  })));
  ipcMain.handle('auth:login', wrap((p) => api.login(p)));
  ipcMain.handle('auth:logout', wrap(() => api.logout()));
  ipcMain.handle('api:call', wrap((name, params) => {
    if (name === 'products.save' && params && params.photo_data) {
      if (!api.user || api.user.role !== 'admin') throw Object.assign(new Error('No tiene permiso.'), { userFacing: true });
      params = { ...params, photo: savePhoto(params.photo_data) };
      delete params.photo_data;
    }
    return api.call(name, params);
  }));

  ipcMain.handle('file:saveText', wrap(async ({ defaultName, content, filters }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: filters || [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, '﻿' + content, 'utf8'); // BOM para que Excel respete los acentos
    return r.filePath;
  }));

  ipcMain.handle('file:savePdf', wrap(async ({ defaultName, landscape }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    const pdf = await win.webContents.printToPDF({ printBackground: true, landscape: !!landscape, pageSize: 'Letter', margins: { marginType: 'default' } });
    fs.writeFileSync(r.filePath, pdf);
    shell.openPath(r.filePath);
    return r.filePath;
  }));

  ipcMain.handle('print:page', wrap(() => new Promise((resolve) => {
    win.webContents.print({ printBackground: true }, (success) => resolve(success));
  })));

  // Imprime un recibo en una ventana oculta (impresora de tickets u otra).
  ipcMain.handle('print:html', wrap(({ html }) => new Promise((resolve, reject) => {
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    pw.webContents.once('did-finish-load', () => {
      pw.webContents.print({ printBackground: true }, (success, reason) => {
        pw.destroy();
        if (success || reason === 'cancelled') resolve(success);
        else reject(Object.assign(new Error(`No se pudo imprimir: ${reason}`), { userFacing: true }));
      });
    });
  })));

  ipcMain.handle('backup:create', wrap(async () => {
    if (!api.user || api.user.role !== 'admin') throw Object.assign(new Error('No tiene permiso.'), { userFacing: true });
    const r = await dialog.showSaveDialog(win, { defaultPath: `capsshop-respaldo-${today()}.db`, filters: [{ name: 'Respaldo CAPS Shop', extensions: ['db'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, db.exportBuffer());
    return r.filePath;
  }));

  ipcMain.handle('backup:restore', wrap(async () => {
    if (!api.user || api.user.role !== 'admin') throw Object.assign(new Error('No tiene permiso.'), { userFacing: true });
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Respaldo CAPS Shop', extensions: ['db'] }] });
    if (r.canceled || !r.filePaths.length) return null;
    const file = r.filePaths[0];
    if (!(await validateDatabaseFile(file))) throw Object.assign(new Error('El archivo no es un respaldo válido de CAPS Shop.'), { userFacing: true });
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Cancelar', 'Restaurar'], defaultId: 0, cancelId: 0,
      message: 'Se reemplazarán todos los datos actuales por los del respaldo. ¿Continuar?',
    });
    if (confirm.response !== 1) return null;
    fs.copyFileSync(dbFile(), path.join(backupsDir(), `antes-de-restaurar-${Date.now()}.db`));
    db.close();
    fs.copyFileSync(file, dbFile());
    db = await openDatabase(dbFile());
    api = createApi(db);
    return file;
  }));

  ipcMain.handle('backup:openFolder', wrap(() => shell.openPath(backupsDir())));
}

// Una sola instancia abierta a la vez (evita escribir la base de datos dos veces).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    autoBackup();
    db = await openDatabase(dbFile());
    api = createApi(db);
  } catch (err) {
    dialog.showErrorBox('CAPS Shop', `No se pudo abrir la base de datos:\n${err.message}`);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  app.quit();
});
