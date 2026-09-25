'use strict';
// Gastos, otros ingresos y control de caja.
const { AppError, now, today, round2, money, text, date, method } = require('../util');
const { audit, ledger, openCashSession, getSetting } = require('./common');

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
        audit(ctx, kind === 'gasto' ? 'registrar_gasto' : 'registrar_ingreso', kind, id, fields);
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
  anulacion_compra: 'Reembolsos de compras',
  anulacion_gasto: 'Gastos anulados',
  gasto: 'Gastos',
  compra: 'Compras de mercancía',
  pago_proveedor: 'Pagos a proveedores',
  devolucion: 'Devoluciones a clientes',
  retiro_caja: 'Retiros',
  anulacion_venta: 'Ventas anuladas',
  anulacion_ingreso: 'Ingresos anulados',
};

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
  const otherOut = round2(totalOut - expensesOut - withdrawals);
  const expected = round2(session.opening_amount + totalIn - totalOut);
  return {
    ...session,
    cash_sales: by('venta'),
    customer_payments: by('abono_cliente'),
    other_income: otherIn,
    expenses_paid: expensesOut,
    withdrawals,
    other_out: otherOut,
    total_in: totalIn,
    total_out: totalOut,
    expected,
    breakdown: rows.map((r) => ({ ...r, amount: round2(r.amount), label: CASH_LABELS[r.category] || r.category })),
  };
}

function cashStatus(ctx) {
  const session = openCashSession(ctx.db);
  const last = ctx.db.get("SELECT * FROM cash_sessions WHERE status = 'cerrada' ORDER BY id DESC LIMIT 1");
  const out = { open: session ? sessionSummary(ctx.db, session) : null, last_closed: last || null, require_open: getSetting(ctx.db, 'require_open_cash') === '1' };
  if (out.open) {
    out.open.movements = ctx.db.all(
      `SELECT m.*, u.name AS user_name FROM money_movements m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.session_id = ? AND m.method = 'efectivo' ORDER BY m.id DESC`,
      [session.id]
    ).map((m) => ({ ...m, label: CASH_LABELS[m.category] || m.category }));
  }
  return out;
}

function cashOpen(ctx, { amount, note }) {
  const opening = money(amount, 'Efectivo inicial');
  return ctx.db.tx(() => {
    if (openCashSession(ctx.db)) throw new AppError('Ya hay una caja abierta.');
    const id = ctx.db.insert('cash_sessions', { opened_at: now(), opened_by: ctx.user.id, opening_amount: opening, note: text(note, 'Nota'), status: 'abierta' });
    audit(ctx, 'apertura_caja', 'caja', id, { efectivo_inicial: opening });
    return id;
  });
}

function cashMovement(ctx, { type, amount, description }) {
  const amt = money(amount, 'Monto', { allowZero: false });
  const desc = text(description, 'Descripción', { required: true });
  return ctx.db.tx(() => {
    const s = openCashSession(ctx.db);
    if (!s) throw new AppError('No hay caja abierta.');
    if (type === 'retiro') {
      const { expected } = sessionSummary(ctx.db, s);
      if (amt > expected + 0.004) throw new AppError(`No hay suficiente efectivo en caja (esperado: ${expected.toFixed(2)}).`);
    }
    const id = ledger(ctx, { direction: type === 'retiro' ? 'out' : 'in', amount: amt, method: 'efectivo', category: type === 'retiro' ? 'retiro_caja' : 'deposito_caja', refType: 'caja', refId: s.id, description: desc });
    audit(ctx, type === 'retiro' ? 'retiro_caja' : 'entrada_caja', 'caja', s.id, { monto: amt, descripcion: desc });
    return id;
  });
}

function cashClose(ctx, { counted, note }) {
  const real = money(counted, 'Efectivo contado');
  return ctx.db.tx(() => {
    const s = openCashSession(ctx.db);
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
    `SELECT cs.*, uo.name AS opened_by_name, uc.name AS closed_by_name FROM cash_sessions cs
       LEFT JOIN users uo ON uo.id = cs.opened_by LEFT JOIN users uc ON uc.id = cs.closed_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cs.id DESC LIMIT 500`,
    params
  );
}

function cashSession(ctx, { id }) {
  const s = ctx.db.get('SELECT * FROM cash_sessions WHERE id = ?', [id]);
  if (!s) throw new AppError('Sesión de caja no encontrada.');
  const out = sessionSummary(ctx.db, s);
  out.movements = ctx.db.all(
    `SELECT m.*, u.name AS user_name FROM money_movements m LEFT JOIN users u ON u.id = m.user_id WHERE m.session_id = ? AND m.method = 'efectivo' ORDER BY m.id`,
    [id]
  ).map((m) => ({ ...m, label: CASH_LABELS[m.category] || m.category }));
  return out;
}

module.exports = { expenses, incomes, cashStatus, cashOpen, cashMovement, cashClose, cashHistory, cashSession, CASH_LABELS };
