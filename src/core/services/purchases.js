'use strict';
const { AppError, now, today, addDays, round2, money, int, text, date, method, accountStatus } = require('../util');
const { audit, ledger, changeStock, getSetting } = require('./common');

// ---------- Proveedores ----------

function supplierList(ctx, { search = '', includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('s.active = 1');
  if (search) { where.push('(s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  return ctx.db.all(
    `SELECT s.*,
            COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id = s.id AND status <> 'anulada' AND opening = 0), 0) AS total_purchased,
            COALESCE((SELECT SUM(paid) FROM purchases WHERE supplier_id = s.id AND status <> 'anulada'), 0) AS total_paid,
            COALESCE((SELECT SUM(balance) FROM purchases WHERE supplier_id = s.id AND status <> 'anulada'), 0) AS balance,
            (SELECT MAX(date) FROM purchases WHERE supplier_id = s.id AND status <> 'anulada' AND opening = 0) AS last_purchase
       FROM suppliers s ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.name`,
    params
  );
}

function supplierGet(ctx, { id }) {
  const s = supplierList(ctx, { includeInactive: true }).find((x) => x.id === id);
  if (!s) throw new AppError('Proveedor no encontrado.');
  s.purchases = ctx.db.all('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY date DESC, id DESC', [id]);
  s.payments = ctx.db.all(
    `SELECT pp.*, u.name AS user_name, p.payment_type AS purchase_payment_type, p.status AS purchase_status
       FROM purchase_payments pp JOIN purchases p ON p.id = pp.purchase_id LEFT JOIN users u ON u.id = pp.user_id
      WHERE pp.supplier_id = ? ORDER BY pp.date DESC, pp.id DESC`,
    [id]
  );
  return s;
}

function supplierSave(ctx, data) {
  const fields = {
    name: text(data.name, 'Nombre', { required: true, max: 120 }),
    phone: text(data.phone, 'Teléfono', { max: 40 }),
    address: text(data.address, 'Dirección', { max: 250 }),
    email: text(data.email, 'Correo', { max: 120 }),
    notes: text(data.notes, 'Notas', { max: 1000 }),
  };
  if (data.active !== undefined) fields.active = data.active ? 1 : 0;
  return ctx.db.tx(() => {
    if (data.id) {
      ctx.db.update('suppliers', data.id, fields);
      audit(ctx, 'editar_proveedor', 'proveedor', data.id, { nombre: fields.name });
      return data.id;
    }
    const id = ctx.db.insert('suppliers', { ...fields, created_at: now() });
    audit(ctx, 'crear_proveedor', 'proveedor', id, { nombre: fields.name });
    return id;
  });
}

// Lo que ya se le debía al proveedor al empezar a usar el sistema: una compra a crédito sin
// artículos que se paga como las demás, pero no cuenta como compra del período.
function supplierOpening(ctx, { supplier_id, amount, date: d, due_date, invoice_ref, note }) {
  const supplier = ctx.db.get('SELECT * FROM suppliers WHERE id = ?', [supplier_id]);
  if (!supplier) throw new AppError('Proveedor no encontrado.');
  const total = money(amount, 'Saldo inicial', { allowZero: false });
  const odate = date(d || today(), 'Fecha de la deuda', { notFuture: true });
  const due = date(due_date || addDays(odate, Number(getSetting(ctx.db, 'credit_days')) || 30), 'Fecha de vencimiento', { min: odate });
  return ctx.db.tx(() => {
    const id = ctx.db.insert('purchases', {
      supplier_id: supplier.id, date: odate, due_date: due, invoice_ref: text(invoice_ref, 'Factura', { max: 60 }), payment_type: 'credito', payment_method: null,
      total, paid: 0, balance: total, status: 'pendiente', note: text(note, 'Nota', { max: 500 }) || 'Saldo inicial', user_id: ctx.user.id, created_at: now(), opening: 1,
    });
    audit(ctx, 'saldo_inicial_proveedor', 'proveedor', supplier.id, { proveedor: supplier.name, monto: total, compra: id });
    return id;
  });
}

// ---------- Compras ----------

function create(ctx, data) {
  const supplier = ctx.db.get('SELECT * FROM suppliers WHERE id = ?', [data.supplier_id]);
  if (!supplier) throw new AppError('Seleccione un proveedor.');
  const pdate = date(data.date || today(), 'Fecha de la compra', { notFuture: true });
  const paymentType = data.payment_type === 'credito' ? 'credito' : 'contado';
  const items = (data.items || []).map((it, i) => ({
    product_id: it.product_id,
    qty: int(it.qty, `Cantidad (línea ${i + 1})`, { min: 1 }),
    unit_cost: money(it.unit_cost, `Costo unitario (línea ${i + 1})`),
    price_retail: it.price_retail === undefined || it.price_retail === '' || it.price_retail === null ? null : money(it.price_retail, 'Precio al detalle'),
    price_wholesale: it.price_wholesale === undefined || it.price_wholesale === '' || it.price_wholesale === null ? null : money(it.price_wholesale, 'Precio al por mayor'),
  }));
  if (!items.length) throw new AppError('Agregue al menos un producto a la compra.');
  const total = round2(items.reduce((s, it) => s + it.qty * it.unit_cost, 0));
  let paid;
  let payMethod = null;
  if (paymentType === 'contado') {
    paid = total;
    payMethod = method(data.payment_method);
  } else {
    paid = money(data.paid || 0, 'Monto pagado');
    if (paid > total) throw new AppError('El monto pagado no puede ser mayor que el total.');
    if (paid > 0) payMethod = method(data.payment_method);
  }
  const dueDate = paymentType === 'credito' ? date(data.due_date || addDays(pdate, Number(getSetting(ctx.db, 'credit_days')) || 30), 'Fecha de vencimiento', { min: pdate }) : null;

  // Un costo 0 o muy distinto del actual (menos de la mitad o más del doble) cambia el costo promedio y
  // la ganancia: si es un error de tecleo, se nota tarde. Se pide confirmarlo (auditoría 2.7).
  const suspicious = [];
  for (const it of items) {
    const p = ctx.db.get('SELECT name, cost FROM products WHERE id = ?', [it.product_id]);
    if (!p) throw new AppError('Producto no encontrado en la compra.');
    if (it.unit_cost === 0) suspicious.push(`"${p.name}" a costo 0 (el actual es ${p.cost.toFixed(2)})`);
    else if (p.cost > 0 && (it.unit_cost < p.cost / 2 || it.unit_cost > p.cost * 2)) suspicious.push(`"${p.name}" a ${it.unit_cost.toFixed(2)} (el actual es ${p.cost.toFixed(2)})`);
  }
  if (suspicious.length && !data.confirm_costs) throw new AppError(`Revise ${suspicious.length === 1 ? 'este costo' : 'estos costos'}: ${suspicious.join('; ')}. Cambiará el costo promedio. ¿Es correcto?`, 'COST_CONFIRM');

  return ctx.db.tx(() => {
    const id = ctx.db.insert('purchases', {
      supplier_id: supplier.id,
      date: pdate,
      due_date: dueDate,
      invoice_ref: text(data.invoice_ref, 'Factura', { max: 60 }),
      payment_type: paymentType,
      payment_method: payMethod,
      total,
      paid,
      balance: round2(total - paid),
      status: accountStatus(total, paid),
      note: text(data.note, 'Nota', { max: 500 }),
      user_id: ctx.user.id,
      created_at: now(),
    });
    for (const it of items) {
      const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [it.product_id]);
      if (!p) throw new AppError('Producto no encontrado en la compra.');
      ctx.db.insert('purchase_items', { purchase_id: id, product_id: p.id, qty: it.qty, unit_cost: it.unit_cost, subtotal: round2(it.qty * it.unit_cost) });
      // Costo promedio ponderado
      const base = Math.max(p.stock, 0);
      const newCost = Math.round(((base * p.cost + it.qty * it.unit_cost) / (base + it.qty)) * 10000) / 10000;
      const updates = { cost: newCost };
      if (it.price_retail !== null) updates.price_retail = it.price_retail;
      if (it.price_wholesale !== null) updates.price_wholesale = it.price_wholesale;
      const changes = {};
      for (const k of Object.keys(updates)) if (Math.abs(p[k] - updates[k]) > 0.00005) changes[k] = { antes: p[k], despues: updates[k] };
      if (Object.keys(changes).length) {
        ctx.db.update('products', p.id, updates);
        audit(ctx, 'cambio_precio', 'producto', p.id, { producto: p.name, origen: `Compra #${id}`, ...changes });
      }
      changeStock(ctx, p.id, it.qty, 'compra', { refType: 'compra', refId: id, unitCost: it.unit_cost, note: `Compra #${id} - ${supplier.name}` });
    }
    if (paid > 0) {
      ctx.db.insert('purchase_payments', { purchase_id: id, supplier_id: supplier.id, date: pdate, amount: paid, method: payMethod, note: 'Pago inicial', user_id: ctx.user.id, created_at: now() });
      ledger(ctx, { direction: 'out', amount: paid, method: payMethod, category: 'compra', refType: 'compra', refId: id, description: `Compra #${id} - ${supplier.name}`, date: pdate });
    }
    audit(ctx, 'registrar_compra', 'compra', id, { proveedor: supplier.name, total, pagado: paid, tipo: paymentType, ...(suspicious.length ? { costos_confirmados: suspicious } : {}) });
    return id;
  });
}

function list(ctx, { from, to, supplier_id, status, payment_type } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('p.date >= ?'); params.push(from); }
  if (to) { where.push('p.date <= ?'); params.push(to); }
  if (supplier_id) { where.push('p.supplier_id = ?'); params.push(supplier_id); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (payment_type) { where.push('p.payment_type = ?'); params.push(payment_type); }
  if (!supplier_id) where.push('p.opening = 0');
  return ctx.db.all(
    `SELECT p.*, s.name AS supplier_name, u.name AS user_name,
            (SELECT COALESCE(SUM(qty),0) FROM purchase_items WHERE purchase_id = p.id) AS units
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.date DESC, p.id DESC`,
    params
  );
}

function get(ctx, { id }) {
  const p = ctx.db.get(
    `SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, u.name AS user_name
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    [id]
  );
  if (!p) throw new AppError('Compra no encontrada.');
  p.items = ctx.db.all(
    `SELECT pi.*, pr.name, pr.sku, pr.color, pr.size FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id WHERE pi.purchase_id = ?`,
    [id]
  );
  p.payments = ctx.db.all('SELECT pp.*, u.name AS user_name FROM purchase_payments pp LEFT JOIN users u ON u.id = pp.user_id WHERE purchase_id = ? ORDER BY id', [id]);
  return p;
}

function applyPayment(ctx, purchase, amount, payMethod, pdate, note) {
  const paid = round2(purchase.paid + amount);
  ctx.db.update('purchases', purchase.id, { paid, balance: round2(purchase.total - paid), status: accountStatus(purchase.total, paid) });
  const payId = ctx.db.insert('purchase_payments', {
    purchase_id: purchase.id, supplier_id: purchase.supplier_id, date: pdate, amount, method: payMethod, note, user_id: ctx.user.id, created_at: now(),
  });
  const supplier = ctx.db.get('SELECT name FROM suppliers WHERE id = ?', [purchase.supplier_id]);
  ledger(ctx, { direction: 'out', amount, method: payMethod, category: 'pago_proveedor', refType: 'pago_proveedor', refId: payId, description: `Pago a ${supplier.name} (compra #${purchase.id})`, date: pdate });
  return payId;
}

// Pago a una compra específica o, si no se indica, a las compras más antiguas del proveedor.
function pay(ctx, { purchase_id, supplier_id, amount, method: m, date: d, note }) {
  amount = money(amount, 'Monto', { allowZero: false });
  const payMethod = method(m);
  const pdate = date(d || today(), 'Fecha del pago', { notFuture: true });
  const n = text(note, 'Nota');
  return ctx.db.tx(() => {
    let targets;
    if (purchase_id) {
      targets = [ctx.db.get("SELECT * FROM purchases WHERE id = ? AND status <> 'anulada'", [purchase_id])].filter(Boolean);
    } else {
      targets = ctx.db.all("SELECT * FROM purchases WHERE supplier_id = ? AND balance > 0 AND status <> 'anulada' ORDER BY COALESCE(due_date, date), id", [supplier_id]);
    }
    const owed = round2(targets.reduce((s, p) => s + p.balance, 0));
    if (!targets.length || owed <= 0) throw new AppError('No hay balance pendiente para pagar.');
    if (amount > owed + 0.004) throw new AppError(`El pago excede el balance pendiente (${owed.toFixed(2)}).`);
    let remaining = amount;
    const ids = [];
    for (const p of targets) {
      if (remaining <= 0) break;
      const part = round2(Math.min(remaining, p.balance));
      if (part <= 0) continue;
      ids.push(applyPayment(ctx, p, part, payMethod, pdate, n));
      remaining = round2(remaining - part);
    }
    audit(ctx, 'pago_proveedor', 'proveedor', targets[0].supplier_id, { monto: amount, metodo: payMethod, compras: targets.map((t) => t.id) });
    return ids;
  });
}

// Anula un pago a proveedor registrado por error (auditoría 3.4). Solo en compras a crédito: el pago de
// una compra de contado se corrige anulando la compra. El dinero vuelve con un movimiento contrario.
function voidPayment(ctx, { payment_id, reason }) {
  const why = text(reason, 'Motivo', { required: true });
  return ctx.db.tx(() => {
    const pay = ctx.db.get('SELECT * FROM purchase_payments WHERE id = ?', [payment_id]);
    if (!pay) throw new AppError('Pago no encontrado.');
    if (pay.voided) throw new AppError('Ese pago ya está anulado.');
    const purchase = ctx.db.get('SELECT * FROM purchases WHERE id = ?', [pay.purchase_id]);
    if (purchase.status === 'anulada') throw new AppError('La compra está anulada.');
    if (purchase.payment_type !== 'credito') throw new AppError('Es el pago de una compra de contado: para corregirlo, anule la compra.');
    const paid = round2(purchase.paid - pay.amount);
    ctx.db.update('purchase_payments', pay.id, { voided: 1 });
    ctx.db.update('purchases', purchase.id, { paid, balance: round2(purchase.total - paid), status: accountStatus(purchase.total, paid) });
    const supplier = ctx.db.get('SELECT name FROM suppliers WHERE id = ?', [purchase.supplier_id]);
    ledger(ctx, { direction: 'in', amount: pay.amount, method: pay.method, category: 'anulacion_pago_proveedor', refType: 'pago_proveedor', refId: pay.id, description: `Anulación de pago a ${supplier.name} (compra #${purchase.id}): ${why}` });
    audit(ctx, 'anular_pago_proveedor', 'proveedor', purchase.supplier_id, { compra: purchase.id, monto: pay.amount, metodo: pay.method, motivo: why });
    return true;
  });
}

// Costo promedio sin la compra que se anula (auditoría 3.3). Cada vez que una compra cambió el costo quedó
// en el historial ("cambio_precio", origen "Compra #id") con el antes y el después:
// - si nada volvió a cambiar el costo después de esa compra, el costo vuelve exactamente al de antes
//   (la mercancía que queda es la que ya estaba);
// - si otra compra lo cambió después, se quita del promedio lo que aportó esta (cantidad × costo);
// - si esta compra no cambió el costo, queda igual.
function costWithout(product, qty, unitCost, record) {
  if (!record) return product.cost;
  if (Math.abs(product.cost - record.despues) < 0.00005) return record.antes;
  const remaining = product.stock - qty;
  if (remaining > 0) {
    const cost = (product.stock * product.cost - qty * unitCost) / remaining;
    if (Number.isFinite(cost) && cost >= 0) return Math.round(cost * 10000) / 10000;
  }
  return product.cost;
}

function voidPurchase(ctx, { id, reason }) {
  const why = text(reason, 'Motivo de anulación', { required: true });
  return ctx.db.tx(() => {
    const p = get(ctx, { id });
    if (p.status === 'anulada') throw new AppError('La compra ya está anulada.');
    // Cambios de costo que hizo esta compra, del más nuevo al más viejo (un producto puede repetirse).
    const records = {};
    for (const r of ctx.db.all("SELECT entity_id, details FROM audit_log WHERE action = 'cambio_precio' AND details LIKE ? ORDER BY id DESC", [`%"origen":"Compra #${id}"%`])) {
      const d = JSON.parse(r.details);
      if (d.cost) (records[r.entity_id] = records[r.entity_id] || []).push(d.cost);
    }
    // En orden inverso al de la compra, para deshacer el promedio paso a paso si un producto se repite.
    for (const it of [...p.items].reverse()) {
      const product = ctx.db.get('SELECT id, name, stock, cost FROM products WHERE id = ?', [it.product_id]);
      const cost = costWithout(product, it.qty, it.unit_cost, (records[product.id] || []).shift());
      changeStock(ctx, it.product_id, -it.qty, 'anulacion_compra', { refType: 'compra', refId: id, unitCost: it.unit_cost, note: `Anulación compra #${id}` });
      if (Math.abs(cost - product.cost) > 0.00005) {
        ctx.db.update('products', product.id, { cost, updated_at: now() });
        audit(ctx, 'cambio_precio', 'producto', product.id, { producto: product.name, origen: `Anulación compra #${id}`, cost: { antes: product.cost, despues: cost } });
      }
    }
    const paid = round2(p.payments.filter((x) => !x.voided).reduce((s, x) => s + x.amount, 0));
    for (const pay of p.payments.filter((x) => !x.voided)) {
      ledger(ctx, { direction: 'in', amount: pay.amount, method: pay.method, category: 'anulacion_compra', refType: 'compra', refId: id, description: `Reembolso por anulación de compra #${id}` });
    }
    ctx.db.run('UPDATE purchase_payments SET voided = 1 WHERE purchase_id = ?', [id]);
    ctx.db.update('purchases', id, { status: 'anulada', balance: 0, voided_at: now(), voided_by: ctx.user.id, void_reason: why });
    audit(ctx, 'anular_compra', 'compra', id, { total: p.total, reembolsado: paid, motivo: why });
    return true;
  });
}

function payables(ctx, { supplier_id, only_open = true } = {}) {
  const where = ["p.status <> 'anulada'", "p.payment_type = 'credito'"];
  const params = [];
  if (only_open) where.push('p.balance > 0');
  if (supplier_id) { where.push('p.supplier_id = ?'); params.push(supplier_id); }
  const t = today();
  return ctx.db.all(
    `SELECT p.id, p.date, p.due_date, p.invoice_ref, p.total, p.paid, p.balance, p.status, p.supplier_id, p.opening, s.name AS supplier_name, s.phone AS supplier_phone,
            CASE WHEN p.balance > 0 AND p.due_date < ? THEN 1 ELSE 0 END AS overdue
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(p.due_date, p.date), p.id`,
    [t, ...params]
  );
}

module.exports = { supplierList, supplierGet, supplierSave, supplierOpening, create, list, get, pay, voidPayment, voidPurchase, payables };
