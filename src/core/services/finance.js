'use strict';
// Gastos, otros ingresos y control de caja.
const { AppError, now, today, round2, money, text, date, method } = require('../util');
const { audit, ledger, openCashSession, getSetting, isAdmin, fmtMoney } = require('./common');

// ---------- Gastos / Otros ingresos ----------

function makeEntry(table, kind) {
  const label = kind === 'gasto' ? 'Gasto' : 'Ingreso';
  return {
    list(ctx, { from, to, category, includeVoided = false } = {}) {
      const where = [];
      const params = [];
      if (!includeVoided) where.push('e.voided = 0');
      if (from) { where.push('e.date >= ?'); params.push(from); }
      if (to) { where.push('e.date <= ?'); params.push(to); }
      if (category) { where.push('e.category = ?'); params.push(category); }
      return ctx.db.all(
        `SELECT e.*, u.name AS user_name FROM ${table} e LEFT JOIN users u ON u.id = e.user_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.date DESC, e.id DESC`,
        params
      );
    },
    create(ctx, data) {
      const fields = {
        category: text(data.category, 'Categoría', { required: true, max: 60 }),
        description: text(data.description, 'Descripción', { max: 300 }),
        date: date(data.date || today(), 'Fecha', { notFuture: true }),
        amount: money(data.amount, 'Monto', { allowZero: false }),
        method: method(data.method),
      };
      // Solo las categorías de la lista de Configuración (auditoría 2.8): así los reportes por categoría cuadran.
      const cats = JSON.parse(getSetting(ctx.db, kind === 'gasto' ? 'expense_categories' : 'income_categories') || '[]');
      if (!cats.includes(fields.category)) throw new AppError(`La categoría "${fields.category}" no está en la lista. Agréguela en Configuración → Categorías.`);
      return ctx.db.tx(() => {
        const id = ctx.db.insert(table, { ...fields, user_id: ctx.user.id, created_at: now() });
        ledger(ctx, {
          direction: kind === 'gasto' ? 'out' : 'in',
          amount: fields.amount,
          method: fields.method,
          category: kind === 'gasto' ? 'gasto' : 'otro_ingreso',
          refType: kind,
          refId: id,
          description: `${fields.category}${fields.description ? ' - ' + fields.description : ''}`,
          date: fields.date,
        });
        audit(ctx, kind === 'gasto' ? 'registrar_gasto' : 'registrar_ingreso', kind, id, {
          categoria: fields.category, descripcion: fields.description, fecha: fields.date, monto: fields.amount, metodo: fields.method,
        });
        return id;
      });
    },
    void(ctx, { id, reason }) {
      const why = text(reason, 'Motivo', { required: true });
      return ctx.db.tx(() => {
        const e = ctx.db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        if (!e) throw new AppError(`${label} no encontrado.`);
        if (e.voided) throw new AppError(`El ${label.toLowerCase()} ya está anulado.`);
        ctx.db.update(table, id, { voided: 1 });
        ledger(ctx, {
          direction: kind === 'gasto' ? 'in' : 'out',
          amount: e.amount,
          method: e.method,
          category: kind === 'gasto' ? 'anulacion_gasto' : 'anulacion_ingreso',
          refType: kind,
          refId: id,
          description: `Anulación ${label.toLowerCase()} #${id}`,
        });
        audit(ctx, kind === 'gasto' ? 'anular_gasto' : 'anular_ingreso', kind, id, { monto: e.amount, motivo: why });
        return true;
      });
    },
  };
}

const expenses = makeEntry('expenses', 'gasto');
const incomes = makeEntry('incomes', 'ingreso');

// ---------- Caja ----------

const CASH_LABELS = {
  venta: 'Ventas en efectivo',
  abono_cliente: 'Abonos de clientes',
  otro_ingreso: 'Otros ingresos',
  deposito_caja: 'Entradas a caja',
  aporte_capital: 'Aportes del dueño',
  anulacion_compra: 'Reembolsos de compras',
  anulacion_gasto: 'Gastos anulados',
  anulacion_pago_proveedor: 'Pagos a proveedores anulados',
  gasto: 'Gastos',
  compra: 'Compras de mercancía',
  pago_proveedor: 'Pagos a proveedores',
  devolucion: 'Devoluciones a clientes',
  retiro_caja: 'Retiros',
  deposito_banco: 'Depósitos al banco',
  anulacion_aporte: 'Aportes anulados',
  anulacion_venta: 'Ventas anuladas',
  anulacion_ingreso: 'Ingresos anulados',
  anulacion_abono: 'Abonos anulados',
  anulacion_entrada: 'Entradas anuladas',
  anulacion_retiro: 'Retiros anulados',
  anulacion_deposito: 'Depósitos anulados',
  deposito_no_recibido: 'Depósitos que no llegaron al banco',
};

// Movimientos que solo cambian el dinero de lugar (efectivo → banco, y su anulación): no son entradas
// ni salidas del negocio.
const TRANSFERS = ['deposito_banco', 'anulacion_deposito'];

// Movimientos manuales de caja que el administrador puede anular, y la categoría de la anulación.
const CASH_VOIDS = { deposito_caja: 'anulacion_entrada', retiro_caja: 'anulacion_retiro', deposito_banco: 'anulacion_deposito' };

// Resumen de una caja. Cada línea ya descuenta sus anulaciones (un retiro anulado no cuenta como retiro),
// y la suma de las líneas siempre da el efectivo esperado.
function sessionSummary(db, session) {
  const rows = db.all(
    "SELECT direction, category, SUM(amount) AS amount FROM money_movements WHERE session_id = ? AND method = 'efectivo' GROUP BY direction, category",
    [session.id]
  );
  const sum = (dir, cat) => round2(rows.filter((r) => r.direction === dir && r.category === cat).reduce((s, r) => s + r.amount, 0));
  const totalIn = round2(rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0));
  const totalOut = round2(rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0));
  const cashSales = sum('in', 'venta');
  const payments = sum('in', 'abono_cliente');
  const withdrawals = round2(sum('out', 'retiro_caja') - sum('in', 'anulacion_retiro'));
  const deposits = round2(sum('out', 'deposito_banco') - sum('in', 'anulacion_deposito'));
  const entryVoids = sum('out', 'anulacion_entrada');
  const otherIn = round2(totalIn - cashSales - payments - sum('in', 'anulacion_retiro') - sum('in', 'anulacion_deposito') - entryVoids);
  const expensesOut = round2(sum('out', 'gasto') + sum('out', 'compra') + sum('out', 'pago_proveedor'));
  const otherOut = round2(totalOut - expensesOut - sum('out', 'retiro_caja') - sum('out', 'deposito_banco') - entryVoids);
  const expected = round2(session.opening_amount + totalIn - totalOut);
  return {
    ...session,
    cash_sales: cashSales,
    customer_payments: payments,
    other_income: otherIn,
    expenses_paid: expensesOut,
    withdrawals,
    bank_deposits: deposits,
    other_out: otherOut,
    total_in: totalIn,
    total_out: totalOut,
    expected,
    breakdown: rows.map((r) => ({ ...r, amount: round2(r.amount), label: CASH_LABELS[r.category] || r.category })),
  };
}

function cashMovements(db, sessionId, order = 'DESC') {
  return db.all(
    `SELECT m.*, u.name AS user_name,
            EXISTS (SELECT 1 FROM money_movements a WHERE a.ref_type = 'anulacion' AND a.ref_id = m.id) AS voided
       FROM money_movements m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.session_id = ? AND m.method = 'efectivo' ORDER BY m.id ${order}`,
    [sessionId]
  ).map((m) => ({ ...m, label: CASH_LABELS[m.category] || m.category, voidable: m.category in CASH_VOIDS && !m.voided ? 1 : 0 }));
}

// Caja de la PC que consulta. El administrador ve además las cajas abiertas en otras PCs.
function cashStatus(ctx) {
  const terminal = ctx.terminal ?? 1;
  const session = openCashSession(ctx.db, terminal);
  const last = ctx.db.get("SELECT * FROM cash_sessions WHERE status = 'cerrada' AND terminal_id = ? ORDER BY id DESC LIMIT 1", [terminal]);
  const out = {
    terminal: ctx.db.get('SELECT id, name FROM terminals WHERE id = ?', [terminal]) || null,
    open: session ? sessionSummary(ctx.db, session) : null,
    last_closed: last || null,
    require_open: getSetting(ctx.db, 'require_open_cash') === '1',
  };
  if (out.open) out.open.movements = cashMovements(ctx.db, session.id);
  if (isAdmin(ctx)) {
    out.others = ctx.db.all(
      `SELECT cs.*, t.name AS terminal_name, u.name AS opened_by_name FROM cash_sessions cs
         JOIN terminals t ON t.id = cs.terminal_id LEFT JOIN users u ON u.id = cs.opened_by
        WHERE cs.status = 'abierta' AND cs.terminal_id <> ? ORDER BY t.name`,
      [terminal]
    ).map((s) => sessionSummary(ctx.db, s));
  }
  return out;
}

// La caja se abre con lo que se contó en el último cierre de esa PC. Si el efectivo inicial es otro,
// el dinero cambió mientras la caja estaba cerrada: se pide el motivo y queda la diferencia en la caja
// y en el historial (auditoría 2.1).
function cashOpen(ctx, { amount, note, reason }) {
  const opening = money(amount, 'Efectivo inicial');
  const terminal = ctx.terminal ?? 1;
  return ctx.db.tx(() => {
    if (openCashSession(ctx.db, terminal)) throw new AppError('Ya hay una caja abierta en esta computadora.');
    const last = ctx.db.get("SELECT counted_amount FROM cash_sessions WHERE status = 'cerrada' AND terminal_id = ? ORDER BY id DESC LIMIT 1", [terminal]);
    const difference = last ? round2(opening - last.counted_amount) : null;
    const why = text(reason, 'Motivo');
    if (difference && !why) {
      throw new AppError(`El efectivo inicial (${fmtMoney(ctx.db, opening)}) no es lo que se contó al cerrar la última caja de esta computadora (${fmtMoney(ctx.db, last.counted_amount)}). Escriba el motivo de la diferencia.`, 'OPENING_REASON');
    }
    const id = ctx.db.insert('cash_sessions', {
      opened_at: now(), opened_by: ctx.user.id, opening_amount: opening, note: text(note, 'Nota'), status: 'abierta', terminal_id: terminal,
      opening_difference: difference, opening_reason: difference ? why : null,
    });
    audit(ctx, 'apertura_caja', 'caja', id, difference ? { efectivo_inicial: opening, contado_al_cerrar: last.counted_amount, diferencia: difference, motivo: why } : { efectivo_inicial: opening });
    return id;
  });
}

// ---------- Depósitos al banco por verificar (auditoría 4.2) ----------
// El depósito lo puede registrar el vendedor y la caja cuadra aunque el dinero no llegue al banco. El
// administrador revisa cada uno contra el estado de cuenta: "verificado" o "no llegó al banco". Si no
// llegó, se quita del banco con un movimiento contrario: es dinero que salió del negocio.

const DEPOSIT_STATUS = ['pendiente', 'verificado', 'no_recibido', 'anulado'];

function deposits(ctx, { from, to, status } = {}) {
  if (status && !DEPOSIT_STATUS.includes(status)) throw new AppError('Estado inválido.');
  const where = ["m.method = 'efectivo'", "m.category = 'deposito_banco'", "m.direction = 'out'"];
  const params = [];
  if (from) { where.push('m.date >= ?'); params.push(from); }
  if (to) { where.push('m.date <= ?'); params.push(to); }
  const rows = ctx.db.all(
    `SELECT m.id, m.date, m.created_at, m.amount, m.description, m.session_id, u.name AS user_name, t.name AS terminal_name,
            dc.status AS check_status, dc.note AS check_note, dc.created_at AS checked_at, cu.name AS checked_by_name,
            EXISTS (SELECT 1 FROM money_movements a WHERE a.ref_type = 'anulacion' AND a.ref_id = m.id) AS voided
       FROM money_movements m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN cash_sessions cs ON cs.id = m.session_id LEFT JOIN terminals t ON t.id = cs.terminal_id
       LEFT JOIN deposit_checks dc ON dc.movement_id = m.id LEFT JOIN users cu ON cu.id = dc.user_id
      WHERE ${where.join(' AND ')} ORDER BY m.id DESC`,
    params
  ).map((r) => ({ ...r, status: r.voided ? 'anulado' : r.check_status || 'pendiente' }));
  return status ? rows.filter((r) => r.status === status) : rows;
}

function pendingDeposits(db) {
  const r = db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(m.amount), 0) AS amount, MIN(m.date) AS oldest FROM money_movements m
      WHERE m.method = 'efectivo' AND m.category = 'deposito_banco' AND m.direction = 'out'
        AND NOT EXISTS (SELECT 1 FROM deposit_checks dc WHERE dc.movement_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM money_movements a WHERE a.ref_type = 'anulacion' AND a.ref_id = m.id)`
  );
  return { ...r, amount: round2(r.amount) };
}

function findDeposit(ctx, id) {
  const d = deposits(ctx).find((x) => x.id === Number(id));
  if (!d) throw new AppError('Depósito no encontrado.');
  return d;
}

function checkDeposit(ctx, { movement_id, status, note }) {
  if (!['verificado', 'no_recibido'].includes(status)) throw new AppError('Indique si el depósito está en el banco o no llegó.');
  const why = status === 'no_recibido' ? text(note, 'Motivo', { required: true }) : text(note, 'Nota');
  return ctx.db.tx(() => {
    const d = findDeposit(ctx, movement_id);
    if (d.status === 'anulado') throw new AppError('Ese depósito fue anulado.');
    if (d.status !== 'pendiente') throw new AppError('Ese depósito ya se revisó.');
    ctx.db.insert('deposit_checks', { movement_id: d.id, status, note: why, user_id: ctx.user.id, created_at: now() });
    const details = { monto: d.amount, fecha: d.date, descripcion: d.description, registrado_por: d.user_name, nota: why };
    if (status === 'no_recibido') {
      ledger(ctx, { direction: 'out', amount: d.amount, method: 'transferencia', category: 'deposito_no_recibido', refType: 'deposito', refId: d.id, description: `Depósito del ${d.date} que no llegó al banco: ${why}` });
      audit(ctx, 'deposito_no_recibido', 'caja', d.session_id, details);
    } else {
      audit(ctx, 'verificar_deposito', 'caja', d.session_id, details);
    }
    return true;
  });
}

// Deshace un "verificado" marcado por error. "No llegó al banco" no se deshace: ya movió el dinero.
function uncheckDeposit(ctx, { movement_id }) {
  return ctx.db.tx(() => {
    const d = findDeposit(ctx, movement_id);
    if (d.status !== 'verificado') throw new AppError('Solo se puede desmarcar un depósito verificado.');
    ctx.db.run('DELETE FROM deposit_checks WHERE movement_id = ?', [d.id]);
    audit(ctx, 'desmarcar_deposito', 'caja', d.session_id, { monto: d.amount, fecha: d.date, descripcion: d.description });
    return true;
  });
}

// Movimientos manuales de efectivo:
// - entrada: sencillo o cambio que se pone en la gaveta;
// - deposito_banco: el efectivo pasa al banco. Sigue siendo dinero del negocio: no es gasto ni
//   salida del flujo, solo cambia de lugar (DT-22). Lo puede registrar el vendedor;
// - retiro: dinero que sale del negocio (por ejemplo, para el dueño). Solo el administrador (DT-22).
const CASH_MOVES = {
  entrada: { direction: 'in', category: 'deposito_caja', action: 'entrada_caja' },
  deposito_banco: { direction: 'out', category: 'deposito_banco', action: 'deposito_banco' },
  retiro: { direction: 'out', category: 'retiro_caja', action: 'retiro_caja', admin: true },
};

function cashMovement(ctx, { type, amount, description }) {
  const move = CASH_MOVES[type];
  if (!move) throw new AppError('Tipo de movimiento inválido.');
  if (move.admin && !isAdmin(ctx)) throw new AppError('Solo el administrador puede hacer retiros de caja. Para llevar el efectivo al banco, use "Depósito al banco".', 'FORBIDDEN');
  const amt = money(amount, 'Monto', { allowZero: false });
  const desc = text(description, 'Descripción', { required: true });
  return ctx.db.tx(() => {
    const s = openCashSession(ctx.db, ctx.terminal);
    if (!s) throw new AppError('No hay caja abierta.');
    if (move.direction === 'out') {
      const { expected } = sessionSummary(ctx.db, s);
      if (amt > expected + 0.004) throw new AppError(`No hay suficiente efectivo en caja (esperado: ${fmtMoney(ctx.db, expected)}).`);
    }
    const id = ledger(ctx, { direction: move.direction, amount: amt, method: 'efectivo', category: move.category, refType: 'caja', refId: s.id, description: desc });
    // El depósito entra al banco: el dinero del negocio no cambia, solo pasa de efectivo a banco.
    if (type === 'deposito_banco') ledger(ctx, { direction: 'in', amount: amt, method: 'transferencia', category: 'deposito_banco', refType: 'caja', refId: s.id, description: desc });
    audit(ctx, move.action, 'caja', s.id, { monto: amt, descripcion: desc });
    return id;
  });
}

// Anula una entrada, un depósito al banco o un retiro registrado por error (auditoría 3.4). Solo el
// administrador y solo mientras esa caja siga abierta: una vez cerrada, el error ya quedó en la
// diferencia del cierre. La anulación es un movimiento contrario en la misma caja (también la del banco).
function cashVoid(ctx, { movement_id, reason }) {
  const why = text(reason, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const m = ctx.db.get('SELECT * FROM money_movements WHERE id = ?', [movement_id]);
    if (!m || m.method !== 'efectivo' || !(m.category in CASH_VOIDS)) throw new AppError('Solo se anulan entradas de efectivo, depósitos al banco y retiros.');
    if (ctx.db.get("SELECT id FROM money_movements WHERE ref_type = 'anulacion' AND ref_id = ?", [m.id])) throw new AppError('Ese movimiento ya está anulado.');
    const s = ctx.db.get('SELECT * FROM cash_sessions WHERE id = ?', [m.session_id]);
    if (!s || s.status !== 'abierta') throw new AppError('Esa caja ya se cerró: el error quedó en la diferencia de ese cierre.');
    if (ctx.db.get('SELECT 1 FROM deposit_checks WHERE movement_id = ?', [m.id])) throw new AppError('Ese depósito ya se revisó contra el banco: no se puede anular.');
    const category = CASH_VOIDS[m.category];
    const description = `Anulación: ${m.description || CASH_LABELS[m.category]} (${why})`;
    const id = ledger(ctx, { direction: m.direction === 'in' ? 'out' : 'in', amount: m.amount, method: 'efectivo', category, refType: 'anulacion', refId: m.id, description, session: s.id });
    // El depósito tuvo también su entrada al banco: se anula igual.
    if (m.category === 'deposito_banco') ledger(ctx, { direction: 'out', amount: m.amount, method: 'transferencia', category, refType: 'anulacion', refId: m.id, description });
    audit(ctx, 'anular_movimiento_caja', 'caja', s.id, { movimiento: CASH_LABELS[m.category], monto: m.amount, descripcion: m.description, motivo: why });
    return id;
  });
}

// ---------- Aportes de capital del dueño ----------
// Dinero que el dueño pone en el negocio. Entra al flujo de dinero pero no es ganancia (DT-21).

const capital = {
  list(ctx, { from, to, includeVoided = false } = {}) {
    const where = [];
    const params = [];
    if (!includeVoided) where.push('c.voided = 0');
    if (from) { where.push('c.date >= ?'); params.push(from); }
    if (to) { where.push('c.date <= ?'); params.push(to); }
    return ctx.db.all(
      `SELECT c.*, u.name AS user_name FROM capital c LEFT JOIN users u ON u.id = c.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.date DESC, c.id DESC`,
      params
    );
  },
  create(ctx, data) {
    const fields = {
      description: text(data.description, 'Descripción', { max: 300 }),
      date: date(data.date || today(), 'Fecha', { notFuture: true }),
      amount: money(data.amount, 'Monto', { allowZero: false }),
      method: method(data.method),
    };
    return ctx.db.tx(() => {
      const id = ctx.db.insert('capital', { ...fields, user_id: ctx.user.id, created_at: now() });
      ledger(ctx, { direction: 'in', amount: fields.amount, method: fields.method, category: 'aporte_capital', refType: 'aporte', refId: id, description: fields.description || 'Aporte del dueño', date: fields.date });
      audit(ctx, 'aporte_capital', 'aporte', id, { monto: fields.amount, metodo: fields.method, fecha: fields.date, descripcion: fields.description });
      return id;
    });
  },
  void(ctx, { id, reason }) {
    const why = text(reason, 'Motivo', { required: true });
    return ctx.db.tx(() => {
      const c = ctx.db.get('SELECT * FROM capital WHERE id = ?', [id]);
      if (!c) throw new AppError('Aporte no encontrado.');
      if (c.voided) throw new AppError('El aporte ya está anulado.');
      ctx.db.update('capital', id, { voided: 1, void_reason: why });
      ledger(ctx, { direction: 'out', amount: c.amount, method: c.method, category: 'anulacion_aporte', refType: 'aporte', refId: id, description: `Anulación aporte #${id}` });
      audit(ctx, 'anular_aporte', 'aporte', id, { monto: c.amount, motivo: why });
      return true;
    });
  },
};

function cashClose(ctx, { counted, note }) {
  const real = money(counted, 'Efectivo contado');
  return ctx.db.tx(() => {
    const s = openCashSession(ctx.db, ctx.terminal);
    if (!s) throw new AppError('No hay caja abierta.');
    const sum = sessionSummary(ctx.db, s);
    const difference = round2(real - sum.expected);
    ctx.db.update('cash_sessions', s.id, {
      closed_at: now(), closed_by: ctx.user.id, expected_amount: sum.expected, counted_amount: real, difference, note: text(note, 'Nota') || s.note, status: 'cerrada',
    });
    audit(ctx, 'cierre_caja', 'caja', s.id, { esperado: sum.expected, contado: real, diferencia: difference });
    return { ...sum, counted_amount: real, difference };
  });
}

function cashHistory(ctx, { from, to } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('date(cs.opened_at) >= ?'); params.push(from); }
  if (to) { where.push('date(cs.opened_at) <= ?'); params.push(to); }
  return ctx.db.all(
    `SELECT cs.*, t.name AS terminal_name, uo.name AS opened_by_name, uc.name AS closed_by_name FROM cash_sessions cs
       LEFT JOIN terminals t ON t.id = cs.terminal_id
       LEFT JOIN users uo ON uo.id = cs.opened_by LEFT JOIN users uc ON uc.id = cs.closed_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cs.id DESC`,
    params
  );
}

function cashSession(ctx, { id }) {
  const s = ctx.db.get('SELECT cs.*, t.name AS terminal_name FROM cash_sessions cs LEFT JOIN terminals t ON t.id = cs.terminal_id WHERE cs.id = ?', [id]);
  if (!s) throw new AppError('Sesión de caja no encontrada.');
  const out = sessionSummary(ctx.db, s);
  out.movements = cashMovements(ctx.db, id, 'ASC');
  return out;
}

module.exports = {
  expenses, incomes, capital, cashStatus, cashOpen, cashMovement, cashVoid, cashClose, cashHistory, cashSession, sessionSummary,
  deposits, checkDeposit, uncheckDeposit, pendingDeposits, CASH_LABELS, TRANSFERS,
};
