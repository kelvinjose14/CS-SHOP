# Reglas de negocio

Cómo calcula y decide el sistema. Es la **fuente única de verdad**:
- el manual remite aquí;
- cualquier cambio a estas reglas debe actualizar este documento y las pruebas (`test/core.test.js`).

Cada regla indica dónde está en el código. Todos los ejemplos numéricos están comprobados con el propio sistema.

## 1. Costo de cada gorra (costo promedio)

- Cada compra actualiza el costo del producto con el **costo promedio ponderado** (`src/core/services/purchases.js`, `create`):

  ```
  costo nuevo = (existencia × costo actual + cantidad comprada × costo de compra) / (existencia + cantidad comprada)
  ```
- Si la existencia es 0 o negativa, el costo nuevo es el de la compra.
- El costo se guarda con 4 decimales para no acumular errores de redondeo. En pantalla se muestra con 2.
- Cada venta **guarda el costo del momento** en cada línea (`sale_items.unit_cost`). Si después cambia el costo, las ventas pasadas no cambian.
- Editar el costo a mano en **Inventario** también queda registrado en el historial (`cambio_precio`).

**Ejemplo:** hay 10 gorras a RD$ 500 y se compran 10 más a RD$ 600. El costo nuevo es (10 × 500 + 10 × 600) / 20 = **RD$ 550**.

## 2. Ganancia

Fuente: `src/core/services/reports.js` (`salesTotals`, `profit`).

| Concepto | Cálculo |
|---|---|
| Ventas del período | Suma del total de las ventas **no anuladas** con fecha dentro del período. El total ya tiene los descuentos aplicados |
| Devoluciones | Suma de las devoluciones con fecha dentro del período, de ventas no anuladas |
| **Ventas netas** | Ventas − devoluciones |
| Costo de lo vendido | Suma del costo guardado en cada venta − el costo de lo devuelto que **volvió al inventario** |
| **Ganancia bruta** | Ventas netas − costo de lo vendido |
| Margen bruto | Ganancia bruta / ventas netas |
| Gastos | Gastos no anulados con fecha dentro del período |
| Otros ingresos | Otros ingresos no anulados con fecha dentro del período |
| **Ganancia neta** | Ganancia bruta − gastos + otros ingresos |

- Las **compras de mercancía no son gasto**. Se vuelven inventario y pasan a costo al venderse.
- Una devolución **sin** reingreso al inventario no descuenta el costo: la gorra dañada queda como pérdida.
- Los **aportes del dueño** no son otros ingresos: se registran en **Gastos → Aportes del dueño**, entran al flujo de dinero y **no suman a la ganancia** (DT-21).
- Los **saldos iniciales** de clientes y proveedores no son ventas ni compras: no suman a las ventas, al costo ni a lo comprado del período (regla 5).

**Ejemplo:** se venden 2 gorras de RD$ 1,200 con RD$ 100 de descuento. Cada gorra costó RD$ 500, y ese día se pagan RD$ 300 de transporte.

| | |
|---|---|
| Ventas netas | 2 × 1,200 − 100 = **2,300** |
| Costo | 2 × 500 = **1,000** |
| Ganancia bruta | 2,300 − 1,000 = **1,300** |
| Ganancia neta | 1,300 − 300 = **1,000** |

## 3. Ventas

Fuente: `src/core/services/sales.js` (`create`).

- **Precio:** sale de la lista según el tipo de venta, **detalle** o **por mayor**. Solo el administrador puede cambiarlo en la venta.
- **Descuentos:** hay un descuento general de la venta, y el núcleo también acepta descuentos por línea.
  - El vendedor puede descontar como máximo el **% configurado** (10 % por defecto) del subtotal antes de descuentos, sumando todos los descuentos.
  - Si la opción está desactivada, no puede descontar nada.
- **Reparto del descuento:** el descuento general se reparte entre las líneas en proporción a su importe. Así cada línea sabe su **precio neto cobrado**, que se usa en las devoluciones.
- **Contado:** lo recibido debe cubrir el total. El cambio solo puede salir de pagos en efectivo, y lo que se registra como cobrado es el total, no lo recibido.
- **Crédito:**
  - Requiere cliente.
  - El abono inicial es opcional y no puede superar el total.
  - La fecha de vencimiento por defecto es la fecha de hoy más los días de crédito configurados.
- **Pagos mixtos:** una venta puede tener varios pagos con distintos métodos: **Efectivo**, **Tarjeta**, **Transferencia** y **Otro**.
- **Fecha:** la venta siempre lleva la fecha y hora actuales. No se pueden registrar ventas con fecha anterior.
- **Número:** `V-` seguido del número interno con 6 cifras (por ejemplo, V-000120).

## 4. Existencias

Fuente: `src/core/services/common.js` (`changeStock`) y `products.js`.

- Toda variación de existencia pasa por un **movimiento de inventario**, que registra el tipo, la cantidad, la existencia antes y después, el costo, la referencia y el usuario. Los tipos están en el [manual de inventario](../manual/04-inventario.md#45-movimientos-de-inventario).
- La existencia **no puede quedar negativa**, salvo que se active **Permitir vender sin existencia**. La regla aplica a ventas, salidas manuales y anulaciones de compra.
- **Estados de un producto:**
  - **Agotado:** existencia ≤ 0.
  - **Stock bajo:** 0 < existencia ≤ stock mínimo.
  - **Normal:** el resto.
- **Valor del inventario:** existencia × costo, sumando solo los productos con existencia positiva. El **valor a precio de venta** usa el precio al detalle. La **ganancia potencial** es la diferencia entre ambos.
- **SKU:** si se deja vacío, se asigna `CS-` más el siguiente número con 5 cifras. El SKU y el código de barras no se pueden repetir.
- Los productos no se borran; se desactivan.

## 5. Créditos: estados y abonos

Fuente: `src/core/util.js` (`accountStatus`), `sales.js` (`pay`) y `purchases.js` (`pay`).

| Estado | Condición |
|---|---|
| **Pendiente** | Pagado = 0 y hay saldo |
| **Parcial** | Pagado > 0 y hay saldo |
| **Pagado** | Saldo ≤ 0 |
| **Vencido** (marca adicional) | Hay saldo y la fecha de vencimiento ya pasó |
| **Anulada** | La venta o compra fue anulada |

- **Saldo de una venta** = total − devuelto − pagado.
- **Abono a un cliente o proveedor:** se reparte empezando por la factura con **fecha de vencimiento más próxima**. Sin fecha de vencimiento, cuenta la fecha de la venta o compra.
- Un abono no puede superar el saldo pendiente.
- El vendedor solo puede registrar abonos si la opción está activada.
- **Saldo inicial** (RF-NUE-01): lo que un cliente o proveedor ya debía al empezar a usar el sistema. Se guarda como una venta o compra a crédito **sin artículos** (`opening = 1`), con su fecha y vencimiento. Se cobra o se paga con abonos como cualquier otra, y suma a las cuentas por cobrar o por pagar, pero no aparece en las listas de ventas y compras ni en los reportes del período. Lo registra solo el administrador.

## 6. Devoluciones

Fuente: `sales.js` (`createReturn`). Solo el administrador.

- **Valor devuelto** = unidades devueltas × precio neto cobrado. Ese precio ya incluye el reparto del descuento. La última unidad de una línea absorbe el redondeo.
- **Primero se rebaja la deuda y después se reembolsa:**

  ```
  rebaja de deuda = mínimo(valor devuelto, saldo de la venta)
  reembolso       = valor devuelto − rebaja de deuda
  ```
- El reembolso sale con el método elegido. Si es en efectivo, sale de la caja abierta.
- **Reingreso al inventario:** con reingreso, la existencia sube y el costo se descuenta de las ganancias. Sin reingreso, no se descuenta el costo.
- No se puede devolver más de lo vendido menos lo ya devuelto, ni devolver una venta anulada.

**Ejemplo 1:** se venden 3 gorras de RD$ 1,200 con RD$ 300 de descuento, total RD$ 3,300. El precio neto de cada una es RD$ 1,100.
- Al devolver 1 se reembolsan **RD$ 1,100**.
- Las ventas netas quedan en 2,200.
- Si la gorra vuelve al inventario y cada una costó RD$ 500, el costo de lo vendido queda en 1,000.

**Ejemplo 2:** una venta a crédito de RD$ 100 tiene RD$ 20 pagados y un saldo de RD$ 80.
- Si se devuelven RD$ 30, la deuda baja a **RD$ 50** y no hay reembolso.
- Si se devuelven RD$ 90, la deuda queda en 0 y se reembolsan **RD$ 10**.

## 7. Anulaciones

- **Venta** (`sales.js`, `voidSale`), solo el administrador:
  - Toda la mercancía vuelve al inventario.
  - Todo lo cobrado sale como devolución de dinero, pago por pago y con su método.
  - La venta queda **Anulada** y deja de contar en ventas y ganancias.
  - **No se puede anular una venta con devoluciones.**
- **Compra** (`purchases.js`, `voidPurchase`):
  - Las unidades salen del inventario; si ya no hay existencia suficiente, no se puede anular.
  - Lo pagado vuelve como entrada de dinero ("Reembolsos de compras").
  - La compra queda **Anulada** con saldo 0.
- **Gasto o ingreso** (`finance.js`): queda anulado y se registra el movimiento de dinero contrario.
- Nada se borra. Todas las anulaciones piden un motivo y quedan en el historial.

## 8. Caja

Fuente: `src/core/services/finance.js` (`sessionSummary`, `cashStatus`), `common.js` (`ledger`) y `reports.js` (`currentCash`).

- **Cada computadora tiene su caja** (DT-14). Puede haber **una caja abierta por computadora**.
- **Todo movimiento de dinero** se anota en el libro de dinero (`money_movements`), con dirección (entra o sale), método, concepto y fecha. Si el método es **efectivo**, se asocia a la caja abierta **de la computadora donde se registra**.
- Con **Exigir caja abierta** activado, un movimiento en efectivo se rechaza si la caja de esa computadora está cerrada, aunque otra tenga la suya abierta.
- **Efectivo de la tienda** (Inicio y Flujo de dinero) = suma, por cada computadora activa, de su efectivo esperado si la caja está abierta, o de lo contado en su último cierre si está cerrada.
- **Efectivo esperado** = efectivo inicial + todas las entradas en efectivo de la sesión − todas las salidas en efectivo de la sesión.
- **Diferencia al cerrar** = efectivo real contado − efectivo esperado. Negativa es faltante; positiva, sobrante.
- **Movimientos manuales de efectivo** (DT-22):
  - **Entrada de efectivo:** sencillo o cambio que se pone en la gaveta. Cualquier usuario.
  - **Depósito al banco:** el efectivo sale de la caja y entra al banco (método transferencia). **No es gasto ni salida del negocio.** Cualquier usuario, con descripción obligatoria.
  - **Retiro:** dinero que sale del negocio (por ejemplo, para el dueño). **Solo el administrador.**
- Un depósito o un retiro no puede superar el efectivo esperado.
- Un gasto o una compra con **fecha anterior** pagados en efectivo salen de la **caja abierta hoy**. Su fecha solo afecta los reportes.

**Ejemplo:** la caja abre con RD$ 1,000 y se vende en efectivo por RD$ 2,300. El efectivo esperado es **RD$ 3,300**. Si se cuentan RD$ 3,250, la diferencia es **−RD$ 50** (faltante).

**Ejemplo con dos computadoras:**
- La principal abre con RD$ 1,000 y la Caja 2 con RD$ 500.
- La Caja 2 cobra una venta de RD$ 1,200 en efectivo y la principal, dos.
- Esperado: principal **RD$ 3,400** y Caja 2 **RD$ 1,700**.
- El Inicio muestra **RD$ 5,100**.
- Si la Caja 2 cierra contando RD$ 1,700, el Inicio sigue mostrando RD$ 5,100, y la Caja 2 ya no puede cobrar en efectivo hasta abrir de nuevo.

Este ejemplo es la prueba `test/terminals.test.js`.

## 9. Flujo de dinero

Fuente: `reports.js` (`cashflow`).

- Suma el libro de dinero del período por concepto y por método.
- Entradas:
  - Ventas.
  - Abonos de clientes.
  - Otros ingresos.
  - Aportes del dueño (no son ganancia, DT-21).
  - Entradas a caja.
  - Reembolsos de compras anuladas.
  - Gastos anulados.
- Salidas:
  - Compras de mercancía y pagos a proveedores.
  - Gastos.
  - Devoluciones a clientes.
  - Retiros de caja.
  - Ventas anuladas.
  - Ingresos anulados.
- **Depósitos al banco:** no son entrada ni salida; el dinero cambia de lugar. Se muestran aparte y en **Por método de pago** (sale del efectivo y entra a transferencia).
- **Ejemplo:** con RD$ 1,000 en la caja, se depositan RD$ 400 al banco y el dueño retira RD$ 100. En la caja quedan **RD$ 500**. En el flujo, salió **RD$ 100** (el retiro); por método, el efectivo baja RD$ 500 y la transferencia sube RD$ 400. Es la prueba `test/o5.test.js`.

## 10. Períodos y fechas

- **Hoy:** la fecha local de la computadora.
- **Semana:** de lunes a domingo.
- **Mes:** del día 1 al último día del mes.
- **Año:** del 1 de enero al 31 de diciembre.
- **Rango:** las dos fechas elegidas, incluidas.
- Los gráficos van por día; si el período dura más de 62 días, van por mes.
- Montos: se redondean a 2 decimales.
- Fechas en pantalla: DD/MM/AAAA.

## 11. Usuarios y seguridad

Fuente: `src/core/api.js` y `users.js`.

- Cada operación del núcleo declara qué perfiles pueden usarla ([tabla de permisos](../manual/10-usuarios-y-permisos.md#101-los-dos-perfiles)). El permiso se comprueba en el núcleo, no solo en la pantalla.
- El vendedor nunca recibe costos ni ganancias: el núcleo los quita de las respuestas.
- **Contraseñas:**
  - Tienen un mínimo de 6 caracteres.
  - Se guardan cifradas con scrypt y una sal por usuario.
  - Si el administrador crea o restablece una contraseña, y con las contraseñas iniciales, se exige cambiarla al entrar. Lo exige el núcleo: hasta cambiarla, solo se puede leer la configuración y cambiar la contraseña, también desde otra PC.
  - Tras 5 intentos fallidos en un minuto, ese usuario queda bloqueado un minuto en esa computadora.
- **Código de recuperación** (RF-NUE-06): el administrador lo genera en Usuarios, escribiendo su contraseña. Tiene 16 caracteres, sirve **una vez** y solo se guarda su huella (scrypt). Con él, en la pantalla de entrada de la **PC principal**, un administrador activo pone una contraseña nueva; se cierran sus sesiones abiertas. Los intentos fallidos se limitan como los de la entrada.
- Un usuario desactivado pierde la sesión en su siguiente operación.
- El administrador no puede quitarse su propio rol ni desactivarse.
- El **historial** (`audit_log`) registra fecha, hora, usuario, acción y detalle de cada operación que cambia datos, además de los inicios de sesión. No se puede editar desde el programa.
