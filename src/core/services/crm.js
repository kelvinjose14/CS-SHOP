'use strict';
// CRM de clientes (versión 1.6): lo que compra cada cliente, cada cuánto, si dejó de venir, si es VIP,
// su cumpleaños, etiquetas y notas de seguimiento. Todo son ventas (lo que pagó), nunca costos ni
// utilidad: el vendedor también ve la ficha (DT-36).
const { AppError, now, today, addDays, round2, text } = require('../util');
const { audit, getSetting, crmEnabled } = require('./common');

const SEGMENT_LABELS = {
  nuevo: 'Nuevo', frecuente: 'Frecuente', ocasional: 'Ocasional', en_riesgo: 'En riesgo', perdido: 'Perdido', sin_compras: 'Sin compras',
};

// Para considerar que dejó de venir: al menos 45 días (en riesgo) o 90 (perdido), o el doble y el triple
// de lo que normalmente tarda entre compra y compra, lo que sea mayor.
const RISK_MIN = 45;
const LOST_MIN = 90;
const NEW_DAYS = 30;

const dayDiff = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

// Métricas de todos los clientes en una sola consulta (sin saldos iniciales ni ventas anuladas).
function metrics(db, t = today()) {
  const year = addDays(t, -364);
  const rows = db.all(
    `SELECT customer_id AS id, COUNT(*) AS purchases, SUM(total - returned_total) AS spent, MIN(date) AS first_purchase, MAX(date) AS last_purchase,
            SUM(CASE WHEN date >= ? THEN total - returned_total ELSE 0 END) AS spent_12m,
            SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS purchases_12m
       FROM sales WHERE customer_id IS NOT NULL AND status <> 'anulada' AND opening = 0 GROUP BY customer_id`,
    [year, year]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

function classify(m, t, vipMin, vipMode) {
  const out = {
    purchases: 0, spent: 0, spent_12m: 0, purchases_12m: 0, avg_ticket: 0, first_purchase: null, last_purchase: null,
    days_since: null, interval_days: null, segment: 'sin_compras',
  };
  if (m && m.purchases > 0) {
    Object.assign(out, {
      purchases: m.purchases, spent: round2(m.spent), spent_12m: round2(m.spent_12m), purchases_12m: m.purchases_12m,
      avg_ticket: round2(m.spent / m.purchases), first_purchase: m.first_purchase, last_purchase: m.last_purchase,
      days_since: dayDiff(m.last_purchase, t),
    });
    if (m.purchases > 1) out.interval_days = Math.round(dayDiff(m.first_purchase, m.last_purchase) / (m.purchases - 1));
    const risk = Math.max(RISK_MIN, out.interval_days ? 2 * out.interval_days : 0);
    const lost = Math.max(LOST_MIN, out.interval_days ? 3 * out.interval_days : 0);
    if (out.days_since > lost) out.segment = 'perdido';
    else if (out.days_since > risk) out.segment = 'en_riesgo';
    // Nuevo: empezó a comprar hace poco y todavía no es frecuente.
    else if (dayDiff(m.first_purchase, t) <= NEW_DAYS && m.purchases_12m < 3) out.segment = 'nuevo';
    else if (m.purchases_12m >= 3) out.segment = 'frecuente';
    else out.segment = 'ocasional';
  }
  out.vip = vipMode === 'si' ? 1 : vipMode === 'no' ? 0 : vipMin > 0 && out.spent_12m >= vipMin ? 1 : 0;
  return out;
}

// Días que faltan para el próximo cumpleaños ("MM-DD"), 0 si es hoy.
function daysToBirthday(birthday, t = today()) {
  if (!birthday) return null;
  const [mm, dd] = birthday.split('-').map(Number);
  const y = Number(t.slice(0, 4));
  const pad = (n) => String(n).padStart(2, '0');
  // El 29 de febrero se celebra el 28 en los años que no son bisiestos.
  const on = (year) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return `${year}-${pad(mm)}-${pad(mm === 2 && dd === 29 && !leap ? 28 : dd)}`;
  };
  const d = dayDiff(t, on(y));
  return d >= 0 ? d : dayDiff(t, on(y + 1));
}

const parseTags = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

// Agrega los datos del CRM a las filas de clientes.
function enrich(ctx, rows) {
  const t = today();
  const m = metrics(ctx.db, t);
  const vipMin = Number(getSetting(ctx.db, 'vip_min_spend')) || 0;
  return rows.map((c) => ({
    ...c,
    ...classify(m.get(c.id), t, vipMin, c.vip_mode),
    tags: parseTags(c.tags),
    birthday_in: daysToBirthday(c.birthday, t),
  }));
}

// Cumpleaños "31/12", "31-12" o "12-31" → "12-31". Vacío = sin cumpleaños.
function cleanBirthday(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = /^(\d{1,2})[/-](\d{1,2})$/.exec(s); // día/mes, como se escribe en República Dominicana
  let dd;
  let mm;
  if (m) { dd = Number(m[1]); mm = Number(m[2]); }
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { mm = Number(m[2]); dd = Number(m[3]); }
  else if ((m = /^(\d{2})-(\d{2})$/.exec(s))) { mm = Number(m[1]); dd = Number(m[2]); }
  else throw new AppError('Cumpleaños: escriba el día y el mes, por ejemplo 15/08.');
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  if (!max || dd < 1 || dd > max) throw new AppError(`Cumpleaños: el ${dd}/${mm} no existe.`);
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Etiquetas: "mayorista, NY, mayorista" → ["mayorista", "NY"]. Hasta 10, de 30 caracteres.
function cleanTags(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(',');
  const out = [];
  for (const x of list.map((s) => String(s).trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (x.length > 30) throw new AppError(`La etiqueta "${x.slice(0, 30)}…" es demasiado larga (máximo 30 caracteres).`);
    if (!out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
  }
  if (out.length > 10) throw new AppError('Un cliente puede tener hasta 10 etiquetas.');
  return out.length ? JSON.stringify(out) : null;
}

// Lo que más compra: categorías, marcas y gorras por unidades (sin devoluciones).
function favorites(db, customerId) {
  const base = `FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
                WHERE s.customer_id = ? AND s.status <> 'anulada' AND si.qty > si.returned_qty`;
  const top = (label) => db.all(`SELECT ${label} AS name, SUM(si.qty - si.returned_qty) AS units ${base} GROUP BY 1 ORDER BY units DESC, name LIMIT 5`, [customerId]);
  return {
    categories: top("COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría')"),
    brands: top("COALESCE(NULLIF(TRIM(p.brand), ''), 'Sin marca')"),
    products: top("p.name || COALESCE(' · ' || NULLIF(p.color, ''), '') || COALESCE(' · ' || NULLIF(p.size, ''), '')"),
    sizes: top("COALESCE(NULLIF(TRIM(p.size), ''), '—')").filter((x) => x.name !== '—'),
  };
}

function notes(db, customerId) {
  return db.all('SELECT n.*, u.name AS user_name FROM customer_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.customer_id = ? ORDER BY n.id DESC', [customerId]);
}

function addNote(ctx, { customer_id, text: body }) {
  const c = ctx.db.get('SELECT id, name FROM customers WHERE id = ?', [customer_id]);
  if (!c) throw new AppError('Cliente no encontrado.');
  const note = text(body, 'Nota', { required: true, max: 1000 });
  const id = ctx.db.insert('customer_notes', { customer_id: c.id, text: note, user_id: ctx.user.id, created_at: now() });
  audit(ctx, 'nota_cliente', 'cliente', c.id, { cliente: c.name });
  return id;
}

// Cumpleaños de los próximos días (hoy incluido), del más cercano al más lejano.
function birthdays(ctx, { days = 30 } = {}) {
  if (!crmEnabled(ctx.db)) return [];
  const limit = Math.min(Math.max(Number(days) || 30, 0), 366);
  const rows = ctx.db.all("SELECT id, name, phone, birthday, tags, vip_mode FROM customers WHERE active = 1 AND birthday IS NOT NULL AND birthday <> ''");
  return enrich(ctx, rows).filter((c) => c.birthday_in !== null && c.birthday_in <= limit).sort((a, b) => a.birthday_in - b.birthday_in || a.name.localeCompare(b.name, 'es'));
}

module.exports = { SEGMENT_LABELS, metrics, classify, enrich, daysToBirthday, cleanBirthday, cleanTags, favorites, notes, addNote, birthdays };
