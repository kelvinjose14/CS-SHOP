'use strict';
// Ayudantes de las pruebas de interfaz: abren la aplicación real (Electron) con una carpeta de datos temporal.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'v1.0.0.db');

// Carpeta de datos nueva; con demo: true lleva la base de muestra de la versión 1.0.0.
function dataDir({ demo = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-ui-'));
  if (demo) {
    fs.copyFileSync(FIXTURE, path.join(dir, 'capsshop.db'));
    fs.cpSync(path.join(ROOT, 'test', 'fixtures', 'fotos'), path.join(dir, 'fotos'), { recursive: true });
  }
  return dir;
}

/**
 * Abre la aplicación. Cualquier error de la página o de la consola hace fallar la prueba al cerrar.
 * CAPSSHOP_EXE permite probar el programa instalado en lugar del código del repositorio.
 */
async function launch(t, dir, { width = 1280, height = 800 } = {}) {
  const exe = process.env.CAPSSHOP_EXE;
  const app = await electron.launch({
    executablePath: exe || require('electron'),
    args: exe ? [] : [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, CAPSSHOP_DATA: dir, CAPSSHOP_NO_RELAUNCH: '1' },
    timeout: 60000,
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  win.on('console', (m) => {
    // Los avisos de "sin conexión" se registran a propósito en las pruebas de red.
    if (m.type() === 'error' && !/OFFLINE|Sin conexión|sesión terminó/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await win.setViewportSize({ width, height });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await app.close().catch(() => {});
  };
  t.after(close);
  return { app, win, errors, close };
}

async function login(win, username, password) {
  await win.waitForSelector('#login-form');
  await win.fill('[name=username]', username);
  await win.fill('[name=password]', password);
  await win.click('#login-form button[type=submit]');
  await win.waitForSelector('.sidebar, #pw-form', { timeout: 20000 });
  if (await win.$('#pw-form')) {
    await win.fill('#pw-form [name=current]', password);
    await win.fill('#pw-form [name=password]', password);
    await win.fill('#pw-form [name=password2]', password);
    await win.click('#pw-form button[type=submit]');
    await win.waitForSelector('.sidebar', { timeout: 20000 });
  }
}

// Navega y espera a que la pantalla termine de cargar (incluidas las que piden datos por período).
async function go(win, route, params) {
  await win.evaluate(([r, p]) => App.go(r, p || {}), [route, params]);
  await settle(win);
}

function settle(win) {
  return win.evaluate(() => new Promise((resolve) => {
    let last = -1;
    let same = 0;
    const tick = () => {
      const page = document.querySelector('#page') || document.body;
      const n = page.innerHTML.length;
      if (n === last && !page.querySelector('.loading')) same++;
      else { same = 0; last = n; }
      if (same >= 5) resolve();
      else setTimeout(tick, 30);
    };
    tick();
  }));
}

// Espera a que una condición se cumpla (por ejemplo, que una operación enviada desde un diálogo termine).
async function eventually(fn, { timeout = 10000, every = 100 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const ok = await fn();
    if (ok) return ok;
    if (Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, every));
  }
}

const text = (win, sel) => win.textContent(sel).then((s) => s.replace(/\s+/g, ' ').trim());

module.exports = { ROOT, dataDir, launch, login, go, settle, text, eventually };
