# Requisitos

Especificación de lo que debe hacer CAPS Shop. Parte del pedido original del cliente (tienda de gorras, una sucursal, dos usuarios, sin facturación fiscal) y lo numera para poder aceptarlo punto por punto.

**Estados:**
- **Cumple**: hecho y verificado.
- **Parcial**: hecho con una limitación indicada.
- **Falta**: no está hecho.
- **Sin verificar**: no se ha medido.

Estado a la versión **1.0.0**, más lo terminado en los objetivos O2 (varias computadoras en red) y O3 (calidad para producción), aún sin publicar. Actualice este documento cada vez que cambie algo.

Las reglas exactas de cálculo están en [Reglas de negocio](reglas-de-negocio.md). El plan para lo que falta está en [Objetivos](objetivos.md).

## Resumen

| Área | Requisitos | Cumple | Parcial | Falta |
|---|---:|---:|---:|---:|
| Funcionales (pedido original) | 103 | 100 | 3 | 0 |
| No funcionales | 14 | 9 | 4 | 1 |
| Nuevos detectados (propuestos) | 9 | — | — | 9 |


> Lo funcional pedido está prácticamente completo. **Lo que separa al sistema de producción** es: instalador firmado, actualización automática, respaldos fuera de la PC y la prueba en la tienda con Windows 10/11 y datos reales (O4 y O6).

## 1. Requisitos funcionales

### Inventario (RF-INV)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-INV-01 | Registrar cada gorra con nombre, marca, modelo, color, talla, SKU, código de barras, foto, costo, precio al detalle, precio por mayor, cantidad y stock mínimo | Se crea un producto con los 13 datos y se ven en su detalle | Cumple | Inventario → Nuevo producto |
| RF-INV-02 | La existencia se actualiza sola con compras, ventas, devoluciones, ajustes, entradas y salidas | Cada operación cambia la existencia y deja un movimiento | Cumple | `common.changeStock` |
| RF-INV-03 | Mostrar la existencia actual | Columna Existencia en Inventario | Cumple | Inventario |
| RF-INV-04 | Mostrar productos agotados | Filtro Agotados, contador y lista Por reponer | Cumple | Inventario, Inicio |
| RF-INV-05 | Mostrar productos con poco stock | Filtro Stock bajo (existencia ≤ mínimo) | Cumple | Inventario, Inicio |
| RF-INV-06 | Valor total del inventario al costo | "Invertido en mercancía" = Σ existencia × costo | Cumple | Inventario, Inicio |
| RF-INV-07 | Valor estimado a precio de venta | "Valor a precio de venta" = Σ existencia × precio detalle | Cumple | Inventario |
| RF-INV-08 | Historial de movimientos de cada producto | El detalle del producto lista cada movimiento con fecha, tipo, cantidad y usuario | Cumple | Detalle de producto, Movimientos de inventario |

### Compras (RF-COM)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-COM-01 | Registrar compra con proveedor, fecha, productos, cantidades y costo unitario | La compra guarda todos los datos | Cumple | Compras → Nueva compra |
| RF-COM-02 | Total de la compra | Calculado automáticamente | Cumple | Nueva compra |
| RF-COM-03 | Método de pago | Efectivo, tarjeta, transferencia u otro | Cumple | Nueva compra |
| RF-COM-04 | Compra de contado o a crédito | Selector Contado / Crédito | Cumple | Nueva compra |
| RF-COM-05 | Monto pagado y balance pendiente | En crédito se indica lo pagado y se calcula el balance | Cumple | Nueva compra, Compras |
| RF-COM-06 | Al registrar una compra, el inventario aumenta | La existencia sube por la cantidad comprada | Cumple | `purchases.create` |

### Proveedores (RF-PRO)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-PRO-01 | Registrar nombre, teléfono, dirección y correo | Formulario de proveedor | Cumple | Proveedores |
| RF-PRO-02 | Balance pendiente | Suma de saldos de sus compras | Cumple | Proveedores |
| RF-PRO-03 | Historial de compras | Lista en el detalle del proveedor | Cumple | Detalle de proveedor |
| RF-PRO-04 | Historial de pagos | Lista en el detalle del proveedor | Cumple | Detalle de proveedor |

### Ventas (RF-VEN)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-VEN-01 | Venta al detalle | Tipo "Al detalle" usa el precio al detalle | Cumple | Nueva venta |
| RF-VEN-02 | Venta al por mayor | Tipo "Al por mayor" usa el precio por mayor | Cumple | Nueva venta |
| RF-VEN-03 | Precio diferente según el tipo de venta | Al cambiar el tipo, cambian todos los precios | Cumple | Nueva venta |
| RF-VEN-04 | Venta de contado | El pago cubre el total; calcula el cambio | Cumple | Nueva venta |
| RF-VEN-05 | Venta a crédito | Con cliente, abono inicial opcional y vencimiento | Cumple | Nueva venta |
| RF-VEN-06 | Descuentos | En monto o %, con límite para el vendedor | Cumple | Nueva venta |
| RF-VEN-07 | Diferentes métodos de pago | Varios métodos en la misma venta | Cumple | Nueva venta |
| RF-VEN-08 | Devoluciones | Parciales o totales, con reembolso o rebaja de deuda | Cumple | Ventas → Devolución |
| RF-VEN-09 | Anulación de ventas | Revierte inventario y dinero, con motivo | Cumple | Ventas → Anular venta |
| RF-VEN-10 | Cada venta afecta el inventario | La existencia baja por cada unidad vendida | Cumple | `sales.create` |

### Clientes y cuentas por cobrar (RF-CLI)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-CLI-01 | Registrar clientes | Formulario de cliente | Cumple | Clientes |
| RF-CLI-02 | Ventas a crédito | Ver RF-VEN-05 | Cumple | Nueva venta |
| RF-CLI-03 | Balance pendiente | Por cliente y por factura | Cumple | Cuentas por cobrar |
| RF-CLI-04 | Abonos | Abono a una factura o al cliente | Cumple | Cuentas por cobrar |
| RF-CLI-05 | Historial de pagos | Lista en el detalle del cliente | Cumple | Detalle de cliente |
| RF-CLI-06 | Fecha de vencimiento | Se fija al vender a crédito | Cumple | Nueva venta |
| RF-CLI-07 | Estado de la cuenta | Pendiente, parcial, pagado y marca de vencido | Cumple | Cuentas por cobrar |
| RF-CLI-08 | Pantalla de cuentas por cobrar con cliente, total vendido a crédito, total pagado, balance pendiente, vencimiento y estado | Las 6 columnas en la vista Por cliente | Cumple | Cuentas por cobrar |

### Cuentas por pagar (RF-CXP)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-CXP-01 | Proveedor | Columna Proveedor | Cumple | Cuentas por pagar |
| RF-CXP-02 | Total de la compra | Columna | Cumple | Cuentas por pagar |
| RF-CXP-03 | Monto pagado y balance pendiente | Columnas | Cumple | Cuentas por pagar |
| RF-CXP-04 | Fecha de vencimiento | Columna, con marca de vencido | Cumple | Cuentas por pagar |
| RF-CXP-05 | Historial de pagos | Detalle de la compra y del proveedor | Cumple | Compras, Proveedores |

### Gastos (RF-GAS)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-GAS-01 | Categorías: alquiler, transporte, publicidad, nómina, servicios, internet, delivery y otros | Las 8 categorías por defecto, editables | Cumple | Gastos, Configuración |
| RF-GAS-02 | Categoría, descripción, fecha, monto, método de pago y usuario que lo registró | Todos guardados y visibles | Cumple | Gastos |

### Caja (RF-CAJ)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-CAJ-01 | Efectivo inicial | Se indica al abrir | Cumple | Caja |
| RF-CAJ-02 | Ventas en efectivo | Línea en el resumen | Cumple | Caja |
| RF-CAJ-03 | Otros ingresos | Línea en el resumen | Cumple | Caja |
| RF-CAJ-04 | Gastos pagados en efectivo | Línea en el resumen | Cumple | Caja |
| RF-CAJ-05 | Retiros | Botón Retiro y línea en el resumen | Cumple | Caja |
| RF-CAJ-06 | Efectivo esperado | Calculado ([regla 8](reglas-de-negocio.md#8-caja)) | Cumple | Caja |
| RF-CAJ-07 | Efectivo real | Se indica al cerrar | Cumple | Cerrar caja |
| RF-CAJ-08 | Diferencia de caja | Real − esperado, con faltante o sobrante | Cumple | Cerrar caja, Historial de cierres |
| RF-CAJ-09 | Apertura y cierre | Abrir caja / Cerrar caja | Cumple | Caja |
| RF-CAJ-10 | Una caja por computadora (DT-14) | Cada PC abre, cobra en efectivo y cierra su propia caja; el administrador ve las cajas abiertas de todas y la PC de cada cierre | Cumple | Caja, Historial de cierres |

### Contabilidad y ganancias (RF-CON)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-CON-01 | Ingresos: ventas y otros ingresos | Líneas del estado de resultados | Cumple | Contabilidad |
| RF-CON-02 | Costo de los productos vendidos | Línea del estado de resultados | Cumple | Contabilidad |
| RF-CON-03 | Gastos operativos | Por categoría | Cumple | Contabilidad |
| RF-CON-04 | Ganancia bruta = ventas − costo | Coincide con la [regla 2](reglas-de-negocio.md#2-ganancia) | Cumple | Contabilidad |
| RF-CON-05 | Ganancia neta = bruta − gastos | Hoy también suma los otros ingresos (DP-05) | Cumple | Contabilidad |
| RF-CON-06 | Por día, semana, mes, año y rango personalizado | Selector de período | Cumple | Contabilidad |

### Flujo de dinero (RF-FLU)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-FLU-01 | Cuánto dinero entró | Total de entradas del período | Cumple | Flujo de dinero |
| RF-FLU-02 | Cuánto dinero salió | Total de salidas del período | **Parcial**: los depósitos al banco cuentan como salida (RF-NUE-02) | Flujo de dinero |
| RF-FLU-03 | Cuánto se vendió | Tarjeta Vendido | Cumple | Flujo de dinero |
| RF-FLU-04 | Cuánto se gastó | Tarjeta Gastado | Cumple | Flujo de dinero |
| RF-FLU-05 | Cuánto se compró en mercancía | Tarjeta Comprado en mercancía | Cumple | Flujo de dinero |
| RF-FLU-06 | Cuánto deben los clientes | Tarjeta | Cumple | Flujo de dinero, Inicio |
| RF-FLU-07 | Cuánto se debe a proveedores | Tarjeta | Cumple | Flujo de dinero, Inicio |
| RF-FLU-08 | Cuánto efectivo debería haber en caja | Tarjeta | Cumple | Flujo de dinero, Inicio, Caja |

### Dashboard (RF-DAS)

| ID | Requisito | Estado |
|---|---|---|
| RF-DAS-01 | Ventas de hoy | Cumple |
| RF-DAS-02 | Ventas del mes | Cumple |
| RF-DAS-03 | Ganancia bruta | Cumple |
| RF-DAS-04 | Ganancia neta | Cumple |
| RF-DAS-05 | Gastos del mes | Cumple |
| RF-DAS-06 | Compras del mes | Cumple |
| RF-DAS-07 | Cuentas por cobrar | Cumple |
| RF-DAS-08 | Cuentas por pagar | Cumple |
| RF-DAS-09 | Efectivo en caja (suma de las cajas de todas las computadoras) | Cumple |
| RF-DAS-10 | Valor del inventario | Cumple |
| RF-DAS-11 | Productos con stock bajo | Cumple |
| RF-DAS-12 | Productos agotados | Cumple |
| RF-DAS-13 | Productos más vendidos | Cumple |

Criterio de aceptación: todos visibles en **Inicio** para el administrador.

### Reportes (RF-REP)

| ID | Reporte | Estado |
|---|---|---|
| RF-REP-01 | Inventario actual | Cumple |
| RF-REP-02 | Valor del inventario | Cumple |
| RF-REP-03 | Movimientos de inventario | Cumple |
| RF-REP-04 | Compras | Cumple |
| RF-REP-05 | Ventas | Cumple |
| RF-REP-06 | Ventas al detalle | Cumple |
| RF-REP-07 | Ventas al por mayor | Cumple |
| RF-REP-08 | Ganancias | Cumple |
| RF-REP-09 | Gastos | Cumple |
| RF-REP-10 | Flujo de caja | Parcial (misma limitación que RF-FLU-02) |
| RF-REP-11 | Cuentas por cobrar | Cumple |
| RF-REP-12 | Cuentas por pagar | Cumple |
| RF-REP-13 | Clientes | Cumple |
| RF-REP-14 | Proveedores | Cumple |
| RF-REP-15 | Productos más vendidos | Cumple |

Criterio de aceptación: cada reporte se genera por período cuando aplica, y se exporta a CSV y PDF o se imprime.

### Usuarios (RF-USR)

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RF-USR-01 | Dos usuarios iniciales | Se entregan `admin` y `vendedor` | Cumple |
| RF-USR-02 | El administrador ve contabilidad, ganancias y costos; registra compras y gastos; ajusta inventario; ve reportes; administra usuarios | Todos accesibles con el perfil Administrador | Cumple |
| RF-USR-03 | El vendedor realiza ventas, consulta inventario, registra clientes y registra pagos de clientes según permisos | Accesible con el perfil Vendedor; abonos configurables | Cumple |
| RF-USR-04 | El vendedor no ve costos ni ganancias | El núcleo los quita de las respuestas | Cumple |

### Historial (RF-HIS)

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RF-HIS-01 | Registro de ventas, compras, gastos, pagos, abonos, ajustes, devoluciones, anulaciones y cambios de precio | Cada uno aparece en Historial de movimientos | Cumple (el detalle de gastos muestra claves en inglés, RF-NUE-08) |
| RF-HIS-02 | Fecha, hora, usuario y computadora en cada movimiento | Columnas del historial | Cumple |

### Entrega

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RF-ENT-01 | Instalador (Setup) descargable para instalar en otra computadora | `CAPS-Shop-Setup-1.0.0.exe` instala y abre el sistema en Windows | **Parcial**: se genera y publica en GitHub, pero no se ha probado en una PC con Windows real |
| RF-ENT-02 | El dueño responde rápido las 10 preguntas del resultado esperado | Tarjeta "Respuestas rápidas" en Inicio | Cumple |

## 2. Requisitos no funcionales

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RNF-01 | **Varias computadoras de la tienda en red, con los mismos datos** | Dos PCs registran ventas a la vez y ambas ven lo mismo al instante | Cumple: PC principal y PCs conectadas ([Red](../tecnico/red.md)). Probado en CI con 2 PCs y 40 ventas simultáneas, y a mano con dos instancias. Falta probarlo en la red real de la tienda (O6) |
| RNF-02 | Funciona sin internet | Todas las funciones sin conexión | Cumple |
| RNF-03 | Windows 10/11 de 64 bits | Instalación y uso verificados en Windows real | Parcial: el CI instala, usa, reinstala y desinstala el programa en Windows Server en cada cambio. Falta Windows 10/11 de escritorio (piloto, O6) |
| RNF-04 | Copias de seguridad automáticas | Una copia diaria, con las últimas 30 | Cumple (en el mismo disco) |
| RNF-05 | Copias fuera de la computadora | Copia automática a USB o nube, incluidas las fotos | Parcial: solo manual y sin fotos |
| RNF-06 | Seguridad de acceso | Contraseñas cifradas; permisos comprobados en el núcleo; recuperación del administrador | Parcial: falta la recuperación del administrador. El resto está revisado en [Seguridad](../tecnico/seguridad.md) |
| RNF-07 | Integridad de datos | Cada operación es atómica, queda en disco al confirmarse y no se abren dos instancias | Cumple (SQLite en modo WAL; una venta que se reintenta por la red no se duplica) |
| RNF-08 | Rendimiento con años de datos | Pantallas en menos de 1 s con 3 años de operación simulada | Cumple: con 19,710 ventas, lo más lento tarda 60 ms en el núcleo y 0.3 s en pantalla ([Rendimiento](../tecnico/rendimiento.md)) |
| RNF-09 | Instalador firmado | Windows no muestra la advertencia al instalar | Falta |
| RNF-10 | Actualizaciones | Instalar una versión nueva sin perder datos, idealmente automática | Parcial: instalar encima conserva los datos (lo prueba el CI en Windows); falta la actualización automática (O4) |
| RNF-11 | Diagnóstico de errores | Los errores quedan en un archivo de registro para el soporte | Cumple: registro de 14 días y **Guardar diagnóstico** en Configuración → Soporte |
| RNF-12 | Español y pesos dominicanos | Interfaz en español, formato RD$ | Cumple |
| RNF-13 | Pruebas automáticas | Lógica e interfaz probadas en cada cambio (CI) | Cumple: 40 pruebas de lógica, 7 de interfaz con la app real, rendimiento y el instalador, en Linux y Windows |
| RNF-14 | Documentación | Manual de uso, requisitos, reglas y documentación técnica | Cumple con este documento |

## 3. Requisitos nuevos detectados (propuestos)

Surgieron al revisar el sistema. Están **pendientes de aprobación** del cliente. Si se aprueban, pasan a [O5](objetivos.md#o5-brechas-funcionales).

| ID | Requisito | Motivo |
|---|---|---|
| RF-NUE-01 | Cargar saldos iniciales de clientes y proveedores | Al empezar a usar el sistema ya existen deudas |
| RF-NUE-02 | Separar "depósito al banco" de "retiro" en caja | Hoy el depósito cuenta como dinero que salió del negocio |
| RF-NUE-03 | Imprimir el recibo directo en la impresora de tickets de 80 mm | Hoy se abre la ventana de impresión en cada venta |
| RF-NUE-04 | Imprimir etiquetas de código de barras | Para productos que no traen código |
| RF-NUE-05 | Importar productos desde Excel | Carga inicial más rápida |
| RF-NUE-06 | Recuperar la contraseña del administrador | Hoy, sin otro administrador, no hay forma |
| RF-NUE-07 | Exigir el precio al detalle al crear un producto | Hoy, si se deja vacío, se guarda en 0 |
| RF-NUE-08 | Historial legible en todos los casos | Los gastos muestran claves en inglés |
| RF-NUE-09 | Incluir las fotos en la copia de seguridad | Hoy la copia `.db` no las incluye |

## 4. Fuera de alcance

- Facturación fiscal y comprobantes NCF: el recibo dice "Documento sin valor fiscal".
- Varias sucursales.
- Tienda en línea o ventas por internet.
- Nómina detallada: se registra como gasto.
- Conciliación bancaria.
