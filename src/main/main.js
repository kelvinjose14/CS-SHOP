'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { openDatabase } = require('../core/db');
const { createApi } = require('../core/api');
const { AppError, today } = require('../core/util');
const net = require('../net/server');
const { createClient, discover } = require('../net/client');
const config = require('./config');
const { createLocal, createRemote } = require('./backend');

// Para pruebas: otra carpeta de datos permite abrir dos instancias (principal y conectada) en la misma PC.
if (process.env.CAPSSHOP_DATA) app.setPath('userData', path.join(process.env.CAPSSHOP_DATA, 'electron'));

// Las fotos de productos se piden con caps-foto://foto/<nombre>, estén en esta PC o en la principal.
protocol.registerSchemesAsPrivileged([{ scheme: 'caps-foto', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;
let backend = null; // null: esta PC todavía no está configurada

const dataDir = () => process.env.CAPSSHOP_DATA || path.join(app.getPath('userData'), 'data');
const dbFile = () => path.join(dataDir(), 'capsshop.db');
const saveConfig = (cfg) => config.save(dataDir(), cfg);
const userError = (message, code) => new AppError(message, code);

async function startBackend() {
  let cfg = config.load(dataDir());
  if (!cfg && fs.existsSync(dbFile())) {
    // Actualización desde 1.0.0: esta PC ya tiene los datos, así que es la principal (sin compartir hasta que se active).
    cfg = saveConfig({ mode: 'principal', share: false, key: net.newKey(), server_id: crypto.randomUUID() });
  }
  if (!cfg) return;
  if (cfg.mode === 'principal') {
    backend = await createLocal({ dataDir: dataDir(), version: app.getVersion(), config: cfg, saveConfig });
    backend.autoBackup();
  } else {
    backend = createRemote({ version: app.getVersion(), config: cfg, saveConfig });
  }
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

function needBackend() {
  if (!backend) throw userError('Esta computadora todavía no está configurada.', 'SETUP');
  return backend;
}

function needPrincipal() {
  const b = needBackend();
  if (b.mode !== 'principal') throw userError('Las copias de seguridad se hacen en la PC principal.', 'FORBIDDEN');
  b.requireAdmin();
  return b;
}

// Guarda la nueva configuración de esta PC y reinicia el programa.
function relaunch() {
  setTimeout(async () => {
    if (backend) await backend.close().catch(() => {});
    backend = null;
    // CAPSSHOP_NO_RELAUNCH: en pruebas automáticas el programa se vuelve a abrir desde la prueba.
    if (!process.env.CAPSSHOP_NO_RELAUNCH) app.relaunch();
    app.exit(0);
  }, 300);
}

function registerIpc() {
  ipcMain.handle('app:info', wrap(() => ({
    version: app.getVersion(),
    dataDir: dataDir(),
    photosUrl: 'caps-foto://foto/',
    needsSetup: !backend,
    hasLocalData: fs.existsSync(dbFile()),
    ...(backend ? backend.info() : { user: null }),
  })));
  ipcMain.handle('auth:login', wrap((p) => needBackend().login(p.username, p.password)));
  ipcMain.handle('auth:logout', wrap(() => needBackend().logout()));
  ipcMain.handle('api:call', wrap((name, params) => needBackend().call(name, params)));
  ipcMain.handle('net:ping', wrap(() => needBackend().ping()));

  // ---------- Configurar esta PC ----------
  // Si ya está configurada, solo el administrador puede cambiarla. Una PC conectada también se puede
  // reconfigurar desde la pantalla de entrada: si cambió la clave o la dirección, nadie puede entrar para hacerlo.
  const setupAllowed = () => {
    if (!backend) return;
    if (backend.mode === 'terminal' && !backend.user()) return;
    backend.requireAdmin();
  };
  ipcMain.handle('setup:discover', wrap(async () => {
    setupAllowed();
    return discover({ timeout: 2000 });
  }));
  ipcMain.handle('setup:test', wrap(async ({ host, port, key }) => {
    setupAllowed();
    const hello = await createClient({ host, port: Number(port) || net.PORT, key, version: app.getVersion() }).hello();
    if (hello.version !== app.getVersion()) {
      throw userError(`La PC principal tiene la versión ${hello.version} y esta computadora la ${app.getVersion()}. Instale la misma versión en todas las computadoras.`, 'VERSION');
    }
    return hello;
  }));
  ipcMain.handle('setup:principal', wrap(async ({ name }) => {
    setupAllowed();
    const cfg = { mode: 'principal', share: true, key: net.newKey(), server_id: crypto.randomUUID() };
    if (backend && backend.mode === 'principal') throw userError('Esta computadora ya es la PC principal.');
    if (backend) await backend.close();
    backend = null;
    const db = await openDatabase(dbFile());
    try {
      createApi(db).setTerminalName(1, name);
    } finally {
      db.close();
    }
    saveConfig(cfg);
    relaunch();
    return cfg.key;
  }));
  ipcMain.handle('setup:terminal', wrap(async ({ host, port, key, name }) => {
    setupAllowed();
    port = Number(port) || net.PORT;
    const client = createClient({ host, port, key, version: app.getVersion() });
    const hello = await client.hello();
    if (hello.version !== app.getVersion()) {
      throw userError(`La PC principal tiene la versión ${hello.version} y esta computadora la ${app.getVersion()}. Instale la misma versión en todas las computadoras.`, 'VERSION');
    }
    const terminal = await client.pair(name);
    saveConfig({ mode: 'terminal', terminal_id: terminal.id, name: terminal.name, key: String(key).trim().toUpperCase(), server: { host, port, server_id: hello.server_id, name: hello.name } });
    relaunch();
    return terminal;
  }));

  // ---------- Red de la PC principal ----------
  ipcMain.handle('net:setShare', wrap(async (on) => {
    const b = needBackend();
    if (b.mode !== 'principal') throw userError('Solo la PC principal comparte sus datos.');
    await b.setShare(on);
    return b.info().network;
  }));
  ipcMain.handle('net:newKey', wrap(async () => {
    const b = needBackend();
    if (b.mode !== 'principal') throw userError('La clave se cambia en la PC principal.');
    return b.newKey();
  }));

  // ---------- Archivos e impresión (siempre en esta PC) ----------
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
        else reject(userError(`No se pudo imprimir: ${reason}`));
      });
    });
  })));

  // ---------- Respaldos (solo en la PC principal) ----------
  ipcMain.handle('backup:create', wrap(async () => {
    const b = needPrincipal();
    const r = await dialog.showSaveDialog(win, { defaultPath: `capsshop-respaldo-${today()}.db`, filters: [{ name: 'Respaldo CAPS Shop', extensions: ['db'] }] });
    if (r.canceled || !r.filePath) return null;
    b.backupTo(r.filePath);
    return r.filePath;
  }));

  ipcMain.handle('backup:restore', wrap(async () => {
    const b = needPrincipal();
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Respaldo CAPS Shop', extensions: ['db'] }] });
    if (r.canceled || !r.filePaths.length) return null;
    const file = r.filePaths[0];
    if (!(await b.validate(file))) throw userError('El archivo no es un respaldo válido de CAPS Shop.');
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Cancelar', 'Restaurar'], defaultId: 0, cancelId: 0,
      message: 'Se reemplazarán todos los datos actuales por los del respaldo. Todas las computadoras deberán entrar de nuevo. ¿Continuar?',
    });
    if (confirm.response !== 1) return null;
    await b.restore(file);
    return file;
  }));

  ipcMain.handle('backup:openFolder', wrap(() => shell.openPath(needPrincipal().backupsDir)));
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
    await startBackend();
  } catch (err) {
    dialog.showErrorBox('CAPS Shop', `No se pudo abrir la base de datos:\n${err.message}`);
    app.quit();
    return;
  }
  protocol.handle('caps-foto', async (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.slice(1));
    const img = backend ? await backend.photo(name).catch(() => null) : null;
    if (!img) return new Response(null, { status: 404 });
    return new Response(img.data, { headers: { 'content-type': img.type } });
  });
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
});

let closing = false;
app.on('window-all-closed', async () => {
  if (closing) return;
  closing = true;
  if (backend) await backend.close().catch(() => {});
  app.quit();
});
