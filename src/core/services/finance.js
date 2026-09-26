'use strict';
// Gastos, otros ingresos y control de caja.
const { AppError, now, today, round2, money, text, date, method } = require('../util');
const { audit, ledger, openCashSession, getSetting, isAdmin } = require('./common');

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
        date: date(data.date || today()),
        amount: money(data.amount, 'Monto', { allowZero: false }),
        method: method(data.method),
      };
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
  gasto: 'Gastos',
  compra: 'Compras de mercancía',
  pago_proveedor: 'Pagos a proveedores',
  devolucion: 'Devoluciones a clientes',
  retiro_caja: 'Retiros',
  deposito_banco: 'Depósitos al banco',
  anulacion_aporte: 'Aportes anulados',
  anulacion_venta: 'Ventas anuladas',
  anulacion_ingreso: 'Ingresos anulados',
};

// Movimientos que solo cambian el dinero de lugar (efectivo → banco): no son entradas ni salidas del negocio.
const TRANSFERS = ['deposito_banco'];

function sessionSummary(db, session) {
  const rows = db.all(
    "SELECT direction, category, SUM(amount) AS amount FROM money_movements WHERE session_id = ? AND method = 'efectivo' GROUP BY direction, category",
    [session.id]
  );
  const by = (cat) => round2(rows.filter((r) => r.category === cat).reduce((s, r) => s + r.amount, 0));
  const totalIn = round2(rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0));
  const totalOut = round2(rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0));
  const cashSales = round2(by('venta') + by('abono_cliente'));
  const otherIn = round2(totalIn - cashSales);
  const expensesOut = round2(by('gasto') + by('compra') + by('pago_proveedor'));
  const withdrawals = by('retiro_caja');
  const deposits = by('deposito_banco');
  const otherOut = round2(totalOut - expensesOut - withdrawals - deposits);
  const expected = round2(session.opening_amount + totalIn - totalOut);
  return {
    ...session,
    cash_sales: by('venta'),
    customer_payments: by('abono_cliente'),
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
    `SELECT m.*, u.name AS user_name FROM money_movements m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.session_id = ? AND m.method = 'efectivo' ORDER BY m.id ${order}`,
    [sessionId]
  ).map((m) => ({ ...m, label: CASH_LABELS[m.category] || m.category }));
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

function cashOpen(ctx, { amount, note }) {
  const opening = money(amount, 'Efectivo inicial');
  return ctx.db.tx(() => {
    if (openCashSession(ctx.db, ctx.terminal)) throw new AppError('Ya hay una caja abierta en esta computadora.');
    const id = ctx.db.insert('cash_sessions', { opened_at: now(), opened_by: ctx.user.id, opening_amount: opening, note: text(note, 'Nota'), status: 'abierta', terminal_id: ctx.terminal ?? 1 });
    audit(ctx, 'apertura_caja', 'caja', id, { efectivo_inicial: opening });
    return id;
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
      if (amt > expected + 0.004) throw new AppError(`No hay suficiente efectivo en caja (esperado: ${expected.toFixed(2)}).`);
    }
    const id = ledger(ctx, { direction: move.direction, amount: amt, method: 'efectivo', category: move.category, refType: 'caja', refId: s.id, description: desc });
    // El depósito entra al banco: el dinero del negocio no cambia, solo pasa de efectivo a banco.
    if (type === 'deposito_banco') ledger(ctx, { direction: 'in', amount: amt, method: 'transferencia', category: 'deposito_banco', refType: 'caja', refId: s.id, description: desc });
    audit(ctx, move.action, 'caja', s.id, { monto: amt, descripcion: desc });
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
      date: date(data.date || today()),
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
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cs.id DESC LIMIT 500`,
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

module.exports = { expenses, incomes, capital, cashStatus, cashOpen, cashMovement, cashClose, cashHistory, cashSession, sessionSummary, CASH_LABELS, TRANSFERS };
