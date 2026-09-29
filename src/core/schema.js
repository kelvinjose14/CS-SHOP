'use strict';
// Esquema de la base de datos y migraciones versionadas (PRAGMA user_version).
const { AppError, modelKey, catalogKey, sizeOrder } = require('./util');

const MIGRATIONS = [
  // v1: esquema inicial
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','vendedor')),
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    must_change INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT, model TEXT, color TEXT, size TEXT,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    barcode TEXT,
    photo TEXT,
    cost REAL NOT NULL DEFAULT 0,
    price_retail REAL NOT NULL DEFAULT 0,
    price_wholesale REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX ux_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

  CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL,
    qty INTEGER NOT NULL,
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    unit_cost REAL,
    ref_type TEXT, ref_id INTEGER,
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_invmov_product ON inventory_movements(product_id, created_at);
  CREATE INDEX ix_invmov_date ON inventory_movements(created_at);

  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT, address TEXT, email TEXT, notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, phone TEXT, address TEXT, email TEXT, document TEXT, notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    date TEXT NOT NULL,
    due_date TEXT,
    invoice_ref TEXT,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('contado','credito')),
    payment_method TEXT,
    total REAL NOT NULL,
    paid REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    voided_at TEXT, voided_by INTEGER, void_reason TEXT
  );
  CREATE INDEX ix_purchases_date ON purchases(date);

  CREATE TABLE purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE purchase_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    note TEXT,
    voided INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    date TEXT NOT NULL,
    sale_type TEXT NOT NULL CHECK (sale_type IN ('detalle','mayor')),
    payment_type TEXT NOT NULL CHECK (payment_type IN ('contado','credito')),
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    cost_total REAL NOT NULL,
    paid REAL NOT NULL DEFAULT 0,
    change_given REAL NOT NULL DEFAULT 0,
    returned_total REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL,
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    voided_at TEXT, voided_by INTEGER, void_reason TEXT
  );
  CREATE INDEX ix_sales_date ON sales(date);
  CREATE INDEX ix_sales_customer ON sales(customer_id);

  CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    description TEXT,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    line_discount REAL NOT NULL DEFAULT 0,
    net_total REAL NOT NULL,
    unit_cost REAL NOT NULL,
    returned_qty INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    customer_id INTEGER REFERENCES customers(id),
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT,
    voided INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    date TEXT NOT NULL,
    total REAL NOT NULL,
    cost_total REAL NOT NULL,
    credit_applied REAL NOT NULL DEFAULT 0,
    refund_amount REAL NOT NULL DEFAULT 0,
    refund_method TEXT,
    restock INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES returns(id),
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    voided INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_expenses_date ON expenses(date);

  CREATE TABLE incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    voided INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at TEXT NOT NULL,
    opened_by INTEGER REFERENCES users(id),
    opening_amount REAL NOT NULL,
    closed_at TEXT,
    closed_by INTEGER REFERENCES users(id),
    expected_amount REAL,
    counted_amount REAL,
    difference REAL,
    note TEXT,
    status TEXT NOT NULL CHECK (status IN ('abierta','cerrada'))
  );

  -- Libro de todo el dinero que entra y sale (flujo de caja).
  CREATE TABLE money_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in','out')),
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    category TEXT NOT NULL,
    ref_type TEXT, ref_id INTEGER,
    description TEXT,
    session_id INTEGER REFERENCES cash_sessions(id),
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_money_date ON money_movements(date);
  CREATE INDEX ix_money_session ON money_movements(session_id);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    details TEXT
  );
  CREATE INDEX ix_audit_date ON audit_log(created_at);
  `,

  // v2: varias computadoras en red. Cada PC tiene su caja y queda en el historial.
  `
  CREATE TABLE terminals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  );
  INSERT INTO terminals (id, name, created_at) VALUES (1, 'Principal', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'));

  ALTER TABLE cash_sessions ADD COLUMN terminal_id INTEGER REFERENCES terminals(id);
  UPDATE cash_sessions SET terminal_id = 1;
  CREATE INDEX ix_cash_terminal ON cash_sessions(terminal_id, status);

  ALTER TABLE audit_log ADD COLUMN terminal_id INTEGER REFERENCES terminals(id);
  `,

  // v3: índices de las tablas de detalle. Con 3 años de datos, la lista de ventas tardaba segundos
  // (docs/tecnico/rendimiento.md).
  `
  CREATE INDEX ix_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX ix_sale_items_product ON sale_items(product_id);
  CREATE INDEX ix_sale_payments_sale ON sale_payments(sale_id);
  CREATE INDEX ix_sale_payments_customer ON sale_payments(customer_id);
  CREATE INDEX ix_purchase_items_purchase ON purchase_items(purchase_id);
  CREATE INDEX ix_purchase_payments_purchase ON purchase_payments(purchase_id);
  CREATE INDEX ix_purchases_supplier ON purchases(supplier_id);
  CREATE INDEX ix_returns_sale ON returns(sale_id);
  CREATE INDEX ix_return_items_return ON return_items(return_id);
  CREATE INDEX ix_audit_action ON audit_log(action);
  `,

  // v4: saldos iniciales de clientes y proveedores (una venta o compra sin artículos que no cuenta
  // como venta ni compra del período) y aportes de capital del dueño, que no son ganancia (DT-21).
  `
  ALTER TABLE sales ADD COLUMN opening INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE purchases ADD COLUMN opening INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE capital (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    description TEXT,
    voided INTEGER NOT NULL DEFAULT 0,
    void_reason TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_capital_date ON capital(date);
  `,

  // v5: controles de la auditoría (secciones 2 y 4).
  // - Límite de crédito por cliente (0 = sin límite).
  // - Apertura de caja con un monto distinto al del último cierre: diferencia y motivo (2.1).
  // - Revisión de los depósitos al banco contra el estado de cuenta (4.2).
  // - Reglas en la propia base, como segunda defensa si el núcleo dejara pasar un dato imposible (2.11).
  `
  ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;
  ALTER TABLE cash_sessions ADD COLUMN opening_difference REAL;
  ALTER TABLE cash_sessions ADD COLUMN opening_reason TEXT;

  -- Depósitos por verificar y anulaciones de movimientos: sin estos índices, con 3 años de datos la lista
  -- de depósitos tardaba 1.5 s (docs/tecnico/rendimiento.md).
  CREATE INDEX ix_money_ref ON money_movements(ref_type, ref_id);
  CREATE INDEX ix_money_category ON money_movements(category, method);

  CREATE TABLE deposit_checks (
    movement_id INTEGER PRIMARY KEY REFERENCES money_movements(id),
    status TEXT NOT NULL CHECK (status IN ('verificado','no_recibido')),
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  ${guards([
    ['money_movements', 'NEW.amount > 0', 'un movimiento de dinero debe ser mayor que cero'],
    ['sale_payments', 'NEW.amount > 0', 'un cobro debe ser mayor que cero'],
    ['purchase_payments', 'NEW.amount > 0', 'un pago a proveedor debe ser mayor que cero'],
    ['expenses', 'NEW.amount > 0', 'un gasto debe ser mayor que cero'],
    ['incomes', 'NEW.amount > 0', 'un ingreso debe ser mayor que cero'],
    ['capital', 'NEW.amount > 0', 'un aporte debe ser mayor que cero'],
    ['sales', 'NEW.subtotal >= 0 AND NEW.discount >= 0 AND NEW.discount <= NEW.subtotal + 0.005 AND NEW.total >= 0 AND NEW.paid >= -0.005 AND NEW.balance >= -0.005 AND NEW.change_given >= 0 AND NEW.returned_total >= 0 AND NEW.returned_total <= NEW.total + 0.005', 'los importes de la venta no cuadran'],
    ['sale_items', 'NEW.qty > 0 AND NEW.unit_price >= 0 AND NEW.line_discount >= 0 AND NEW.unit_cost >= 0 AND NEW.returned_qty >= 0 AND NEW.returned_qty <= NEW.qty', 'una línea de venta tiene cantidades o importes imposibles'],
    ['purchases', 'NEW.total >= 0 AND NEW.paid >= -0.005 AND NEW.balance >= -0.005', 'los importes de la compra no cuadran'],
    ['purchase_items', 'NEW.qty > 0 AND NEW.unit_cost >= 0', 'una línea de compra tiene cantidades o costos imposibles'],
    ['returns', 'NEW.total >= 0 AND NEW.refund_amount >= 0 AND NEW.credit_applied >= 0', 'los importes de la devolución no cuadran'],
    ['return_items', 'NEW.qty > 0', 'una línea de devolución debe tener cantidad'],
    ['products', 'NEW.cost >= 0 AND NEW.price_retail >= 0 AND NEW.price_wholesale >= 0 AND NEW.min_stock >= 0', 'un producto no puede tener costo, precio ni mínimo negativos', 'cost, price_retail, price_wholesale, min_stock'],
    ['inventory_movements', 'NEW.qty <> 0 AND NEW.stock_after = NEW.stock_before + NEW.qty', 'un movimiento de inventario no cuadra con la existencia'],
    ['cash_sessions', 'NEW.opening_amount >= 0 AND (NEW.counted_amount IS NULL OR NEW.counted_amount >= 0)', 'el efectivo de una caja no puede ser negativo'],
  ])}
  `,

  // v6: categoría del producto (snapback, trucker…) para ver ventas y utilidad por categoría en el
  // dashboard ejecutivo. Índice de ventas por vendedor para la utilidad por vendedor.
  `
  ALTER TABLE products ADD COLUMN category TEXT;
  CREATE INDEX ix_products_category ON products(category);
  CREATE INDEX ix_sales_user ON sales(user_id, date);
  `,

  // v7: inventario avanzado (versión 1.5).
  // - Modelos: las variantes (color y talla) con el mismo nombre, marca y modelo se agrupan. Cada
  //   variante sigue siendo un producto con su SKU, código y existencia; el modelo solo las reúne.
  // - Apartados: gorras reservadas para un cliente hasta una fecha. Mientras el apartado está activo y
  //   no vence, esas unidades no se pueden vender a otro (stock disponible = existencia − apartado).
  // - Fecha del último conteo de cada producto, para sugerir el conteo cíclico.
  // Es una función porque la clave del modelo se calcula igual que en el programa (acentos y ñ incluidos).
  (db) => {
    db.exec(`
    CREATE TABLE product_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, brand TEXT, model TEXT,
      created_at TEXT NOT NULL
    );
    ALTER TABLE products ADD COLUMN model_id INTEGER REFERENCES product_models(id);
    ALTER TABLE products ADD COLUMN last_counted_at TEXT;
    CREATE INDEX ix_products_model ON products(model_id);

    CREATE TABLE reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      expires_on TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('activo','vendido','cancelado')),
      note TEXT,
      sale_id INTEGER REFERENCES sales(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      closed_at TEXT, closed_by INTEGER REFERENCES users(id), close_reason TEXT
    );
    CREATE INDEX ix_reservations_status ON reservations(status, expires_on);
    CREATE INDEX ix_reservations_customer ON reservations(customer_id);
    CREATE TABLE reservation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL REFERENCES reservations(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL CHECK (qty > 0)
    );
    CREATE INDEX ix_reservation_items_res ON reservation_items(reservation_id);
    CREATE INDEX ix_reservation_items_product ON reservation_items(product_id);
    `);
    const models = new Map();
    for (const p of db.all('SELECT id, name, brand, model, created_at FROM products ORDER BY id')) {
      const key = modelKey(p);
      if (!models.has(key)) models.set(key, db.insert('product_models', { key, name: p.name, brand: p.brand || null, model: p.model || null, created_at: p.created_at }));
      db.run('UPDATE products SET model_id = ? WHERE id = ?', [models.get(key), p.id]);
    }
    db.exec(`UPDATE products SET last_counted_at = (SELECT MAX(created_at) FROM inventory_movements m
               WHERE m.product_id = products.id AND m.type IN ('conteo', 'ajuste'))`);
  },

  // v8: CRM de clientes (versión 1.6). Cumpleaños (mes y día, "MM-DD"), etiquetas (lista en JSON), VIP
  // manual (auto = según lo que gasta) y notas de seguimiento con fecha y usuario.
  `
  ALTER TABLE customers ADD COLUMN birthday TEXT;
  ALTER TABLE customers ADD COLUMN tags TEXT;
  ALTER TABLE customers ADD COLUMN vip_mode TEXT NOT NULL DEFAULT 'auto' CHECK (vip_mode IN ('auto', 'si', 'no'));
  CREATE TABLE customer_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    text TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_customer_notes ON customer_notes(customer_id, id);
  `,

  // v9: catálogos de productos (versión 1.7). Marcas, categorías, colores (con su código de color) y
  // tallas (con su orden) pasan a tablas propias, y cada producto guarda sus claves. Cada producto sigue
  // siendo una variante (color + talla) de su modelo; una misma combinación no puede repetirse en un
  // modelo. Los textos de siempre (brand, category, color, size) se conservan con el nombre del catálogo
  // para búsquedas, etiquetas y reportes.
  (db) => {
    db.exec(`
    CREATE TABLE brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE colors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, hex TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE sizes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, sort REAL NOT NULL DEFAULT 200, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id);
    ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id);
    ALTER TABLE products ADD COLUMN color_id INTEGER REFERENCES colors(id);
    ALTER TABLE products ADD COLUMN size_id INTEGER REFERENCES sizes(id);
    ALTER TABLE product_models ADD COLUMN brand_id INTEGER REFERENCES brands(id);
    ALTER TABLE product_models ADD COLUMN category_id INTEGER REFERENCES categories(id);
    CREATE INDEX ix_products_brand_id ON products(brand_id);
    CREATE INDEX ix_products_category_id ON products(category_id);
    `);
    const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const ids = { brands: new Map(), categories: new Map(), colors: new Map(), sizes: new Map() };
    const add = (table, name, extra = {}) => {
      const k = catalogKey(name);
      if (!k) return null;
      if (!ids[table].has(k)) ids[table].set(k, db.insert(table, { name: String(name).trim().replace(/\s+/g, ' '), ...extra, active: 1, created_at: t }));
      return ids[table].get(k);
    };
    for (const b of CATALOG_SEEDS.brands) add('brands', b);
    for (const c of CATALOG_SEEDS.categories) add('categories', c);
    for (const [name, hex] of CATALOG_SEEDS.colors) add('colors', name, { hex });
    for (const s of CATALOG_SEEDS.sizes) add('sizes', s, { sort: sizeOrder(s) });
    // Lo que ya estaba escrito en los productos entra al catálogo tal como se escribió la primera vez.
    for (const p of db.all('SELECT id, brand, category, color, size FROM products ORDER BY id')) {
      const set = {
        brand_id: add('brands', p.brand),
        category_id: add('categories', p.category),
        color_id: add('colors', p.color, { hex: null }),
        size_id: add('sizes', p.size, { sort: sizeOrder(p.size) }),
      };
      db.run('UPDATE products SET brand_id = ?, category_id = ?, color_id = ?, size_id = ? WHERE id = ?', [set.brand_id, set.category_id, set.color_id, set.size_id, p.id]);
    }
    // El texto de cada producto queda igual al nombre del catálogo ("snapback" → "Snapback").
    db.exec(`
    UPDATE products SET brand = (SELECT name FROM brands WHERE id = brand_id) WHERE brand_id IS NOT NULL;
    UPDATE products SET category = (SELECT name FROM categories WHERE id = category_id) WHERE category_id IS NOT NULL;
    UPDATE products SET color = (SELECT name FROM colors WHERE id = color_id) WHERE color_id IS NOT NULL;
    UPDATE products SET size = (SELECT name FROM sizes WHERE id = size_id) WHERE size_id IS NOT NULL;
    UPDATE product_models SET brand_id = (SELECT brand_id FROM products p WHERE p.model_id = product_models.id AND brand_id IS NOT NULL ORDER BY p.id LIMIT 1),
                              category_id = (SELECT category_id FROM products p WHERE p.model_id = product_models.id AND category_id IS NOT NULL ORDER BY p.id LIMIT 1);
    `);
    // Si una base vieja tiene dos productos con el mismo nombre, color y talla (por ejemplo, cargados dos
    // veces con distinto SKU), el segundo queda en un modelo aparte: no se pierde nada y la regla se cumple.
    const dups = db.all(`SELECT p.id, p.model_id, m.key FROM products p JOIN product_models m ON m.id = p.model_id
      WHERE EXISTS (SELECT 1 FROM products q WHERE q.model_id = p.model_id AND IFNULL(q.color_id, 0) = IFNULL(p.color_id, 0)
                    AND IFNULL(q.size_id, 0) = IFNULL(p.size_id, 0) AND q.id < p.id)`);
    for (const d of dups) {
      const model = db.get('SELECT * FROM product_models WHERE id = ?', [d.model_id]);
      const newId = db.insert('product_models', { key: `${d.key}#${d.id}`, name: model.name, brand: model.brand, model: model.model, brand_id: model.brand_id, category_id: model.category_id, created_at: t });
      db.run('UPDATE products SET model_id = ? WHERE id = ?', [newId, d.id]);
    }
    db.exec('CREATE UNIQUE INDEX ux_products_variant ON products(model_id, IFNULL(color_id, 0), IFNULL(size_id, 0)) WHERE model_id IS NOT NULL;');
  },

  // v10: formulario de productos simple (1.7). Catálogo de modelos (59FIFTY, 9FORTY…), que no depende de
  // la marca; el producto guarda el nombre del modelo como siempre. Marcas y categorías quedan con pocas
  // opciones al empezar: las de la lista inicial que ningún producto usa se desactivan (no se borran;
  // se activan de nuevo al crearlas desde el formulario o en Configuración).
  (db) => {
    db.exec('CREATE TABLE models (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);');
    const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const clean = (s) => String(s).trim().replace(/\s+/g, ' ');
    const models = new Map();
    const addModel = (name) => {
      const k = catalogKey(name);
      if (k && !models.has(k)) models.set(k, { id: db.insert('models', { name: clean(name), active: 1, created_at: t }), name: clean(name) });
      return models.get(k);
    };
    for (const m of QUICK_OPTIONS.models) addModel(m);
    for (const p of db.all('SELECT id, model FROM products WHERE model IS NOT NULL ORDER BY id')) {
      const m = addModel(p.model);
      if (m && m.name !== p.model) db.run('UPDATE products SET model = ? WHERE id = ?', [m.name, p.id]);
    }
    for (const r of db.all('SELECT id, model FROM product_models WHERE model IS NOT NULL')) {
      const m = models.get(catalogKey(r.model));
      if (m && m.name !== r.model) db.run('UPDATE product_models SET model = ? WHERE id = ?', [m.name, r.id]);
    }
    const hasCategory = db.all('SELECT name FROM categories').some((c) => catalogKey(c.name) === 'ajustable');
    if (!hasCategory) db.insert('categories', { name: 'Ajustable', active: 1, created_at: t });
    for (const [table, column] of [['brands', 'brand_id'], ['categories', 'category_id']]) {
      const keep = new Set(QUICK_OPTIONS[table].map(catalogKey));
      const seeded = new Set(CATALOG_SEEDS[table].map(catalogKey));
      for (const r of db.all(`SELECT id, name FROM ${table} WHERE active = 1`)) {
        const k = catalogKey(r.name);
        if (!seeded.has(k) || keep.has(k)) continue;
        if (db.value(`SELECT COUNT(*) FROM products WHERE ${column} = ?`, [r.id])) continue;
        db.run(`UPDATE ${table} SET active = 0 WHERE id = ?`, [r.id]);
      }
    }
  },

  // v11: ventas en espera (1.9). Un carrito que se suspende para atender a otro cliente y se retoma
  // después, desde esta u otra PC. data guarda las líneas, el cliente, el tipo de venta y el descuento
  // (JSON); items y total son para la lista. No aparta las gorras: se venden hasta cobrar.
  `
  CREATE TABLE held_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    data TEXT NOT NULL,
    items INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    customer_id INTEGER REFERENCES customers(id),
    user_id INTEGER REFERENCES users(id),
    terminal_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX ix_held_sales_updated ON held_sales(updated_at);
  `,
];

// Opciones con las que empieza el formulario de productos (v10).
const QUICK_OPTIONS = {
  brands: ['New Era', 'Mitchell & Ness', 'Goorin Bros.', 'Nike', 'Adidas'],
  models: ['59FIFTY', '9FIFTY', '9FORTY', '39THIRTY', '9TWENTY'],
  categories: ['Fitted', 'Snapback', 'Trucker', 'Ajustable', 'Dad Hat'],
};

// Opciones iniciales de los catálogos (v9). El dueño agrega más desde el formulario del producto.
const CATALOG_SEEDS = {
  brands: ['New Era', 'Mitchell & Ness', "'47 Brand", 'Nike', 'Adidas', 'Jordan', 'Puma', 'Champion', 'Goorin Bros.', 'Von Dutch', 'Flexfit', 'Yupoong', 'Richardson', 'Supreme', 'Fear of God / Essentials', 'Otra', 'Sin marca'],
  categories: ['Fitted', 'Snapback', 'Trucker', 'Dad Hat', 'Strapback', 'Adjustable', 'Beanie', 'Visera', 'Otro'],
  colors: [
    ['Negro', '#000000'], ['Blanco', '#FFFFFF'], ['Rojo', '#FF0000'], ['Azul', '#1E5BD8'], ['Azul marino', '#1B2A4A'],
    ['Verde', '#2E7D32'], ['Gris', '#9E9E9E'], ['Beige', '#D8C3A5'], ['Marrón', '#6D4C41'], ['Crema', '#F3E9D2'],
    ['Amarillo', '#FBC02D'], ['Naranja', '#EF6C00'], ['Rosado', '#EC407A'], ['Morado', '#7B1FA2'], ['Vino', '#7B1E2B'],
  ],
  sizes: ['6 1/2', '6 5/8', '6 3/4', '6 7/8', '7', '7 1/8', '7 1/4', '7 3/8', '7 1/2', '7 5/8', '7 3/4', '7 7/8', '8', 'Ajustable', 'Snapback', 'One Size'],
};

// Reglas de la base (v5): cada una es un par de disparadores (al insertar y al modificar) que rechazan
// la operación completa si la fila no cumple la condición.
function guards(list) {
  return list.map(([table, cond, message, columns]) => ['INSERT', `UPDATE${columns ? ` OF ${columns}` : ''}`].map((op) => `
  CREATE TRIGGER chk_${table}_${op.slice(0, 3).toLowerCase()} BEFORE ${op} ON ${table} WHEN NOT (${cond})
  BEGIN SELECT RAISE(ABORT, 'La base de datos rechazó el cambio: ${message}.'); END;`).join('')).join('\n');
}

// Aplica las migraciones que falten. Se llama dentro de una transacción: si una falla, no queda nada a medias.
function migrate(db, migrations = MIGRATIONS) {
  let version = db.value('PRAGMA user_version');
  if (version > migrations.length) {
    // Una versión anterior del programa no debe tocar una base creada por una más nueva.
    throw new AppError('Esta base de datos es de una versión más nueva de CAPS Shop. Instale la versión más reciente del programa.', 'SCHEMA');
  }
  while (version < migrations.length) {
    const m = migrations[version];
    if (typeof m === 'function') m(db);
    else db.exec(m);
    version++;
    db.exec(`PRAGMA user_version = ${version}`);
  }
}

module.exports = { migrate, MIGRATIONS, SCHEMA_VERSION: MIGRATIONS.length, CATALOG_SEEDS, QUICK_OPTIONS };
