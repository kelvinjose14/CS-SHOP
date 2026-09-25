'use strict';
// Esquema de la base de datos y migraciones versionadas (PRAGMA user_version).

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
];

function migrate(db) {
  let version = db.value('PRAGMA user_version');
  while (version < MIGRATIONS.length) {
    db.exec(MIGRATIONS[version]);
    version++;
    db.exec(`PRAGMA user_version = ${version}`);
  }
}

module.exports = { migrate, SCHEMA_VERSION: MIGRATIONS.length };
