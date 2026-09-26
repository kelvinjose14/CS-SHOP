'use strict';
const { AppError, now, today, addDays, round2, money, int, text, date, method, accountStatus } = require('../util');
const { audit, ledger, changeStock, getSetting, isAdmin, fmtMoney } = require('./common');

// ---------- Clientes ----------

const CUSTOMER_TOTALS = `
  COALESCE((SELECT SUM(total - returned_total) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND payment_type = 'credito'), 0) AS credit_sold,
  COALESCE((SELECT SUM(paid) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND payment_type = 'credito'), 0) AS credit_paid,
  COALESCE((SELECT SUM(balance) FROM sales WHERE customer_id = c.id AND status <> 'anulada'), 0) AS balance,
  COALESCE((SELECT SUM(balance) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND balance > 0 AND due_date < ?), 0) AS overdue_balance,
  COALESCE((SELECT SUM(total - returned_total) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND opening = 0), 0) AS total_bought,
  (SELECT MIN(due_date) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND balance > 0) AS next_due,
  (SELECT MAX(date) FROM sales WHERE customer_id = c.id AND status <> 'anulada' AND opening = 0) AS last_purchase`;

function customerList(ctx, { search = '', includeInactive = false, withBalance = false } = {}) {
  const where = [];
  const params = [];
  // Los que deben se ven siempre en cuentas por cobrar, aunque estén desactivados (datos de antes de la 1.3).
  if (!includeInactive && !withBalance) where.push('c.active = 1');
  if (search) { where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.document LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const t = today();
  const rows = ctx.db.all(`SELECT c.*, ${CUSTOMER_TOTALS} FROM customers c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.name`, [t, ...params]);
  return rows
    .map((c) => ({ ...c, account_status: accountStatus(c.credit_sold, c.credit_paid), overdue: c.balance > 0 && c.next_due && c.next_due < t ? 1 : 0 }))
    .filter((c) => !withBalance || c.balance > 0);
}

function customerGet(ctx, { id }) {
  const c = customerList(ctx, { includeInactive: true }).find((x) => x.id === id);
  if (!c) throw new AppError('Cliente no encontrado.');
  c.sales = ctx.db.all('SELECT * FROM sales WHERE customer_id = ? ORDER BY date DESC, id DESC', [id]);
  if (!isAdmin(ctx)) c.sales = c.sales.map(({ cost_total, ...s }) => s); // el vendedor no ve costos (RF-USR-04)
  c.payments = ctx.db.all(
    `SELECT sp.*, u.name AS user_name, s.payment_type AS sale_payment_type, s.status AS sale_status
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id LEFT JOIN users u ON u.id = sp.user_id
      WHERE sp.customer_id = ? ORDER BY sp.date DESC, sp.id DESC`,
    [id]
  );
  return c;
}

// El vendedor registra y edita clientes, pero solo el administrador los desactiva o reactiva y les pone
// límite de crédito. Un cliente que debe no se desactiva: dejaría de verse en la lista (auditoría 2.3).
function customerSave(ctx, data) {
  const fields = {
    name: text(data.name, 'Nombre', { required: true, max: 120 }),
    phone: text(data.phone, 'Teléfono', { max: 40 }),
    address: text(data.address, 'Dirección', { max: 250 }),
    email: text(data.email, 'Correo', { max: 120 }),
    document: text(data.document, 'Cédula/RNC', { max: 40 }),
    notes: text(data.notes, 'Notas', { max: 1000 }),
  };
  const admin = isAdmin(ctx);
  if (data.credit_limit !== undefined && admin) fields.credit_limit = money(data.credit_limit === '' || data.credit_limit === null ? 0 : data.credit_limit, 'Límite de crédito');
  return ctx.db.tx(() => {
    if (data.id) {
      const old = ctx.db.get('SELECT * FROM customers WHERE id = ?', [data.id]);
      if (!old) throw new AppError('Cliente no encontrado.');
      const active = data.active === undefined ? old.active : data.active ? 1 : 0;
      if (active !== old.active) {
        if (!admin) throw new AppError('Solo el administrador puede desactivar o reactivar clientes.', 'FORBIDDEN');
        const balance = round2(ctx.db.value("SELECT COALESCE(SUM(balance), 0) FROM sales WHERE customer_id = ? AND status <> 'anulada'", [data.id]));
        if (!active && balance > 0) throw new AppError(`${old.name} debe ${fmtMoney(ctx.db, balance)}: no se puede desactivar hasta que salde su cuenta.`);
        fields.active = active;
      }
      ctx.db.update('customers', data.id, fields);
      const changes = { nombre: fields.name };
      if (fields.active !== undefined) changes.activo = fields.active ? 'sí' : 'no';
      if (fields.credit_limit !== undefined && Math.abs(fields.credit_limit - old.credit_limit) > 0.004) changes.limite_credito = { antes: old.credit_limit, despues: fields.credit_limit };
      audit(ctx, 'editar_cliente', 'cliente', data.id, changes);
      return data.id;
    }
    const id = ctx.db.insert('customers', { ...fields, created_at: now() });
    audit(ctx, 'crear_cliente', 'cliente', id, { nombre: fields.name });
    return id;
  });
}

// Saldo que el cliente ya debía al empezar a usar el sistema. Se guarda como una venta a crédito
// sin artículos (se cobra con abonos, como cualquier otra), pero no cuenta como venta del período.
function customerOpening(ctx, { customer_id, amount, date: d, due_date, note }) {
  const customer = ctx.db.get('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!customer) throw new AppError('Cliente no encontrado.');
  if (!customer.active) throw new AppError(`${customer.name} está desactivado.`);
  const total = money(amount, 'Saldo inicial', { allowZero: false });
  const odate = date(d || today(), 'Fecha de la deuda', { notFuture: true });
  const due = date(due_date || addDays(odate, Number(getSetting(ctx.db, 'credit_days')) || 30), 'Fecha de vencimiento', { min: odate });
  return ctx.db.tx(() => {
    const id = ctx.db.insert('sales', {
      customer_id: customer.id, date: odate, sale_type: 'detalle', payment_type: 'credito', subtotal: total, discount: 0, total, cost_total: 0,
      paid: 0, change_given: 0, balance: total, due_date: due, status: 'pendiente', note: text(note, 'Nota', { max: 500 }) || 'Saldo inicial',
      user_id: ctx.user.id, created_at: now(), opening: 1,
    });
    audit(ctx, 'saldo_inicial_cliente', 'cliente', customer.id, { cliente: customer.name, monto: total, venta: id });
    return id;
  });
}

// ---------- Ventas ----------

function create(ctx, data) {
  const saleType = data.sale_type === 'mayor' ? 'mayor' : 'detalle';
  const paymentType = data.payment_type === 'credito' ? 'credito' : 'contado';
  const customer = data.customer_id ? ctx.db.get('SELECT * FROM customers WHERE id = ?', [data.customer_id]) : null;
  if (data.customer_id && !customer) throw new AppError('Cliente no encontrado.');
  if (customer && !customer.active) throw new AppError(`${customer.name} está desactivado: no se le puede vender. El administrador puede reactivarlo en Clientes.`);
  if (paymentType === 'credito' && !customer) throw new AppError('Las ventas a crédito requieren un cliente.');
  if (!data.items || !data.items.length) throw new AppError('Agregue al menos un producto.');

  const admin = isAdmin(ctx);
  const lines = data.items.map((it, i) => {
    const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [it.product_id]);
    if (!p || !p.active) throw new AppError(`Producto no disponible (línea ${i + 1}).`);
    const listPrice = saleType === 'mayor' ? p.price_wholesale : p.price_retail;
    let unitPrice = it.unit_price === undefined || it.unit_price === null || it.unit_price === '' ? listPrice : money(it.unit_price, 'Precio');
    if (!admin && round2(unitPrice) !== round2(listPrice)) throw new AppError('Sólo el administrador puede cambiar el precio de un producto en la venta.');
    // Un producto sin precio (por ejemplo, sin precio por mayor) no se vende en 0 por error.
    // Para regalar algo, el administrador usa el descuento.
    if (!(unitPrice > 0)) {
      const which = saleType === 'mayor' ? 'por mayor' : 'al detalle';
      throw new AppError(`"${p.name}" no tiene precio ${which}. ${admin ? 'Escriba el precio en la venta o póngaselo en Inventario.' : 'Pídale al administrador que le ponga precio en Inventario.'}`, 'NO_PRICE');
    }
    const qty = int(it.qty, `Cantidad de "${p.name}"`, { min: 1 });
    const lineDiscount = money(it.line_discount || 0, 'Descuento de línea');
    const gross = round2(qty * unitPrice);
    if (lineDiscount > gross) throw new AppError(`El descuento de "${p.name}" es mayor que el importe.`);
    return { p, qty, unitPrice, lineDiscount, gross, amount: round2(gross - lineDiscount) };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const discount = money(data.discount || 0, 'Descuento');
  if (discount > subtotal) throw new AppError('El descuento no puede ser mayor que el subtotal.');
  const lineDiscounts = round2(lines.reduce((s, l) => s + l.lineDiscount, 0));
  if (!admin && discount + lineDiscounts > 0) {
    if (getSetting(ctx.db, 'seller_can_discount') !== '1') throw new AppError('No tiene permiso para aplicar descuentos.');
    const maxPct = Number(getSetting(ctx.db, 'seller_max_discount_pct')) || 0;
    const grossTotal = subtotal + lineDiscounts;
    if (discount + lineDiscounts > round2((grossTotal * maxPct) / 100) + 0.004) throw new AppError(`El descuento máximo permitido es ${maxPct}%.`);
  }
  const total = round2(subtotal - discount);

  // Reparte el descuento general entre las líneas (para devoluciones exactas).
  let allocated = 0;
  lines.forEach((l, i) => {
    const share = i === lines.length - 1 ? round2(discount - allocated) : round2(subtotal > 0 ? (discount * l.amount) / subtotal : 0);
    allocated = round2(allocated + share);
    l.net = round2(l.amount - share);
  });

  const payments = (data.payments || []).filter((p) => Number(p.amount) > 0).map((p) => ({ method: method(p.method), amount: money(p.amount, 'Pago') }));
  const received = round2(payments.reduce((s, p) => s + p.amount, 0));
  const cashReceived = round2(payments.filter((p) => p.method === 'efectivo').reduce((s, p) => s + p.amount, 0));
  let change = 0;
  let paid;
  if (paymentType === 'contado') {
    if (received + 0.004 < total) throw new AppError(`El pago recibido (${fmtMoney(ctx.db, received)}) es menor que el total (${fmtMoney(ctx.db, total)}).`);
    change = round2(received - total);
    if (change > cashReceived + 0.004) throw new AppError('Sólo se puede dar cambio sobre pagos en efectivo.');
    paid = total;
  } else {
    if (received > total + 0.004) throw new AppError('El abono inicial no puede ser mayor que el total.');
    paid = received;
  }
  const saleDate = today();
  const dueDate = paymentType === 'credito' ? date(data.due_date || addDays(saleDate, Number(getSetting(ctx.db, 'credit_days')) || 30), 'Fecha de vencimiento', { min: saleDate }) : null;
  const costTotal = round2(lines.reduce((s, l) => s + l.qty * l.p.cost, 0));

  return ctx.db.tx(() => {
    const credit = paymentType === 'credito' ? creditCheck(ctx, customer, round2(total - paid), data.authorize_credit) : null;
    const id = ctx.db.insert('sales', {
      customer_id: customer ? customer.id : null,
      date: saleDate,
      sale_type: saleType,
      payment_type: paymentType,
      subtotal,
      discount,
      total,
      cost_total: costTotal,
      paid,
      change_given: change,
      balance: round2(total - paid),
      due_date: dueDate,
      status: accountStatus(total, paid),
      note: text(data.note, 'Nota', { max: 500 }),
      user_id: ctx.user.id,
      created_at: now(),
    });
    for (const l of lines) {
      const desc = [l.p.name, l.p.color, l.p.size].filter(Boolean).join(' / ');
      ctx.db.insert('sale_items', {
        sale_id: id, product_id: l.p.id, description: desc, qty: l.qty, unit_price: l.unitPrice, line_discount: l.lineDiscount, net_total: l.net, unit_cost: l.p.cost,
      });
      changeStock(ctx, l.p.id, -l.qty, 'venta', { refType: 'venta', refId: id, unitCost: l.p.cost, note: `Venta #${id}` });
    }
    // Registra el dinero recibido (el cambio se descuenta del efectivo).
    let changeLeft = change;
    for (const p of payments) {
      let amount = p.amount;
      if (p.method === 'efectivo' && changeLeft > 0) {
        const c = Math.min(changeLeft, amount);
        amount = round2(amount - c);
        changeLeft = round2(changeLeft - c);
      }
      if (amount <= 0) continue;
      ctx.db.insert('sale_payments', {
        sale_id: id, customer_id: customer ? customer.id : null, date: saleDate, amount, method: p.method, kind: 'inicial', user_id: ctx.user.id, created_at: now(),
      });
      ledger(ctx, { direction: 'in', amount, method: p.method, category: 'venta', refType: 'venta', refId: id, description: `Venta #${id}${customer ? ' - ' + customer.name : ''}`, date: saleDate });
    }
    audit(ctx, 'registrar_venta', 'venta', id, { total, tipo: saleType, pago: paymentType, cliente: customer ? customer.name : null, descuento: discount + lineDiscounts, ...(credit ? { credito_autorizado: credit } : {}) });
    return id;
  });
}

// Control del crédito (auditoría 2.4). Una venta a crédito se detiene si el cliente tiene deuda vencida
// (según Configuración) o si con esta venta pasaría su límite de crédito (0 = sin límite). El vendedor no
// puede seguir; el administrador puede autorizarla (authorize_credit) y queda anotado en el historial.
function creditCheck(ctx, customer, amount, authorize) {
  const t = today();
  const owed = round2(ctx.db.value("SELECT COALESCE(SUM(balance), 0) FROM sales WHERE customer_id = ? AND status <> 'anulada'", [customer.id]));
  const overdue = round2(ctx.db.value("SELECT COALESCE(SUM(balance), 0) FROM sales WHERE customer_id = ? AND status <> 'anulada' AND balance > 0 AND due_date < ?", [customer.id, t]));
  const problems = [];
  if (overdue > 0 && getSetting(ctx.db, 'block_overdue_credit') === '1') problems.push(`tiene ${fmtMoney(ctx.db, overdue)} vencido`);
  if (customer.credit_limit > 0 && round2(owed + amount) > customer.credit_limit + 0.004) {
    problems.push(`con esta venta debería ${fmtMoney(ctx.db, round2(owed + amount))} y su límite de crédito es ${fmtMoney(ctx.db, customer.credit_limit)}`);
  }
  if (!problems.length) return null;
  const why = `${customer.name} ${problems.join(' y ')}.`;
  if (!isAdmin(ctx)) throw new AppError(`${why} Solo el administrador puede autorizar otra venta a crédito.`, 'CREDIT_BLOCKED');
  if (!authorize) throw new AppError(`${why} ¿Autoriza la venta a crédito de todas formas?`, 'CREDIT_CONFIRM');
  return why;
}

function list(ctx, { from, to, customer_id, sale_type, payment_type, status, user_id } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('s.date >= ?'); params.push(from); }
  if (to) { where.push('s.date <= ?'); params.push(to); }
  if (customer_id) { where.push('s.customer_id = ?'); params.push(customer_id); }
  if (sale_type) { where.push('s.sale_type = ?'); params.push(sale_type); }
  if (payment_type) { where.push('s.payment_type = ?'); params.push(payment_type); }
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (user_id) { where.push('s.user_id = ?'); params.push(user_id); }
  // Los saldos iniciales no son ventas del período; se ven en la cuenta del cliente.
  if (!customer_id) where.push('s.opening = 0');
  const rows = ctx.db.all(
    `SELECT s.*, c.name AS customer_name, u.name AS user_name,
            (SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id = s.id) AS units,
            (SELECT GROUP_CONCAT(DISTINCT method) FROM sale_payments WHERE sale_id = s.id AND voided = 0) AS methods
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.id DESC`,
    params
  );
  return isAdmin(ctx) ? rows : rows.map(({ cost_total, ...r }) => r);
}

function get(ctx, { id }) {
  const s = ctx.db.get(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.document AS customer_document, u.name AS user_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [id]
  );
  if (!s) throw new AppError('Venta no encontrada.');
  s.items = ctx.db.all('SELECT si.*, p.sku, p.barcode FROM sale_items si JOIN products p ON p.id = si.product_id WHERE sale_id = ? ORDER BY si.id', [id]);
  s.payments = ctx.db.all('SELECT sp.*, u.name AS user_name FROM sale_payments sp LEFT JOIN users u ON u.id = sp.user_id WHERE sale_id = ? ORDER BY sp.id', [id]);
  s.returns = ctx.db.all('SELECT r.*, u.name AS user_name FROM returns r LEFT JOIN users u ON u.id = r.user_id WHERE sale_id = ? ORDER BY r.id', [id]);
  if (!isAdmin(ctx)) {
    delete s.cost_total;
    s.items.forEach((i) => delete i.unit_cost);
    s.returns.forEach((r) => delete r.cost_total);
  }
  return s;
}

function applyCustomerPayment(ctx, sale, amount, payMethod, pdate, note) {
  const paid = round2(sale.paid + amount);
  const due = round2(sale.total - sale.returned_total);
  ctx.db.update('sales', sale.id, { paid, balance: round2(due - paid), status: accountStatus(due, paid) });
  const id = ctx.db.insert('sale_payments', {
    sale_id: sale.id, customer_id: sale.customer_id, date: pdate, amount, method: payMethod, kind: 'abono', note, user_id: ctx.user.id, created_at: now(),
  });
  const c = sale.customer_id ? ctx.db.get('SELECT name FROM customers WHERE id = ?', [sale.customer_id]) : null;
  ledger(ctx, { direction: 'in', amount, method: payMethod, category: 'abono_cliente', refType: 'abono', refId: id, description: `Abono ${c ? 'de ' + c.name + ' ' : ''}(venta #${sale.id})`, date: pdate });
  return id;
}

// Abono a una venta a crédito, o al cliente (se aplica a las facturas más antiguas).
function pay(ctx, { sale_id, customer_id, amount, method: m, note }) {
  if (!isAdmin(ctx) && getSetting(ctx.db, 'seller_can_receive_payments') !== '1') throw new AppError('No tiene permiso para registrar pagos de clientes.', 'FORBIDDEN');
  amount = money(amount, 'Monto', { allowZero: false });
  const payMethod = method(m);
  const n = text(note, 'Nota');
  const pdate = today();
  return ctx.db.tx(() => {
    const targets = sale_id
      ? [ctx.db.get("SELECT * FROM sales WHERE id = ? AND status <> 'anulada'", [sale_id])].filter(Boolean)
      : ctx.db.all("SELECT * FROM sales WHERE customer_id = ? AND balance > 0 AND status <> 'anulada' ORDER BY COALESCE(due_date, date), id", [customer_id]);
    const owed = round2(targets.reduce((s, x) => s + x.balance, 0));
    if (!targets.length || owed <= 0) throw new AppError('No hay balance pendiente para cobrar.');
    if (amount > owed + 0.004) throw new AppError(`El abono excede el balance pendiente (${fmtMoney(ctx.db, owed)}).`);
    let remaining = amount;
    const ids = [];
    for (const s of targets) {
      if (remaining <= 0) break;
      const part = round2(Math.min(remaining, s.balance));
      if (part <= 0) continue;
      ids.push(applyCustomerPayment(ctx, s, part, payMethod, pdate, n));
      remaining = round2(remaining - part);
    }
    audit(ctx, 'abono_cliente', 'cliente', targets[0].customer_id, { monto: amount, metodo: payMethod, ventas: targets.map((t) => t.id) });
    return ids;
  });
}

// Anula un cobro registrado por error en una venta a crédito (O6, auditoría 3.4): la deuda vuelve a
// quedar como estaba y el dinero sale con un movimiento contrario, en la caja de quien anula.
// El cobro de una venta de contado no se anula aparte: se anula la venta.
function voidPayment(ctx, { payment_id, reason }) {
  const why = text(reason, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const pay = ctx.db.get('SELECT * FROM sale_payments WHERE id = ?', [payment_id]);
    if (!pay) throw new AppError('Pago no encontrado.');
    if (pay.voided) throw new AppError('Ese pago ya está anulado.');
    const sale = ctx.db.get('SELECT * FROM sales WHERE id = ?', [pay.sale_id]);
    if (sale.status === 'anulada') throw new AppError('La venta está anulada.');
    if (sale.payment_type !== 'credito') throw new AppError('Es el cobro de una venta de contado: para corregirlo, anule la venta.');
    const paid = round2(sale.paid - pay.amount);
    if (paid < -0.004) throw new AppError('Ese dinero ya se le devolvió al cliente en una devolución: no se puede anular el pago.');
    const due = round2(sale.total - sale.returned_total);
    ctx.db.update('sale_payments', pay.id, { voided: 1 });
    ctx.db.update('sales', sale.id, { paid, balance: round2(due - paid), status: accountStatus(due, paid) });
    const c = sale.customer_id ? ctx.db.get('SELECT name FROM customers WHERE id = ?', [sale.customer_id]) : null;
    ledger(ctx, { direction: 'out', amount: pay.amount, method: pay.method, category: 'anulacion_abono', refType: 'abono', refId: pay.id, description: `Anulación de abono${c ? ' de ' + c.name : ''} (venta #${sale.id}): ${why}` });
    audit(ctx, 'anular_abono', 'cliente', sale.customer_id, { venta: sale.id, monto: pay.amount, metodo: pay.method, motivo: why });
    return true;
  });
}

// Devolución parcial o total de una venta.
function createReturn(ctx, { sale_id, items, restock = true, refund_method, reason }) {
  const why = text(reason, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const sale = ctx.db.get('SELECT * FROM sales WHERE id = ?', [sale_id]);
    if (!sale) throw new AppError('Venta no encontrada.');
    if (sale.status === 'anulada') throw new AppError('No se puede devolver una venta anulada.');
    const lines = [];
    for (const it of items || []) {
      const qty = Number(it.qty) || 0;
      if (qty <= 0) continue;
      const si = ctx.db.get('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [it.sale_item_id, sale_id]);
      if (!si) throw new AppError('Artículo de la venta no encontrado.');
      int(qty, 'Cantidad a devolver', { min: 1 });
      if (qty > si.qty - si.returned_qty) throw new AppError(`Sólo puede devolver ${si.qty - si.returned_qty} de "${si.description}".`);
      const unitNet = si.net_total / si.qty;
      const subtotal = qty === si.qty - si.returned_qty
        ? round2(si.net_total - round2(unitNet * si.returned_qty)) // última unidad absorbe el redondeo
        : round2(unitNet * qty);
      lines.push({ si, qty, unitNet: round2(unitNet), subtotal });
    }
    if (!lines.length) throw new AppError('Indique la cantidad a devolver.');
    const total = round2(lines.reduce((s, l) => s + l.subtotal, 0));
    const costTotal = restock ? round2(lines.reduce((s, l) => s + l.qty * l.si.unit_cost, 0)) : 0;
    const creditApplied = round2(Math.min(total, sale.balance));
    const refund = round2(total - creditApplied);
    const refundMethod = refund > 0 ? method(refund_method) : null;
    const id = ctx.db.insert('returns', {
      sale_id, date: today(), total, cost_total: costTotal, credit_applied: creditApplied, refund_amount: refund, refund_method: refundMethod,
      restock: restock ? 1 : 0, reason: why, user_id: ctx.user.id, created_at: now(),
    });
    for (const l of lines) {
      ctx.db.insert('return_items', { return_id: id, sale_item_id: l.si.id, product_id: l.si.product_id, qty: l.qty, unit_price: l.unitNet, unit_cost: l.si.unit_cost, subtotal: l.subtotal });
      ctx.db.run('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?', [l.qty, l.si.id]);
      if (restock) changeStock(ctx, l.si.product_id, l.qty, 'devolucion', { refType: 'devolucion', refId: id, unitCost: l.si.unit_cost, note: `Devolución venta #${sale_id}` });
    }
    const returned = round2(sale.returned_total + total);
    const paid = round2(sale.paid - refund);
    const due = round2(sale.total - returned);
    ctx.db.update('sales', sale_id, { returned_total: returned, paid, balance: round2(due - paid), status: accountStatus(due, paid) });
    if (refund > 0) ledger(ctx, { direction: 'out', amount: refund, method: refundMethod, category: 'devolucion', refType: 'devolucion', refId: id, description: `Devolución venta #${sale_id}` });
    audit(ctx, 'devolucion', 'venta', sale_id, { devolucion: id, total, reembolso: refund, credito_aplicado: creditApplied, reingreso_inventario: !!restock, motivo: why });
    return id;
  });
}

function voidSale(ctx, { id, reason }) {
  const why = text(reason, 'Motivo de anulación', { required: true });
  return ctx.db.tx(() => {
    const sale = ctx.db.get('SELECT * FROM sales WHERE id = ?', [id]);
    if (!sale) throw new AppError('Venta no encontrada.');
    if (sale.status === 'anulada') throw new AppError('La venta ya está anulada.');
    if (ctx.db.value('SELECT COUNT(*) FROM returns WHERE sale_id = ?', [id]) > 0) throw new AppError('La venta tiene devoluciones; no se puede anular.');
    const items = ctx.db.all('SELECT * FROM sale_items WHERE sale_id = ?', [id]);
    for (const it of items) changeStock(ctx, it.product_id, it.qty, 'anulacion_venta', { refType: 'venta', refId: id, unitCost: it.unit_cost, note: `Anulación venta #${id}` });
    const pays = ctx.db.all('SELECT * FROM sale_payments WHERE sale_id = ? AND voided = 0', [id]);
    for (const p of pays) ledger(ctx, { direction: 'out', amount: p.amount, method: p.method, category: 'anulacion_venta', refType: 'venta', refId: id, description: `Anulación venta #${id}` });
    ctx.db.run('UPDATE sale_payments SET voided = 1 WHERE sale_id = ?', [id]);
    ctx.db.update('sales', id, { status: 'anulada', balance: 0, voided_at: now(), voided_by: ctx.user.id, void_reason: why });
    audit(ctx, 'anular_venta', 'venta', id, { total: sale.total, devuelto: round2(pays.reduce((s, p) => s + p.amount, 0)), motivo: why });
    return true;
  });
}

function receivables(ctx, { customer_id, only_open = true } = {}) {
  const where = ["s.status <> 'anulada'", 's.customer_id IS NOT NULL', "s.payment_type = 'credito'"];
  const params = [];
  if (only_open) where.push('s.balance > 0');
  if (customer_id) { where.push('s.customer_id = ?'); params.push(customer_id); }
  return ctx.db.all(
    `SELECT s.id, s.date, s.due_date, s.total - s.returned_total AS total, s.paid, s.balance, s.status, s.customer_id, s.opening,
            c.name AS customer_name, c.phone AS customer_phone,
            CASE WHEN s.balance > 0 AND s.due_date < ? THEN 1 ELSE 0 END AS overdue
       FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(s.due_date, s.date), s.id`,
    [today(), ...params]
  );
}

module.exports = { customerList, customerGet, customerSave, customerOpening, create, list, get, pay, voidPayment, createReturn, voidSale, receivables };
