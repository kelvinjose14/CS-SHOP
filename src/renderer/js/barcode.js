'use strict';
/* Código de barras Code 128 (juego B: letras, números y signos) para las etiquetas (RF-NUE-04).
   Lo leen todos los lectores de código de barras. Sin bibliotecas: el patrón está en la tabla. */

const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

// Valores del símbolo: inicio B, cada carácter, dígito de control y fin.
function code128Values(text) {
  const s = String(text);
  if (!s.length) throw new Error('El código está vacío.');
  const values = [START_B];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`El código tiene un carácter que no se puede imprimir: "${ch}". Use letras sin acento, números o signos.`);
    values.push(c - 32);
  }
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(check, STOP);
  return values;
}

// Anchos alternados barra/espacio en módulos, empezando por barra.
function code128Widths(text) {
  return code128Values(text).flatMap((v) => CODE128[v].split('').map(Number));
}

// SVG del código, con zona en blanco de 10 módulos a cada lado. Se estira al ancho de la etiqueta.
function barcodeSvg(text, { height = 40 } = {}) {
  const widths = code128Widths(text);
  const quiet = 10;
  let x = quiet;
  let rects = '';
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
    x += w;
  });
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges">${rects}</svg>`;
}

if (typeof module !== 'undefined') module.exports = { CODE128, code128Values, code128Widths, barcodeSvg };
