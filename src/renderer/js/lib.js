'use strict';
/* Utilidades de interfaz compartidas por todas las pantallas. */

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const raw = (s) => new Raw(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toHtml = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(toHtml).join('') : v === false || v === null || v === undefined ? '' : esc(v));
function html(strings, ...vals) {
  return raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? toHtml(vals[i]) : ''), ''));
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function setHTML(el, content) { el.innerHTML = toHtml(content); return el; }
function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = toHtml(markup).trim();
  return t.content.firstElementChild;
}

/* ---------- Formatos ---------- */
const Fmt = {
  currency: 'RD$',
  money(n) {
    const v = Number(n) || 0;
    return `${v < 0 ? '-' : ''}${Fmt.currency} ${Math.abs(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  num(n) { return (Number(n) || 0).toLocaleString('es-DO'); },
  pct(n) { return `${(Number(n) || 0).toFixed(1)}%`; },
  date(s) {
    if (!s) return '';
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },
  datetime(s) { return s ? `${Fmt.date(s)} ${s.slice(11, 16)}` : ''; },
  saleNo(id) { return `V-${String(id).padStart(6, '0')}`; },
  purchaseNo(id) { return `C-${String(id).padStart(6, '0')}`; },
};
const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' };
const STATUS_LABELS = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado', anulada: 'Anulada', abierta: 'Abierta', cerrada: 'Cerrada', ok: 'Normal', bajo: 'Stock bajo', agotado: 'Agotado', vencido: 'Vencido' };
const STATUS_CLASS = { pendiente: 'warn', parcial: 'info', pagado: 'ok', anulada: 'muted', abierta: 'ok', cerrada: 'muted', ok: 'ok', bajo: 'warn', agotado: 'danger', vencido: 'danger' };
const badge = (status, label) => html`<span class="badge ${STATUS_CLASS[status] || ''}">${label || STATUS_LABELS[status] || status}</span>`;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Iconos (trazos simples) ---------- */
const ICONS = {
  pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><path d="M12 19.5v.01"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12l2-8H6.2"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  swap: '<path d="M4 7h14l-3-3M20 17H6l3 3"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  factory: '<path d="M3 21V9l6 4V9l6 4V5h6v16z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2.5.5 4 2.8 4 6"/>',
  inbox: '<path d="M3 13l3-9h12l3 9v7H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  outbox: '<path d="M12 3v11M7 8l5-5 5 5"/><path d="M3 14v7h18v-7"/>',
  wallet: '<path d="M3 7h16a2 2 0 012 2v10H3z"/><path d="M3 7l12-4v4"/><circle cx="16.5" cy="13" r="1.2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M3 21h18"/><path d="M6 17V10M11 17V5M16 17v-5M21 17V8"/>',
  flow: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  history: '<path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M7 14h10v7H7z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
};
const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);

/* ---------- Llamadas al sistema ---------- */
// Errores que obligan a entrar de nuevo (sesión vencida, PC desactivada, clave o versión distinta).
const SESSION_ERRORS = ['AUTH', 'TERMINAL', 'KEY', 'VERSION'];
// Errores de conexión con la PC principal: en la pantalla de entrada permiten volver a configurar la PC.
const CONNECTION_ERRORS = ['OFFLINE', 'KEY', 'TERMINAL', 'VERSION'];
async function api(name, params, { silent = false } = {}) {
  try {
    return await window.capsApi.call(name, params);
  } catch (err) {
    if (SESSION_ERRORS.includes(err.code)) { App.onLoggedOut(err.message, err.code); throw err; }
    if (err.code === 'OFFLINE') { App.showOffline(err.message); throw err; }
    if (!silent) toast(err.message, 'error');
    throw err;
  }
}

/* ---------- Avisos y diálogos ---------- */
function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = el(html`<div id="toasts"></div>`); document.body.appendChild(box); }
  const t = el(html`<div class="toast ${type}">${message}</div>`);
  box.appendChild(t);
  setTimeout(() => t.classList.add('hide'), type === 'error' ? 5000 : 2800);
  setTimeout(() => t.remove(), type === 'error' ? 5500 : 3300);
}

function modal({ title, body, actions = [], width = 560, onClose }) {
  const back = el(html`
    <div class="modal-back">
      <div class="modal" style="width:${width}px" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close title="Cerrar">${icon('x')}</button></div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    </div>`);
  const bodyEl = $('.modal-body', back);
  if (body instanceof Raw || typeof body === 'string') setHTML(bodyEl, body);
  else if (body) bodyEl.appendChild(body);
  const foot = $('.modal-foot', back);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && document.body.lastElementChild === back) close(); };
  document.addEventListener('keydown', onKey);
  $('[data-close]', back).onclick = close;
  if (!actions.length) foot.remove();
  for (const a of actions) {
    const b = el(html`<button class="btn ${a.primary ? 'primary' : a.danger ? 'danger' : ''}">${a.label}</button>`);
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const r = await a.onClick({ close, body: bodyEl });
        if (r !== false) close();
      } catch (err) {
        if (!err.code) toast(err.message, 'error');
      } finally {
        b.disabled = false;
      }
    };
    foot.appendChild(b);
  }
  document.body.appendChild(back);
  const first = $('input:not([type=hidden]):not([disabled]), select, textarea', bodyEl);
  // Solo si el usuario todavía no está escribiendo dentro de la ventana (no le quita el cursor).
  if (first) setTimeout(() => { if (!back.contains(document.activeElement)) first.focus(); }, 30);
  return { close, el: back, body: bodyEl };
}

function confirmDialog(message, { title = 'Confirmar', okLabel = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: html`<p>${message}</p>`,
      width: 440,
      onClose: () => { if (!answered) resolve(false); },
      actions: [
        { label: 'Cancelar' },
        { label: okLabel, primary: !danger, danger, onClick: () => { answered = true; resolve(true); } },
      ],
    });
  });
}

function promptDialog({ title, label, placeholder = '', required = true, textarea = false }) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      width: 460,
      body: html`<label class="field"><span>${label}</span>${textarea ? html`<textarea name="v" rows="3" placeholder="${placeholder}"></textarea>` : html`<input name="v" placeholder="${placeholder}">`}</label>`,
      onClose: () => { if (!answered) resolve(null); },
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Aceptar', primary: true,
          onClick: ({ body }) => {
            const v = $('[name=v]', body).value.trim();
            if (required && !v) { toast('Este campo es obligatorio.', 'error'); return false; }
            answered = true;
            resolve(v);
          },
        },
      ],
    });
  });
}

/* ---------- Formularios ---------- */
function formData(root) {
  const out = {};
  $$('[name]', root).forEach((i) => {
    if (i.type === 'checkbox') out[i.name] = i.checked;
    else if (i.type === 'radio') { if (i.checked) out[i.name] = i.value; }
    else out[i.name] = i.value;
  });
  return out;
}
const options = (list, selected, { empty } = {}) => raw(
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  list.map((o) => {
    const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('')
);
const methodOptions = (selected = 'efectivo') => options(Object.entries(METHOD_LABELS), selected);

/* ---------- Tablas ---------- */
/**
 * columns: [{ key, label, render(row), align: 'right'|'center', money: true, total: true|fn, cls }]
 */
function table({ columns, rows, empty = 'No hay registros.', rowClass, clickable = false, totalsLabel = 'Totales' }) {
  const cell = (c, r) => {
    if (c.render) return toHtml(c.render(r));
    const v = r[c.key];
    if (c.money) return esc(Fmt.money(v));
    if (c.date) return esc(Fmt.date(v));
    if (c.datetime) return esc(Fmt.datetime(v));
    if (c.num) return esc(Fmt.num(v));
    return esc(v);
  };
  const align = (c) => (c.align ? `text-${c.align}` : c.money || c.num ? 'text-right' : '');
  const hasTotals = columns.some((c) => c.total);
  let foot = '';
  if (hasTotals && rows.length) {
    foot = '<tfoot><tr>' + columns.map((c, i) => {
      if (!c.total) return `<td>${i === 0 ? esc(totalsLabel) : ''}</td>`;
      const v = typeof c.total === 'function' ? c.total(rows) : rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      return `<td class="${align(c)}">${esc(c.money ? Fmt.money(v) : Fmt.num(v))}</td>`;
    }).join('') + '</tr></tfoot>';
  }
  return raw(`
    <div class="table-wrap"><table class="table ${clickable ? 'clickable' : ''}">
      <thead><tr>${columns.map((c) => `<th class="${align(c)} ${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map((r, i) => `<tr data-idx="${i}" class="${rowClass ? esc(rowClass(r) || '') : ''}">${columns.map((c) => `<td class="${align(c)} ${c.cls || ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="empty">${esc(empty)}</td></tr>`}</tbody>
      ${foot}
    </table></div>`);
}
function onRowClick(root, rows, fn) {
  $$('tbody tr[data-idx]', root).forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, select')) return;
      fn(rows[Number(tr.dataset.idx)], e);
    });
  });
}

/* ---------- Exportar ---------- */
function toCsv(columns, rows) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const value = (c, r) => (c.csv ? c.csv(r) : c.money ? (Number(r[c.key]) || 0).toFixed(2) : c.date ? Fmt.date(r[c.key]) : c.datetime ? Fmt.datetime(r[c.key]) : r[c.key]);
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(value(c, r))).join(','))].join('\r\n');
}
async function exportCsv(name, columns, rows) {
  const cols = columns.filter((c) => c.label && c.csv !== false);
  const path = await window.capsApi.saveText({ defaultName: `${name}-${todayStr()}.csv`, content: toCsv(cols, rows) });
  if (path) toast('Archivo exportado.');
}
async function exportPdf(name, { landscape = false } = {}) {
  document.body.classList.add('printing');
  try {
    const p = await window.capsApi.savePdf({ defaultName: `${name}-${todayStr()}.pdf`, landscape });
    if (p) toast('PDF guardado.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    document.body.classList.remove('printing');
  }
}

/* ---------- Selector de período ---------- */
function periodPicker(root, onChange, { initial = 'mes', allowAll = false } = {}) {
  const state = { period: initial, from: todayStr(), to: todayStr() };
  const box = el(html`
    <div class="period">
      <div class="seg">
        ${[['dia', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['rango', 'Rango'], ...(allowAll ? [['todo', 'Todo']] : [])].map(([v, l]) => html`<button data-p="${v}" class="${v === initial ? 'active' : ''}">${l}</button>`)}
      </div>
      <div class="range ${initial === 'rango' ? '' : 'hidden'}">
        <input type="date" name="from" value="${state.from}"> <span>a</span> <input type="date" name="to" value="${state.to}">
      </div>
      <span class="range-label"></span>
    </div>`);
  const emit = async () => {
    let range;
    if (state.period === 'todo') range = { from: '2000-01-01', to: '2999-12-31' };
    else range = await api('reports.range', state);
    $('.range-label', box).textContent = state.period === 'todo' ? 'Todo el historial' : range.from === range.to ? Fmt.date(range.from) : `${Fmt.date(range.from)} – ${Fmt.date(range.to)}`;
    onChange({ ...state, ...range, period: state.period === 'todo' ? 'rango' : state.period });
  };
  $$('[data-p]', box).forEach((b) => (b.onclick = () => {
    $$('[data-p]', box).forEach((x) => x.classList.toggle('active', x === b));
    state.period = b.dataset.p;
    $('.range', box).classList.toggle('hidden', state.period !== 'rango');
    emit();
  }));
  $$('.range input', box).forEach((i) => (i.onchange = () => { state[i.name] = i.value; if (state.from && state.to) emit(); }));
  root.appendChild(box);
  emit();
  return state;
}

/* ---------- Gráfico de barras SVG ---------- */
function barChart(series, { keys, labels, colors, height = 220, formatX = (k) => k }) {
  if (!series.some((s) => keys.some((k) => s[k]))) return html`<div class="empty-chart">Sin datos en el período.</div>`;
  const W = Math.max(series.length * 34, 600);
  const H = height;
  const pad = { l: 64, r: 12, t: 12, b: 28 };
  const vals = series.flatMap((s) => keys.map((k) => s[k] || 0));
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min;
  const y = (v) => pad.t + ((max - v) / span) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / series.length;
  const inner = Math.min(26, Math.max(4, (bw * 0.72) / keys.length));
  let out = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + (span * i) / 4;
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${esc(compact(v))}</text>`;
  }
  series.forEach((s, i) => {
    keys.forEach((k, j) => {
      const v = s[k] || 0;
      if (!v) return;
      const x = pad.l + i * bw + (bw - inner * keys.length) / 2 + j * inner;
      const top = y(Math.max(v, 0));
      const hgt = Math.abs(y(v) - y(0));
      out += `<rect x="${x}" y="${top}" width="${inner - 1}" height="${Math.max(hgt, 0.5)}" rx="2" fill="${colors[j]}"><title>${esc(formatX(s.k))} · ${esc(labels[j])}: ${esc(Fmt.money(v))}</title></rect>`;
    });
    const every = Math.ceil(series.length / 16);
    if (i % every === 0) out += `<text x="${pad.l + i * bw + bw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(formatX(s.k))}</text>`;
  });
  const legend = keys.map((k, j) => `<span><i style="background:${colors[j]}"></i>${esc(labels[j])}</span>`).join('');
  return raw(`<div class="chart"><div class="legend">${legend}</div><div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.round(W * 0.7)}px;max-height:${H + 60}px">${out}</svg></div></div>`);
}
function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return Math.round(v).toString();
}
const shortDate = (k) => (k.length === 7 ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4) : `${k.slice(8, 10)}/${k.slice(5, 7)}`);

/* ---------- Fotos ---------- */
function photoUrl(name) {
  return name ? App.info.photosUrl + encodeURIComponent(name) : null;
}
// Si falta el archivo de una foto (por ejemplo, tras restaurar una copia sin las fotos), se muestra el ícono.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('thumb')) return;
  const ph = el(html`<span class="thumb ph" style="${img.getAttribute('style') || ''}" title="Falta el archivo de la foto">${icon('tag')}</span>`);
  img.replaceWith(ph);
}, true);

function productThumb(p, size = 40) {
  const url = photoUrl(p.photo);
  return url
    ? html`<img class="thumb" src="${url}" style="width:${size}px;height:${size}px" alt="">`
    : html`<span class="thumb ph" style="width:${size}px;height:${size}px">${icon('tag')}</span>`;
}
// Reduce la imagen seleccionada para no llenar el disco.
function readImage(file, max = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const productLabel = (p) => [p.name, p.color, p.size].filter(Boolean).join(' · ');
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
