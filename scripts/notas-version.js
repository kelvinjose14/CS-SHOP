'use strict';
// Notas de una versión para GitHub Releases, tomadas de CHANGELOG.md.
// Uso: node scripts/notas-version.js v1.1.0 [archivo.md]   (sin archivo, las escribe en la salida)
// Falla si la etiqueta no coincide con la versión de package.json (el instalador toma el nombre de
// ahí) o si el CHANGELOG no tiene la sección de esa versión.
const fs = require('fs');
const path = require('path');

function notes(tag, { root = path.join(__dirname, '..') } = {}) {
  const version = String(tag || '').replace(/^refs\/tags\//, '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Etiqueta inválida: "${tag}". Use vX.Y.Z.`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`La etiqueta es v${version} pero package.json dice ${pkg.version}. Suba la versión en un pull request antes de etiquetar.`);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const start = changelog.search(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm'));
  if (start < 0) throw new Error(`CHANGELOG.md no tiene la sección "## [${version}]".`);
  const rest = changelog.slice(start);
  const next = rest.slice(3).search(/^## |^\[[^\]]+\]: /m);
  const body = (next < 0 ? rest : rest.slice(0, next + 3)).split('\n').slice(1).join('\n').trim();
  if (!body) throw new Error(`La sección ${version} del CHANGELOG está vacía.`);
  // En Releases, un enlace relativo (docs/…) no funciona: se apunta al archivo de esa versión.
  const repo = String((pkg.build && pkg.build.publish && pkg.build.publish[0] && `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`) || 'kelvinjose14/CS-SHOP');
  const linked = body.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, target) => `](https://github.com/${repo}/blob/v${version}/${target})`);
  return `${linked}\n\n**Instalar:** descargue \`CAPS-Shop-Setup-${version}.exe\` y ábralo. Si Windows muestra "Windows protegió su PC", pulse **Más información** → **Ejecutar de todas formas** (el instalador todavía no está firmado). Instalar encima de una versión anterior conserva los datos.\n`;
}

if (require.main === module) {
  try {
    const text = notes(process.argv[2]);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], text, 'utf8');
    else process.stdout.write(text);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { notes };
