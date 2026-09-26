'use strict';
// Notas de la versión para GitHub Releases (scripts/notas-version.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { notes } = require('../scripts/notas-version');

function repo(version, changelog) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsshop-rel-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

const CHANGELOG = '# Cambios\n\n## Sin publicar\n\n## [1.2.0] - 2026-10-01\n\n### Agregado\n- Conteo.\n- [Manual](docs/manual/04-inventario.md#49-conteo) y [web](https://ejemplo.com).\n\n## [1.1.0] - 2026-09-26\n\n- Piloto.\n\n[1.2.0]: https://x\n[1.1.0]: https://y\n';

test('toma solo la sección de la versión y agrega cómo instalar', () => {
  const root = repo('1.2.0', CHANGELOG);
  const text = notes('refs/tags/v1.2.0', { root });
  assert.match(text, /^### Agregado\n- Conteo\./);
  assert.doesNotMatch(text, /Piloto|https:\/\/x/);
  assert.match(text, /CAPS-Shop-Setup-1\.2\.0\.exe/);
  assert.match(text, /\[Manual\]\(https:\/\/github\.com\/kelvinjose14\/CS-SHOP\/blob\/v1\.2\.0\/docs\/manual\/04-inventario\.md#49-conteo\)/, 'enlace relativo → archivo de esa versión');
  assert.match(text, /\[web\]\(https:\/\/ejemplo\.com\)/);
  assert.match(notes('v1.1.0', { root: repo('1.1.0', CHANGELOG) }), /^- Piloto\.\n\n\*\*Instalar/);
});

test('falla si la etiqueta no coincide con package.json o falta la sección', () => {
  assert.throws(() => notes('v1.2.0', { root: repo('1.1.0', CHANGELOG) }), /package\.json dice 1\.1\.0/);
  assert.throws(() => notes('v1.3.0', { root: repo('1.3.0', CHANGELOG) }), /no tiene la sección/);
  assert.throws(() => notes('1.2', { root: repo('1.2.0', CHANGELOG) }), /Etiqueta inválida/);
});

test('las notas de la versión actual del repositorio existen', () => {
  const { version } = require('../package.json');
  assert.ok(notes(`v${version}`).length > 100);
});
