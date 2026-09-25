# CAPS Shop — Sistema de inventario y contabilidad

Sistema de escritorio para **CAPS._.SHOP · Tienda de Gorras**: una sucursal y dos usuarios (Administrador y Vendedor).
Funciona **sin internet**. Todos los datos se guardan en la computadora donde se instala.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Inventario** | Gorras con nombre, marca, modelo, color, talla, SKU, código de barras, foto, costo, precio al detalle, precio al por mayor, existencia y stock mínimo. Muestra agotados, stock bajo, valor al costo, valor a precio de venta e historial de movimientos de cada producto. |
| **Ajustes de inventario** | Entradas, salidas y conteo físico, siempre con motivo. |
| **Compras** | Proveedor, fecha, productos, cantidades, costo unitario, contado o crédito, método de pago, monto pagado y balance. Al registrar una compra la existencia sube sola y el costo se actualiza con **costo promedio ponderado**. |
| **Proveedores** | Datos de contacto, balance pendiente, historial de compras y de pagos. |
| **Ventas (punto de venta)** | Al detalle o al por mayor (cambia el precio automáticamente), contado o crédito, descuentos, varios métodos de pago en una misma venta, cambio, lector de código de barras, recibo imprimible. |
| **Devoluciones y anulaciones** | Devolución parcial o total (reingresa al inventario y reembolsa o rebaja la deuda). Anulación de ventas y compras con motivo. |
| **Clientes y cuentas por cobrar** | Ventas a crédito, abonos, historial de pagos, vencimiento y estado (pendiente, parcial, pagado, vencido). |
| **Cuentas por pagar** | Compras a crédito con proveedor, total, pagado, balance, vencimiento e historial de pagos. |
| **Gastos y otros ingresos** | Categoría, descripción, fecha, monto, método y usuario que lo registró. Las categorías se editan en Configuración. |
| **Caja** | Apertura con efectivo inicial, ventas en efectivo, abonos, otros ingresos, gastos, retiros, efectivo esperado, efectivo real y diferencia al cierre. |
| **Contabilidad** | Ventas, costo de lo vendido, ganancia bruta, gastos y ganancia neta por día, semana, mes, año o rango. |
| **Flujo de dinero** | Cuánto entró, salió, se vendió, se gastó, se compró, cuánto deben los clientes, cuánto se debe a proveedores y cuánto efectivo debería haber. |
| **Dashboard** | Resumen del día y del mes, cuentas por cobrar/pagar, caja, valor del inventario, productos por reponer y gorras más vendidas. |
| **Reportes** | Inventario, valor del inventario, movimientos, compras, ventas (todas / detalle / por mayor), ganancias, gastos, flujo de caja, cuentas por cobrar y por pagar, clientes, proveedores y más vendidos. Se exportan a **Excel (CSV)**, **PDF** o se imprimen. |
| **Historial** | Cada venta, compra, gasto, pago, abono, ajuste, devolución, anulación y cambio de precio queda registrado con fecha, hora y usuario. |
| **Respaldos** | Copia automática diaria (se guardan 30 días), copia manual y restauración desde Configuración. |

### Permisos

- **Administrador:** todo el sistema (contabilidad, ganancias, costos, compras, gastos, ajustes, reportes, usuarios).
- **Vendedor:** ventas, consulta de inventario (sin costos), clientes, caja y abonos de clientes (se puede desactivar en Configuración). Descuento máximo configurable.

## Instalación en la computadora de la tienda (Windows)

1. Descargue `CAPS-Shop-Setup-X.Y.Z.exe`:
   - desde **Releases** del repositorio, o
   - desde **Actions → Instalador Windows → (última ejecución) → Artifacts**.
2. Ejecútelo y siga el asistente. Se crea un acceso directo **CAPS Shop** en el escritorio.
3. Entre con los usuarios iniciales. **El sistema pedirá cambiar la contraseña la primera vez.**

| Usuario | Contraseña inicial | Rol |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `vendedor` | `vendedor123` | Vendedor |

> Windows puede mostrar "Windows protegió su PC" porque el instalador no está firmado digitalmente. Pulse **Más información → Ejecutar de todas formas**.

### Generar un instalador nuevo

- **Desde GitHub:** en *Actions* elija **Instalador Windows** → **Run workflow**. Para publicarlo en *Releases*, cree una etiqueta: `git tag v1.0.0 && git push origin v1.0.0`.
- **En una PC con Windows:** `npm ci` y luego `npm run dist`. El instalador queda en la carpeta `dist/`.

### Dónde están los datos

`%APPDATA%\CAPS Shop\data\` — contiene `capsshop.db` (la base de datos), `fotos\` y `respaldos\`.
Desinstalar el programa **no** borra los datos. Para pasar el sistema a otra computadora: haga una copia de seguridad en *Configuración* y restáurela en la nueva instalación.

## Primeros pasos recomendados

1. **Configuración:** nombre del negocio, teléfono, dirección, moneda y categorías de gastos.
2. **Proveedores:** registre sus suplidores.
3. **Inventario → Nuevo producto:** cargue cada gorra (con foto y código de barras si tiene). Puede poner existencia inicial o registrarla con una **Compra**.
4. **Caja → Abrir caja** al comenzar el día y **Cerrar caja** al terminar.
5. **Nueva venta:** escanee o busque la gorra, elija detalle/mayor, contado/crédito y cobre con **F9**.

## Cómo se calculan las ganancias

- **Ventas netas** = ventas del período − devoluciones.
- **Costo de lo vendido** = costo promedio de cada gorra en el momento de la venta (menos lo devuelto al inventario).
- **Ganancia bruta** = ventas netas − costo de lo vendido.
- **Ganancia neta** = ganancia bruta − gastos + otros ingresos.

Las compras de mercancía **no** son gasto: se convierten en inventario y pasan a ser costo cuando la gorra se vende.

## Desarrollo

Electron + SQLite (sql.js, sin módulos nativos). La lógica del negocio está en `src/core` y se prueba sin interfaz.

```bash
npm install
npm start        # abrir la aplicación
npm test         # pruebas de la lógica del negocio
npm run dist     # generar el instalador (en Windows)
```

```
src/core/        base de datos, esquema y reglas del negocio (con permisos por rol)
src/main/        proceso principal de Electron (ventana, archivos, respaldos, impresión)
src/renderer/    interfaz (HTML/CSS/JS sin dependencias)
build/           íconos del instalador
test/            pruebas
```
