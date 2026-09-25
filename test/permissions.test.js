'use strict';
// Revisión de seguridad: los permisos se comprueban en el núcleo para TODAS las operaciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../src/core/db');
const { createApi, METHODS } = require('../src/core/api');

test('el vendedor recibe "sin permiso" en cada operación de administrador, y nadie opera sin sesión', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-perm-'));
  const db = await openDatabase(path.join(dir, 'p.db'));
  const api = createApi(db);
  const { token } = api.login({ username: 'vendedor', password: 'vendedor123' });
  const adminOnly = Object.entries(METHODS).filter(([, [roles]]) => !roles.includes('vendedor')).map(([name]) => name);
  assert.ok(adminOnly.length > 25, 'hay operaciones solo de administrador');
  for (const name of adminOnly) {
    assert.throws(() => api.call(token, name, {}), (e) => e.code === 'FORBIDDEN', name);
  }
  for (const name of Object.keys(METHODS)) {
    assert.throws(() => api.call(null, name, {}), (e) => e.code === 'AUTH', name);
  }
  assert.throws(() => api.call(token, 'no.existe', {}), (e) => e.code === 'NOT_FOUND');

  // Con la contraseña inicial solo se puede leer la configuración y cambiar la contraseña.
  assert.throws(() => api.call(token, 'products.list', {}), (e) => e.code === 'PASSWORD');
  assert.ok(api.call(token, 'settings.get'));
  api.call(token, 'auth.changePassword', { current: 'vendedor123', password: 'nueva-clave' });
  assert.ok(Array.isArray(api.call(token, 'products.list', {})));
  db.close();
});
