# Lista de aceptación

Cada requisito de [Requisitos](../producto/requisitos.md) se verifica **en la tienda, con datos reales**, durante el piloto ([Plan del piloto](README.md)). Son **128 requisitos**. Generada el 26/09/2026 con `node scripts/lista-aceptacion.js`: no la edite a mano.

**Cómo se llena:**
1. Imprímala (desde GitHub: botón **Raw** y luego imprimir, o abra el archivo en el navegador).
2. Durante la semana del piloto, el dueño prueba cada punto con la columna **Cómo se verifica**. Marque **Sí** si funciona como dice, o **No** y escriba qué pasó en **Observaciones**.
3. Lo marcado **No** se anota también en la [bitácora](bitacora.md). Se corrige, se publica la corrección y se vuelve a verificar.
4. Al final se firma el acta de la última página.

## Inventario (RF-INV)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-INV-01 | Registrar cada gorra con nombre, marca, modelo, color, talla, SKU, código de barras, foto, costo, precio al detalle, precio por mayor, cantidad y stock mínimo | Se crea un producto con los 13 datos y se ven en su detalle. Dónde: Inventario → Nuevo producto | ☐ | ☐ | |
| RF-INV-02 | La existencia se actualiza sola con compras, ventas, devoluciones, ajustes, entradas y salidas | Venda, compre, devuelva y ajuste una gorra: cada vez cambia la existencia y aparece en su historial | ☐ | ☐ | |
| RF-INV-03 | Mostrar la existencia actual | Columna Existencia en Inventario. Dónde: Inventario | ☐ | ☐ | |
| RF-INV-04 | Mostrar productos agotados | Filtro Agotados, contador y lista Por reponer. Dónde: Inventario, Inicio | ☐ | ☐ | |
| RF-INV-05 | Mostrar productos con poco stock | Filtro Stock bajo (existencia ≤ mínimo). Dónde: Inventario, Inicio | ☐ | ☐ | |
| RF-INV-06 | Valor total del inventario al costo | "Invertido en mercancía" = Σ existencia × costo. Dónde: Inventario, Inicio | ☐ | ☐ | |
| RF-INV-07 | Valor estimado a precio de venta | "Valor a precio de venta" = Σ existencia × precio detalle. Dónde: Inventario | ☐ | ☐ | |
| RF-INV-08 | Historial de movimientos de cada producto | El detalle del producto lista cada movimiento con fecha, tipo, cantidad y usuario. Dónde: Detalle de producto, Movimientos de inventario | ☐ | ☐ | |

## Compras (RF-COM)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-COM-01 | Registrar compra con proveedor, fecha, productos, cantidades y costo unitario | La compra guarda todos los datos. Dónde: Compras → Nueva compra | ☐ | ☐ | |
| RF-COM-02 | Total de la compra | Calculado automáticamente. Dónde: Nueva compra | ☐ | ☐ | |
| RF-COM-03 | Método de pago | Efectivo, tarjeta, transferencia u otro. Dónde: Nueva compra | ☐ | ☐ | |
| RF-COM-04 | Compra de contado o a crédito | Selector Contado / Crédito. Dónde: Nueva compra | ☐ | ☐ | |
| RF-COM-05 | Monto pagado y balance pendiente | En crédito se indica lo pagado y se calcula el balance. Dónde: Nueva compra, Compras | ☐ | ☐ | |
| RF-COM-06 | Al registrar una compra, el inventario aumenta | Registre una compra: la existencia de esas gorras sube en la cantidad comprada | ☐ | ☐ | |

## Proveedores (RF-PRO)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-PRO-01 | Registrar nombre, teléfono, dirección y correo | Formulario de proveedor. Dónde: Proveedores | ☐ | ☐ | |
| RF-PRO-02 | Balance pendiente | Suma de saldos de sus compras. Dónde: Proveedores | ☐ | ☐ | |
| RF-PRO-03 | Historial de compras | Lista en el detalle del proveedor. Dónde: Detalle de proveedor | ☐ | ☐ | |
| RF-PRO-04 | Historial de pagos | Lista en el detalle del proveedor. Dónde: Detalle de proveedor | ☐ | ☐ | |

## Ventas (RF-VEN)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-VEN-01 | Venta al detalle | Tipo "Al detalle" usa el precio al detalle. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-02 | Venta al por mayor | Tipo "Al por mayor" usa el precio por mayor. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-03 | Precio diferente según el tipo de venta | Al cambiar el tipo, cambian todos los precios. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-04 | Venta de contado | El pago cubre el total; calcula el cambio. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-05 | Venta a crédito | Con cliente, abono inicial opcional y vencimiento. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-06 | Descuentos | En monto o %, con límite para el vendedor. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-07 | Diferentes métodos de pago | Varios métodos en la misma venta. Dónde: Nueva venta | ☐ | ☐ | |
| RF-VEN-08 | Devoluciones | Parciales o totales, con reembolso o rebaja de deuda. Dónde: Ventas → Devolución | ☐ | ☐ | |
| RF-VEN-09 | Anulación de ventas | Revierte inventario y dinero, con motivo. Dónde: Ventas → Anular venta | ☐ | ☐ | |
| RF-VEN-10 | Cada venta afecta el inventario | La existencia baja por cada unidad vendida | ☐ | ☐ | |

## Clientes y cuentas por cobrar (RF-CLI)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-CLI-01 | Registrar clientes | Formulario de cliente. Dónde: Clientes | ☐ | ☐ | |
| RF-CLI-02 | Ventas a crédito | Ver RF-VEN-05. Dónde: Nueva venta | ☐ | ☐ | |
| RF-CLI-03 | Balance pendiente | Por cliente y por factura. Dónde: Cuentas por cobrar | ☐ | ☐ | |
| RF-CLI-04 | Abonos | Abono a una factura o al cliente. Dónde: Cuentas por cobrar | ☐ | ☐ | |
| RF-CLI-05 | Historial de pagos | Lista en el detalle del cliente. Dónde: Detalle de cliente | ☐ | ☐ | |
| RF-CLI-06 | Fecha de vencimiento | Se fija al vender a crédito. Dónde: Nueva venta | ☐ | ☐ | |
| RF-CLI-07 | Estado de la cuenta | Pendiente, parcial, pagado y marca de vencido. Dónde: Cuentas por cobrar | ☐ | ☐ | |
| RF-CLI-08 | Pantalla de cuentas por cobrar con cliente, total vendido a crédito, total pagado, balance pendiente, vencimiento y estado | Las 6 columnas en la vista Por cliente. Dónde: Cuentas por cobrar | ☐ | ☐ | |

## Cuentas por pagar (RF-CXP)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-CXP-01 | Proveedor | Columna Proveedor. Dónde: Cuentas por pagar | ☐ | ☐ | |
| RF-CXP-02 | Total de la compra | Columna. Dónde: Cuentas por pagar | ☐ | ☐ | |
| RF-CXP-03 | Monto pagado y balance pendiente | Columnas. Dónde: Cuentas por pagar | ☐ | ☐ | |
| RF-CXP-04 | Fecha de vencimiento | Columna, con marca de vencido. Dónde: Cuentas por pagar | ☐ | ☐ | |
| RF-CXP-05 | Historial de pagos | Detalle de la compra y del proveedor. Dónde: Compras, Proveedores | ☐ | ☐ | |

## Gastos (RF-GAS)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-GAS-01 | Categorías: alquiler, transporte, publicidad, nómina, servicios, internet, delivery y otros | Las 8 categorías por defecto, editables. Dónde: Gastos, Configuración | ☐ | ☐ | |
| RF-GAS-02 | Categoría, descripción, fecha, monto, método de pago y usuario que lo registró | Todos guardados y visibles. Dónde: Gastos | ☐ | ☐ | |

## Caja (RF-CAJ)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-CAJ-01 | Efectivo inicial | Se indica al abrir. Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-02 | Ventas en efectivo | Línea en el resumen. Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-03 | Otros ingresos | Línea en el resumen. Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-04 | Gastos pagados en efectivo | Línea en el resumen. Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-05 | Retiros | Botón Retiro (solo el administrador) y línea en el resumen. El efectivo que va al banco se registra aparte como Depósito al banco (DT-22). Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-06 | Efectivo esperado | Calculado (regla 8). Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-07 | Efectivo real | Se indica al cerrar. Dónde: Cerrar caja | ☐ | ☐ | |
| RF-CAJ-08 | Diferencia de caja | Real − esperado, con faltante o sobrante. Dónde: Cerrar caja, Historial de cierres | ☐ | ☐ | |
| RF-CAJ-09 | Apertura y cierre | Abrir caja / Cerrar caja. Dónde: Caja | ☐ | ☐ | |
| RF-CAJ-10 | Una caja por computadora (DT-14) | Cada PC abre, cobra en efectivo y cierra su propia caja; el administrador ve las cajas abiertas de todas y la PC de cada cierre. Dónde: Caja, Historial de cierres | ☐ | ☐ | |

## Contabilidad y ganancias (RF-CON)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-CON-01 | Ingresos: ventas y otros ingresos | Líneas del estado de resultados. Dónde: Contabilidad | ☐ | ☐ | |
| RF-CON-02 | Costo de los productos vendidos | Línea del estado de resultados. Dónde: Contabilidad | ☐ | ☐ | |
| RF-CON-03 | Gastos operativos | Por categoría. Dónde: Contabilidad | ☐ | ☐ | |
| RF-CON-04 | Ganancia bruta = ventas − costo | Coincide con la regla 2. Dónde: Contabilidad | ☐ | ☐ | |
| RF-CON-05 | Ganancia neta = bruta − gastos + otros ingresos | Los aportes del dueño no suman: se registran aparte (DT-21). Dónde: Contabilidad | ☐ | ☐ | |
| RF-CON-06 | Por día, semana, mes, año y rango personalizado | Selector de período. Dónde: Contabilidad | ☐ | ☐ | |

## Flujo de dinero (RF-FLU)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-FLU-01 | Cuánto dinero entró | Total de entradas del período. Dónde: Flujo de dinero | ☐ | ☐ | |
| RF-FLU-02 | Cuánto dinero salió | Total de salidas del período; un depósito al banco no es salida, solo cambia el dinero de lugar (DT-22). Dónde: Flujo de dinero | ☐ | ☐ | |
| RF-FLU-03 | Cuánto se vendió | Tarjeta Vendido. Dónde: Flujo de dinero | ☐ | ☐ | |
| RF-FLU-04 | Cuánto se gastó | Tarjeta Gastado. Dónde: Flujo de dinero | ☐ | ☐ | |
| RF-FLU-05 | Cuánto se compró en mercancía | Tarjeta Comprado en mercancía. Dónde: Flujo de dinero | ☐ | ☐ | |
| RF-FLU-06 | Cuánto deben los clientes | Tarjeta. Dónde: Flujo de dinero, Inicio | ☐ | ☐ | |
| RF-FLU-07 | Cuánto se debe a proveedores | Tarjeta. Dónde: Flujo de dinero, Inicio | ☐ | ☐ | |
| RF-FLU-08 | Cuánto efectivo debería haber en caja | Tarjeta. Dónde: Flujo de dinero, Inicio, Caja | ☐ | ☐ | |

## Dashboard (RF-DAS)

Cómo se verifica (todos): todos visibles en Inicio para el administrador.

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-DAS-01 | Ventas de hoy |  | ☐ | ☐ | |
| RF-DAS-02 | Ventas del mes |  | ☐ | ☐ | |
| RF-DAS-03 | Ganancia bruta |  | ☐ | ☐ | |
| RF-DAS-04 | Ganancia neta |  | ☐ | ☐ | |
| RF-DAS-05 | Gastos del mes |  | ☐ | ☐ | |
| RF-DAS-06 | Compras del mes |  | ☐ | ☐ | |
| RF-DAS-07 | Cuentas por cobrar |  | ☐ | ☐ | |
| RF-DAS-08 | Cuentas por pagar |  | ☐ | ☐ | |
| RF-DAS-09 | Efectivo en caja (suma de las cajas de todas las computadoras) |  | ☐ | ☐ | |
| RF-DAS-10 | Valor del inventario |  | ☐ | ☐ | |
| RF-DAS-11 | Productos con stock bajo |  | ☐ | ☐ | |
| RF-DAS-12 | Productos agotados |  | ☐ | ☐ | |
| RF-DAS-13 | Productos más vendidos |  | ☐ | ☐ | |

## Reportes (RF-REP)

Cómo se verifica (todos): cada reporte se genera por período cuando aplica, y se exporta a CSV y PDF o se imprime.

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-REP-01 | Inventario actual |  | ☐ | ☐ | |
| RF-REP-02 | Valor del inventario |  | ☐ | ☐ | |
| RF-REP-03 | Movimientos de inventario |  | ☐ | ☐ | |
| RF-REP-04 | Compras |  | ☐ | ☐ | |
| RF-REP-05 | Ventas |  | ☐ | ☐ | |
| RF-REP-06 | Ventas al detalle |  | ☐ | ☐ | |
| RF-REP-07 | Ventas al por mayor |  | ☐ | ☐ | |
| RF-REP-08 | Ganancias |  | ☐ | ☐ | |
| RF-REP-09 | Gastos |  | ☐ | ☐ | |
| RF-REP-10 | Flujo de caja |  | ☐ | ☐ | |
| RF-REP-11 | Cuentas por cobrar |  | ☐ | ☐ | |
| RF-REP-12 | Cuentas por pagar |  | ☐ | ☐ | |
| RF-REP-13 | Clientes |  | ☐ | ☐ | |
| RF-REP-14 | Proveedores |  | ☐ | ☐ | |
| RF-REP-15 | Productos más vendidos |  | ☐ | ☐ | |

## Usuarios (RF-USR)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-USR-01 | Dos usuarios iniciales | Se entregan `admin` y `vendedor` | ☐ | ☐ | |
| RF-USR-02 | El administrador ve contabilidad, ganancias y costos; registra compras y gastos; ajusta inventario; ve reportes; administra usuarios | Todos accesibles con el perfil Administrador | ☐ | ☐ | |
| RF-USR-03 | El vendedor realiza ventas, consulta inventario, registra clientes y registra pagos de clientes según permisos | Accesible con el perfil Vendedor; abonos configurables | ☐ | ☐ | |
| RF-USR-04 | El vendedor no ve costos ni ganancias | El núcleo los quita de las respuestas | ☐ | ☐ | |

## Historial (RF-HIS)

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-HIS-01 | Registro de ventas, compras, gastos, pagos, abonos, ajustes, devoluciones, anulaciones y cambios de precio | Cada uno aparece en Historial de movimientos, con el detalle en español | ☐ | ☐ | |
| RF-HIS-02 | Fecha, hora, usuario y computadora en cada movimiento | Columnas del historial | ☐ | ☐ | |

## Entrega

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-ENT-01 | Instalador (Setup) descargable para instalar en otra computadora | `CAPS-Shop-Setup-X.Y.Z.exe` instala y abre el sistema en Windows | ☐ | ☐ | |
| RF-ENT-02 | El dueño responde rápido las 10 preguntas del resultado esperado | Tarjeta "Respuestas rápidas" en Inicio | ☐ | ☐ | |

## Requisitos no funcionales

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RNF-01 | Varias computadoras de la tienda en red, con los mismos datos | Dos computadoras venden a la vez y las dos ven la misma existencia y las mismas ventas | ☐ | ☐ | |
| RNF-02 | Funciona sin internet | Con el internet desconectado (el router encendido), se vende, se compra y se cierra la caja | ☐ | ☐ | |
| RNF-03 | Windows 10/11 de 64 bits | El programa se instala y funciona en cada PC de la tienda (anote la versión de Windows) | ☐ | ☐ | |
| RNF-04 | Copias de seguridad automáticas | Una copia diaria, con las últimas 30 | ☐ | ☐ | |
| RNF-05 | Copias fuera de la computadora | Copia automática a USB o nube, incluidas las fotos | ☐ | ☐ | |
| RNF-06 | Seguridad de acceso | Contraseñas cifradas; permisos comprobados en el núcleo; recuperación del administrador | ☐ | ☐ | |
| RNF-07 | Integridad de datos | Apagar una PC conectada a mitad de una venta no deja la venta a medias. El resto lo verifican las pruebas automáticas en cada versión | ☐ | ☐ | |
| RNF-08 | Rendimiento con años de datos | Con los datos reales, las pantallas abren en menos de 1 segundo | ☐ | ☐ | |
| RNF-09 | Instalador firmado | Al instalar, Windows no muestra "Windows protegió su PC". Depende de comprar el certificado (DT-18) | ☐ | ☐ | |
| RNF-10 | Actualizaciones | Instalar una versión nueva sin perder datos, idealmente automática | ☐ | ☐ | |
| RNF-11 | Diagnóstico de errores | Los errores quedan en un archivo de registro para el soporte | ☐ | ☐ | |
| RNF-12 | Español y pesos dominicanos | Interfaz en español, formato RD$ | ☐ | ☐ | |
| RNF-13 | Pruebas automáticas | Lo verifica el responsable del sistema: cada versión publicada pasó el CI en verde | ☐ | ☐ | |
| RNF-14 | Documentación | El dueño tiene el manual y lo usó en la capacitación | ☐ | ☐ | |

## Requisitos nuevos detectados

| ID | Requisito | Cómo se verifica | Sí | No | Observaciones |
|---|---|---|:-:|:-:|---|
| RF-NUE-01 | Cargar saldos iniciales de clientes y proveedores | El saldo se cobra o se paga con abonos y suma a las cuentas por cobrar o pagar, pero no cuenta como venta ni compra del período. Dónde: Detalle de cliente y de proveedor → Saldo inicial | ☐ | ☐ | |
| RF-NUE-02 | Separar "depósito al banco" de "retiro" en caja | El depósito saca el efectivo de la caja sin ser salida del negocio; el retiro es solo del administrador (DT-22). Dónde: Caja | ☐ | ☐ | |
| RF-NUE-03 | Imprimir el recibo directo en la impresora de tickets | Con la impresora elegida, el recibo sale sin ventana, en papel de 58 u 80 mm, y opcionalmente al cobrar (DT-23). Dónde: Configuración → Impresora de recibos | ☐ | ☐ | |
| RF-NUE-04 | Imprimir etiquetas de código de barras | Etiquetas Code 128 de 50×25, 40×30 o 60×40 mm con nombre, código y precio; el lector las reconoce. Dónde: Inventario → Etiquetas | ☐ | ☐ | |
| RF-NUE-05 | Importar productos desde Excel | Lee .xlsx y CSV, muestra una vista previa con los errores por fila y crea o actualiza por SKU. Dónde: Inventario → Importar | ☐ | ☐ | |
| RF-NUE-06 | Recuperar la contraseña del administrador | Código de un solo uso que se genera en Usuarios y se usa en la pantalla de entrada de la PC principal. Dónde: Usuarios, pantalla de entrada | ☐ | ☐ | |
| RF-NUE-07 | Exigir el precio al detalle al crear un producto | Sin precio, o en 0, no se guarda (tampoco al importar). Dónde: Inventario | ☐ | ☐ | |
| RF-NUE-08 | Historial legible en todos los casos | Ningún detalle muestra claves en inglés, tampoco en los registros anteriores. Dónde: Historial de movimientos | ☐ | ☐ | |
| RF-NUE-09 | Incluir las fotos en la copia de seguridad | La copia fuera de la PC lleva las fotos y restaurar las recupera. Dónde: Configuración → Copias de seguridad | ☐ | ☐ | |
| RF-NUE-10 | Conteo de inventario de muchos productos a la vez (DT-25) | Hoja de conteo imprimible; se cuenta escribiendo o con el lector; se revisan las diferencias y se aplican todas con un motivo; lo vendido mientras se contaba no se ajusta. Dónde: Inventario → Conteo | ☐ | ☐ | |
| RF-NUE-11 | Anular un abono, un pago a proveedor o un movimiento de caja registrado por error (auditoría 3.4, DT-28) | El administrador lo anula con motivo; la deuda vuelve a como estaba y el dinero con un movimiento contrario, en la caja del original. Queda en el historial. Dónde: Detalle de cliente, proveedor y venta; Caja | ☐ | ☐ | |

## Acta de aceptación

Requisitos verificados: ______ de 128. Con observaciones pendientes: ______.

Con esta firma, el cliente declara que usó CAPS Shop en la tienda con datos reales durante el piloto, que los requisitos marcados **Sí** funcionan como se describe, y acepta el sistema para uso en producción. Las observaciones pendientes quedan anotadas arriba y en la bitácora, con su compromiso de corrección.

| | Cliente (dueño de CAPS._.SHOP) | Responsable del sistema |
|---|---|---|
| Nombre | | |
| Firma | | |
| Fecha | | |
| Versión instalada | | |

Al firmarse, se publica la versión **2.0.0** ([Objetivos, O6](../producto/objetivos.md#o6-piloto-en-tienda-y-aceptación)).
