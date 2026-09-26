'use strict';
// Separador de listas y de decimales de la región de Windows de esta PC. Excel abre un CSV con ese
// separador: con la región de República Dominicana es la coma, pero con otras (España, por ejemplo) es el
// punto y coma y el decimal es la coma. Sin eso, Excel mostraba todo en una columna (auditoría 2.10).
const { execFileSync } = require('child_process');

const DEFAULT = { sep: ',', dec: '.' };
let cached = null;

// Lee la salida de `reg query "HKCU\Control Panel\International"`.
function parseRegistry(out) {
  const value = (name) => {
    const m = new RegExp(`^\\s*${name}\\s+REG_SZ\\s+(.+?)\\s*$`, 'mi').exec(out || '');
    return m ? m[1] : null;
  };
  return normalize({ sep: value('sList'), dec: value('sDecimal') });
}

function normalize({ sep, dec }) {
  sep = sep && sep.length === 1 ? sep : DEFAULT.sep;
  dec = dec && dec.length === 1 ? dec : DEFAULT.dec;
  // Si los dos fueran iguales, los números se confundirían con las columnas.
  if (sep === dec) sep = dec === ',' ? ';' : ',';
  return { sep, dec };
}

function windowsFormat() {
  if (cached) return cached;
  if (process.platform !== 'win32') return (cached = { ...DEFAULT });
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Control Panel\\International'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    cached = parseRegistry(out);
  } catch {
    cached = { ...DEFAULT };
  }
  return cached;
}

// Formato elegido en Configuración: auto (el de esta PC), coma o punto_y_coma.
function csvFormat(setting) {
  if (setting === 'coma') return { sep: ',', dec: '.' };
  if (setting === 'punto_y_coma') return { sep: ';', dec: ',' };
  return windowsFormat();
}

module.exports = { csvFormat, parseRegistry };
