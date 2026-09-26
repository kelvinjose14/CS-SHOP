'use strict';
// Genera docs/piloto/aceptacion.md a partir de docs/producto/requisitos.md, para que la lista que
// firma el cliente tenga exactamente los mismos requisitos. Vuelva a ejecutarlo si cambian:
//   node scripts/lista-aceptacion.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'producto', 'requisitos.md');
const TARGET = path.join(ROOT, 'docs', 'piloto', 'aceptacion.md');

// Cómo verificarlo en la tienda cuando el criterio de Requisitos es técnico.
const IN_STORE = {
  'RF-INV-02': 'Venda, compre, devuelva y ajuste una gorra: cada vez cambia la existencia y aparece en su historial',
  'RF-COM-06': 'Registre una compra: la existencia de esas gorras sube en la cantidad comprada',
  'RNF-01': 'Dos computadoras venden a la vez y las dos ven la misma existencia y las mismas ventas',
  'RNF-02': 'Con el internet desconectado (el router encendido), se vende, se compra y se cierra la caja',
  'RNF-03': 'El programa se instala y funciona en cada PC de la tienda (anote la versión de Windows)',
  'RNF-07': 'Apagar una PC conectada a mitad de una venta no deja la venta a medias. El resto lo verifican las pruebas automáticas en cada versión',
  'RNF-08': 'Con los datos reales, las pantallas abren en menos de 1 segundo',
  'RNF-09': 'Al instalar, Windows no muestra "Windows protegió su PC". Depende de comprar el certificado (DT-18)',
  'RNF-13': 'Lo verifica el responsable del sistema: cada versión publicada pasó el CI en verde',
  'RNF-14': 'El dueño tiene el manual y lo usó en la capacitación',
};

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const plain = (s) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();

// Secciones con sus requisitos: { title, note, rows: [{ id, what, how, where }] }.
function parse(md) {
  const sections = [];
  let title = null;
  let header = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^#{2,3} (.+)$/);
    if (h) {
      title = h[1].replace(/^\d+\.\s*/, '');
      header = null;
      if (/Fuera de alcance|Resumen/.test(title)) title = null;
      continue;
    }
    if (!title) continue;
    if (/^\|/.test(line) && !header && !/^\|[-\s|:]+\|$/.test(line)) {
      header = cells(line).map((c) => c.toLowerCase());
      continue;
    }
    const m = line.match(/^\| (RN?F-[A-Z]*-?\d+) \|/);
    if (m && header) {
      const c = cells(line);
      const col = (re) => header.findIndex((x) => re.test(x));
      const what = c[col(/requisito|reporte/)] || '';
      const how = IN_STORE[m[1]] || (col(/criterio/) >= 0 ? c[col(/criterio/)] : '');
      let where = col(/dónde/) >= 0 ? c[col(/dónde/)] : '';
      if (/`/.test(where)) where = ''; // referencias al código: no sirven en la tienda
      let sec = sections[sections.length - 1];
      if (!sec || sec.title !== title) sections.push((sec = { title, note: '', rows: [] }));
      sec.rows.push({ id: m[1], what: plain(what), how: plain(how), where: plain(where) });
      continue;
    }
    const note = line.match(/^Criterio de aceptación: (.+)$/);
    if (note && sections.length && sections[sections.length - 1].title === title) sections[sections.length - 1].note = plain(note[1]);
  }
  return sections;
}

function render(sections, date) {
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const esc = (s) => s.replace(/\|/g, '\\|');
  const out = [
    '# Lista de aceptación',
    '',
    `Cada requisito de [Requisitos](../producto/requisitos.md) se verifica **en la tienda, con datos reales**, durante el piloto ([Plan del piloto](README.md)). Son **${total} requisitos**. Generada el ${date} con \`node scripts/lista-aceptacion.js\`: no la edite a mano.`,
    '',
    '**Cómo se llena:**',
    '1. Imprímala (desde GitHub: botón **Raw** y luego imprimir, o abra el archivo en el navegador).',
    '2. Durante la semana del piloto, el dueño prueba cada punto con la columna **Cómo se verifica**. Marque **Sí** si funciona como dice, o **No** y escriba qué pasó en **Observaciones**.',
    '3. Lo marcado **No** se anota también en la [bitácora](bitacora.md). Se corrige, se publica la corrección y se vuelve a verificar.',
    '4. Al final se firma el acta de la última página.',
    '',
  ];
  for (const s of sections) {
    out.push(`## ${s.title}`, '');
    if (s.note) out.push(`Cómo se verifica (todos): ${s.note}`, '');
    out.push('| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |', '|---|---|---|:-:|:-:|---|');
    for (const r of s.rows) {
      const how = [r.how, r.where && `Dónde: ${r.where}`].filter(Boolean).join('. ');
      out.push(`| ${r.id} | ${esc(r.what)} | ${esc(how)} | ☐ | ☐ | |`);
    }
    out.push('');
  }
  out.push(
    '## Acta de aceptación',
    '',
    `Requisitos verificados: ______ de ${total}. Con observaciones pendientes: ______.`,
    '',
    'Con esta firma, el cliente declara que usó CAPS Shop en la tienda con datos reales durante el piloto, que los requisitos marcados **Sí** funcionan como se describe, y acepta el sistema para uso en producción. Las observaciones pendientes quedan anotadas arriba y en la bitácora, con su compromiso de corrección.',
    '',
    '| | Cliente (dueño de CAPS._.SHOP) | Responsable del sistema |',
    '|---|---|---|',
    '| Nombre | | |',
    '| Firma | | |',
    '| Fecha | | |',
    '| Versión instalada | | |',
    '',
    'Al firmarse, se publica la versión **2.0.0** ([Objetivos, O6](../producto/objetivos.md#o6-piloto-en-tienda-y-aceptación)).',
    ''
  );
  return out.join('\n');
}

function generate({ date = new Date().toISOString().slice(0, 10).split('-').reverse().join('/') } = {}) {
  return render(parse(fs.readFileSync(SOURCE, 'utf8')), date);
}

if (require.main === module) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, generate());
  console.log(`Escrito ${path.relative(ROOT, TARGET)}`);
}

module.exports = { parse, render, generate, SOURCE };
