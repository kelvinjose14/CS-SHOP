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
const log = require('./log');
const os = require('os');

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
  if (!cfg) {
    log.info('inicio', `CAPS Shop ${app.getVersion()} sin configurar`);
    return;
  }
  log.info('inicio', `CAPS Shop ${app.getVersion()} · modo ${cfg.mode}${cfg.mode === 'terminal' ? ` · ${cfg.name} → ${cfg.server.host}:${cfg.server.port}` : ''}`);
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
      if (!err.userFacing) log.error('programa', err.message, err);
      const error = err.userFacing ? err.message : `Error inesperado: ${err.message}. Quedó anotado; el administrador puede enviarlo al soporte con Configuración → Soporte → Guardar diagnóstico.`;
      return { ok: false, error, code: err.code || 'ERROR' };
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
  // Si ya está configurada, solo el administrador puede cambiarla. Excepción: una PC conectada se puede
  // volver a conectar desde la pantalla de entrada, porque si cambió la clave o la dirección nadie puede entrar.
  const setupAllowed = ({ reconnect = false } = {}) => {
    if (!backend) return;
    if (reconnect && backend.mode === 'terminal' && !backend.user()) return;
    backend.requireAdmin();
  };
  // Datos de conexión escritos en la pantalla; devuelve un cliente listo y el saludo de la principal.
  async function reach({ host, port, key }) {
    host = String(host || '').trim();
    if (!host) throw userError('Escriba la dirección de la PC principal.');
    port = Number(port) || net.PORT;
    const client = createClient({ host, port, key: String(key || '').trim().toUpperCase(), version: app.getVersion() });
    const hello = await client.hello();
    if (hello.version !== app.getVersion()) throw net.versionMismatch(hello.version, app.getVersion());
    return { client, hello, host, port };
  }
  ipcMain.handle('setup:discover', wrap(async () => {
    setupAllowed({ reconnect: true });
    return discover({ timeout: 2000 });
  }));
  ipcMain.handle('setup:test', wrap(async (opts) => {
    setupAllowed({ reconnect: true });
    return (await reach(opts)).hello;
  }));
  ipcMain.handle('setup:principal', wrap(async ({ name }) => {
    setupAllowed();
    if (backend && backend.mode === 'principal') throw userError('Esta computadora ya es la PC principal.');
    // Primero el nombre en la base local: si no es válido, esta PC sigue como estaba.
    const db = await openDatabase(dbFile());
    try {
      createApi(db).setTerminalName(1, name);
    } finally {
      db.close();
    }
    const cfg = saveConfig({ mode: 'principal', share: true, key: net.newKey(), server_id: crypto.randomUUID() });
    relaunch();
    return cfg.key;
  }));
  ipcMain.handle('setup:terminal', wrap(async (opts) => {
    setupAllowed({ reconnect: true });
    if (!String(opts.name || '').trim()) throw userError('Escriba un nombre para esta computadora.');
    if (!String(opts.key || '').trim()) throw userError('Escriba la clave de conexión.');
    const { client, hello, host, port } = await reach(opts);
    const terminal = await client.pair(opts.name);
    saveConfig({ mode: 'terminal', terminal_id: terminal.id, name: terminal.name, key: String(opts.key).trim().toUpperCase(), server: { host, port, server_id: hello.server_id, name: hello.name } });
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

  // ---------- Soporte ----------
  // Errores de la interfaz: se guardan en el registro (texto acotado).
  ipcMain.handle('log:renderer', wrap((message) => log.error('interfaz', String(message).slice(0, 4000))));
  ipcMain.handle('support:openLogs', wrap(() => shell.openPath(log.dir)));
  ipcMain.handle('support:diagnostic', wrap(async () => {
    const b = needBackend();
    if (b.mode === 'principal') b.requireAdmin();
    const r = await dialog.showSaveDialog(win, { defaultPath: `capsshop-diagnostico-${today()}.txt`, filters: [{ name: 'Texto', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return null;
    const user = b.user();
    let details;
    try {
      details = b.diagnostics();
    } catch (err) {
      details = [`No se pudieron leer los datos: ${err.message}`];
    }
    const text = [
      'CAPS Shop · diagnóstico para el soporte',
      `Fecha: ${new Date().toString()}`,
      `Versión: ${app.getVersion()} (Electron ${process.versions.electron}, Node ${process.versions.node})`,
      `Sistema: ${os.type()} ${os.release()} ${os.arch()} · equipo ${os.hostname()} · memoria libre ${Math.round(os.freemem() / 1048576)} MB`,
      `Modo: ${b.mode} · usuario: ${user ? `${user.username} (${user.role})` : 'sin sesión'}`,
      `Carpeta de datos: ${dataDir()}`,
      ...details,
      '',
      '---- Registro (últimas 500 líneas) ----',
      log.tail(500),
    ].join('\r\n');
    fs.writeFileSync(r.filePath, text, 'utf8');
    log.info('soporte', `Diagnóstico guardado en ${r.filePath}`);
    return r.filePath;
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

// Nada debe cerrar el programa sin dejar rastro: los errores no capturados van al registro.
process.on('uncaughtException', (err) => log.error('programa', 'Error no capturado', err));
process.on('unhandledRejection', (err) => log.error('programa', 'Promesa rechazada sin capturar', err instanceof Error ? err : new Error(String(err))));

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    log.init(dataDir());
    await startBackend();
  } catch (err) {
    log.error('inicio', 'No se pudo abrir la base de datos', err);
    dialog.showErrorBox('CAPS Shop', `No se pudo abrir la base de datos:\n${err.message}`);
    app.quit();
    return;
  }
  protocol.handle('caps-foto', async (req) => {
    const name = net.safeDecode(new URL(req.url).pathname.slice(1));
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
