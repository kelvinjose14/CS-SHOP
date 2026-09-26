# Requisitos

Especificación de lo que debe hacer CAPS Shop. Parte del pedido original del cliente (tienda de gorras, una sucursal, dos usuarios, sin facturación fiscal) y lo numera para poder aceptarlo punto por punto.

**Estados:**
- **Cumple**: hecho y verificado.
- **Parcial**: hecho con una limitación indicada.
- **Falta**: no está hecho.
- **Sin verificar**: no se ha medido.

Estado a la versión **1.3.0**, que incluye los objetivos O2 (varias computadoras en red), O3 (calidad para producción), O4 (instalación y operación), O5 (brechas funcionales) lo preparado para el piloto (O6) y los controles de la [auditoría de producción](../tecnico/auditoria.md). Actualice este documento cada vez que cambie algo.

Las reglas exactas de cálculo están en [Reglas de negocio](reglas-de-negocio.md). El plan para lo que falta está en [Objetivos](objetivos.md).

## Resumen

| Área | Requisitos | Cumple | Parcial | Falta |
|---|---:|---:|---:|---:|
| Funcionales (pedido original) | 103 | 102 | 1 | 0 |
| No funcionales | 14 | 12 | 1 | 1 |
| Nuevos detectados (aprobados, DT-24, DT-25, DT-28, DT-30, DT-31 y DT-35) | 14 | 14 | 0 | 0 |


> Lo funcional pedido y los requisitos nuevos están completos. **Lo que separa al sistema de producción** es: el instalador firmado (falta el certificado, DT-18) y la prueba en la tienda con Windows 10/11 y datos reales (O6).

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
| RF-CAJ-01 | Efectivo inicial | Se indica al abrir. Si no es lo contado en el último cierre de esa PC, se pide el motivo (DT-29) | Cumple | Caja |
| RF-CAJ-02 | Ventas en efectivo | Línea en el resumen | Cumple | Caja |
| RF-CAJ-03 | Otros ingresos | Línea en el resumen | Cumple | Caja |
| RF-CAJ-04 | Gastos pagados en efectivo | Línea en el resumen | Cumple | Caja |
| RF-CAJ-05 | Retiros | Botón Retiro (solo el administrador) y línea en el resumen. El efectivo que va al banco se registra aparte como **Depósito al banco** (DT-22) | Cumple | Caja |
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
| RF-CON-05 | Ganancia neta = bruta − gastos + otros ingresos | Los aportes del dueño no suman: se registran aparte (DT-21) | Cumple | Contabilidad |
| RF-CON-06 | Por día, semana, mes, año y rango personalizado | Selector de período | Cumple | Contabilidad |

### Flujo de dinero (RF-FLU)

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-FLU-01 | Cuánto dinero entró | Total de entradas del período | Cumple | Flujo de dinero |
| RF-FLU-02 | Cuánto dinero salió | Total de salidas del período; un depósito al banco no es salida, solo cambia el dinero de lugar (DT-22) | Cumple | Flujo de dinero |
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
| RF-REP-10 | Flujo de caja | Cumple |
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
| RF-HIS-01 | Registro de ventas, compras, gastos, pagos, abonos, ajustes, devoluciones, anulaciones y cambios de precio | Cada uno aparece en Historial de movimientos, con el detalle en español | Cumple |
| RF-HIS-02 | Fecha, hora, usuario y computadora en cada movimiento | Columnas del historial | Cumple |

### Entrega

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RF-ENT-01 | Instalador (Setup) descargable para instalar en otra computadora | `CAPS-Shop-Setup-X.Y.Z.exe` instala y abre el sistema en Windows | **Parcial**: se publica en GitHub y el CI lo instala, usa y desinstala en Windows Server; falta una PC de la tienda con Windows 10/11 (O6) |
| RF-ENT-02 | El dueño responde rápido las 10 preguntas del resultado esperado | Tarjeta "Respuestas rápidas" en Inicio | Cumple |

## 2. Requisitos no funcionales

| ID | Requisito | Criterio de aceptación | Estado |
|---|---|---|---|
| RNF-01 | **Varias computadoras de la tienda en red, con los mismos datos** | Dos PCs registran ventas a la vez y ambas ven lo mismo al instante | Cumple: PC principal y PCs conectadas ([Red](../tecnico/red.md)). Probado en CI con 2 PCs y 40 ventas simultáneas, y a mano con dos instancias. Falta probarlo en la red real de la tienda (O6) |
| RNF-02 | Funciona sin internet | Todas las funciones sin conexión | Cumple |
| RNF-03 | Windows 10/11 de 64 bits | Instalación y uso verificados en Windows real | Parcial: el CI instala, usa, reinstala y desinstala el programa en Windows Server en cada cambio. Falta Windows 10/11 de escritorio (piloto, O6) |
| RNF-04 | Copias de seguridad automáticas | Una copia diaria, con las últimas 30 | Cumple (en el mismo disco) |
| RNF-05 | Copias fuera de la computadora | Copia automática a USB o nube, incluidas las fotos | Cumple: copia diaria con fotos a una memoria USB o carpeta de OneDrive o Google Drive, con aviso a los 7 días (DT-20) |
| RNF-06 | Seguridad de acceso | Contraseñas cifradas; permisos comprobados en el núcleo; recuperación del administrador | Cumple: contraseñas de 8 caracteres como mínimo y código de recuperación de un solo uso (RF-NUE-06). Revisado en [Seguridad](../tecnico/seguridad.md) y en la [auditoría](../tecnico/auditoria.md) |
| RNF-07 | Integridad de datos | Cada operación es atómica, queda en disco al confirmarse y no se abren dos instancias | Cumple (SQLite en modo WAL; una venta que se reintenta por la red no se duplica) |
| RNF-08 | Rendimiento con años de datos | Pantallas en menos de 1 s con 3 años de operación simulada | Cumple: con 19,710 ventas, lo más lento tarda 170 ms en el núcleo (flujo de dinero de 3 años) y 0.3 s en pantalla ([Rendimiento](../tecnico/rendimiento.md)) |
| RNF-09 | Instalador firmado | Windows no muestra la advertencia al instalar | Falta: el CI está listo para firmar, pero no se compró el certificado (DT-18) |
| RNF-10 | Actualizaciones | Instalar una versión nueva sin perder datos, idealmente automática | Cumple: busca sola y avisa; el administrador instala con un botón (DT-19). Instalar encima conserva los datos (lo prueba el CI) |
| RNF-11 | Diagnóstico de errores | Los errores quedan en un archivo de registro para el soporte | Cumple: registro de 14 días y **Guardar diagnóstico** en Configuración → Soporte |
| RNF-12 | Español y pesos dominicanos | Interfaz en español, formato RD$ | Cumple |
| RNF-13 | Pruebas automáticas | Lógica e interfaz probadas en cada cambio (CI) | Cumple: 82 pruebas de lógica, 17 de interfaz con la app real, rendimiento y el instalador, en Linux y Windows |
| RNF-14 | Documentación | Manual de uso, requisitos, reglas y documentación técnica | Cumple con este documento |

## 3. Requisitos nuevos detectados

Surgieron al revisar el sistema. RF-NUE-01 a 09 se aprobaron (DT-24) y se hicieron en [O5](objetivos.md#o5-brechas-funcionales), salvo RF-NUE-09, que se hizo en O4. RF-NUE-10 lo pidió el dueño para el piloto (DT-25, O6). RF-NUE-11 a 14 salieron de la [auditoría de producción](../tecnico/auditoria.md).

| ID | Requisito | Criterio de aceptación | Estado | Dónde |
|---|---|---|---|---|
| RF-NUE-01 | Cargar saldos iniciales de clientes y proveedores | El saldo se cobra o se paga con abonos y suma a las cuentas por cobrar o pagar, pero no cuenta como venta ni compra del período | Cumple | Detalle de cliente y de proveedor → **Saldo inicial** |
| RF-NUE-02 | Separar "depósito al banco" de "retiro" en caja | El depósito saca el efectivo de la caja sin ser salida del negocio; el retiro es solo del administrador (DT-22) | Cumple | Caja |
| RF-NUE-03 | Imprimir el recibo directo en la impresora de tickets | Con la impresora elegida, el recibo sale sin ventana, en papel de 58 u 80 mm, y opcionalmente al cobrar (DT-23) | Cumple (falta probarlo con la impresora real, O6) | Configuración → Impresora de recibos |
| RF-NUE-04 | Imprimir etiquetas de código de barras | Etiquetas Code 128 de 50×25, 40×30 o 60×40 mm con nombre, código y precio; el lector las reconoce | Cumple | Inventario → **Etiquetas** |
| RF-NUE-05 | Importar productos desde Excel | Lee .xlsx y CSV, muestra una vista previa con los errores por fila y crea o actualiza por SKU | Cumple | Inventario → **Importar** |
| RF-NUE-06 | Recuperar la contraseña del administrador | Código de un solo uso que se genera en Usuarios y se usa en la pantalla de entrada de la PC principal | Cumple | Usuarios, pantalla de entrada |
| RF-NUE-07 | Exigir el precio al detalle al crear un producto | Sin precio, o en 0, no se guarda (tampoco al importar) | Cumple | Inventario |
| RF-NUE-08 | Historial legible en todos los casos | Ningún detalle muestra claves en inglés, tampoco en los registros anteriores | Cumple | Historial de movimientos |
| RF-NUE-09 | Incluir las fotos en la copia de seguridad | La copia fuera de la PC lleva las fotos y restaurar las recupera | Cumple (O4) | Configuración → Copias de seguridad |
| RF-NUE-10 | Conteo de inventario de muchos productos a la vez (DT-25) | Hoja de conteo imprimible; se cuenta escribiendo o con el lector; se revisan las diferencias y se aplican todas con un motivo; lo vendido mientras se contaba no se ajusta | Cumple (O6) | Inventario → **Conteo** |
| RF-NUE-11 | Anular un abono, un pago a proveedor o un movimiento de caja registrado por error (auditoría 3.4, DT-28) | El administrador lo anula con motivo; la deuda vuelve a como estaba y el dinero con un movimiento contrario, en la caja del original. Queda en el historial | Cumple | Detalle de cliente, proveedor y venta; Caja |
| RF-NUE-12 | Revisar los depósitos al banco contra el estado de cuenta (auditoría 4.2, DT-30) | Cada depósito queda por verificar; el administrador lo marca **En el banco** o **No llegó** (se descuenta del banco y queda como salida del negocio). El Inicio avisa mientras haya pendientes | Cumple (1.3.0) | Caja → **Depósitos por verificar** |
| RF-NUE-13 | Límite de crédito y deuda vencida (auditoría 2.3 y 2.4, DT-31) | Límite por cliente (0 = sin límite); una venta a crédito que lo pasa, o a quien tiene deuda vencida, la detiene el sistema: el vendedor no sigue y el administrador la autoriza. Solo el administrador desactiva clientes, y no si deben | Cumple (1.3.0) | Clientes, Nueva venta, Configuración |
| RF-NUE-14 | Copia externa protegida con contraseña (auditoría 4.3, DT-35) | Opcional. Con contraseña, la copia de la memoria va cifrada, las copias sin cifrar se borran y restaurar pide la contraseña | Cumple (1.3.0) | Configuración → Copias de seguridad |

## 4. Fuera de alcance

- Facturación fiscal y comprobantes NCF: el recibo dice "Documento sin valor fiscal".
- Varias sucursales.
- Tienda en línea o ventas por internet.
- Nómina detallada: se registra como gasto.
- Conciliación bancaria.
