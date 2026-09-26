# Auditoría de producción (26/09/2026)

Revisión completa del sistema antes del piloto, hecha como si se entregara al cliente. Cada hallazgo se comprobó ejecutándolo:
- en la app real, con los datos de muestra;
- sobre una base de **3 años simulados** (19,710 ventas, `test/perf/generar.js`).

La sección **Estado** dice qué se corrigió y dónde está la prueba.

## Lo que se verificó y está bien

- **Interfaz y núcleo conectados:**
  - todas las operaciones que pide la interfaz existen y todas las del núcleo se usan;
  - lo que expone el puente de la interfaz (`preload`) tiene quien lo atienda;
  - ningún botón queda sin acción y no hay código a medio hacer.
- **Sin errores de consola:** las pruebas de interfaz recorren todas las pantallas y fallan ante cualquier error.
- **Base de datos:** integridad y claves foráneas correctas. Sobre los 3 años cuadran:
  - existencia con sus movimientos;
  - saldos con sus pagos;
  - totales de venta con sus líneas;
  - efectivo esperado de cada cierre.
  No hay existencias negativas.
- **Permisos:** se comprueban en el núcleo, para cada operación y cada perfil.
- **Validaciones:** cantidades, montos, métodos de pago, descuentos y precios del vendedor.
- **Red, copias, migración, rendimiento y exportación a PDF y CSV:** todo verificado.
- **Datos sensibles:** ningún secreto en el repositorio. El registro de errores no guarda contraseñas ni la clave de red.

## Errores que había que corregir antes de producción

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| 3.1 | Una venta al por mayor de un producto sin precio por mayor salía en **RD$ 0** (y al detalle, con productos viejos en 0) | Venta de total 0 que bajó la existencia | **Corregido (1.2.0):** la venta se rechaza con "… no tiene precio por mayor"; el administrador puede escribir el precio. `test/auditoria.test.js`, `test/ui/auditoria.test.js` |
| 3.2 | Los reportes largos se **cortaban sin avisar** (ventas a 5,000 filas, movimientos a 2,000, flujo e historial a 3,000, cierres a 500) y sus totales salían mal | Ventas de 2024: 5,000 de 6,588, total RD$ 24.7 M en vez de RD$ 32.6 M | **Corregido (1.2.0):** el núcleo devuelve todas las filas. La pantalla muestra las primeras 1,000 con aviso y **Mostrar todas**; totales, CSV, PDF e impresión usan todas. El reporte del año coincide con Contabilidad. El año (6,570 ventas) se pinta en 0.24 s |
| 3.3 | **Anular una compra no devolvía el costo promedio** | Costo 100 → compra a 500 → 300 → anular → seguía en 300 | **Corregido (1.2.0):** vuelve al costo de antes, o se quita lo que aportó la compra si otra lo cambió después ([Reglas, 1](../producto/reglas-de-negocio.md#1-costo-de-cada-gorra-costo-promedio)) |
| 3.4 | **No se podía corregir** un abono, un pago a proveedor ni una entrada, depósito o retiro de caja | Única salida: anular la venta completa | **Corregido (1.2.0):** anulación por el administrador con motivo y movimiento contrario (RF-NUE-11, DT-28) |

## Seguridad

| # | Hallazgo | Estado |
|---|---|---|
| 4.1 | **El vendedor veía el costo de cada venta** en el detalle de un cliente (`customers.get → sales[].cost_total`) | **Corregido (1.2.0).** Una prueba recorre ahora todas las respuestas del vendedor buscando costos y ganancias |
| 4.2 | El vendedor puede registrar un "depósito al banco" que nadie compara con el banco | Pendiente: reporte de depósitos por verificar |
| 4.3 | La base y las copias externas no van cifradas (una memoria USB perdida expone los datos) | Pendiente: cifrar la copia externa; BitLocker en la PC principal |
| 4.4 | Instalador y actualizaciones sin firma | Pendiente: certificado (DT-18), verificación en dos pasos en GitHub y proteger `main` |
| 4.5 | La ventana no bloquea la navegación fuera de la app | Pendiente (bajo) |
| 4.6 | Un nombre que empieza con `=` se ejecuta como fórmula al abrir el CSV en Excel | Pendiente (bajo) |
| 4.7 | Contraseñas de 6 caracteres; las fotos se leen por la red sin sesión (sí con la clave) | Pendiente (bajo) |

## Mejoras pendientes

| # | Hallazgo |
|---|---|
| 2.1 | Al abrir la caja con menos de lo contado en el último cierre, no se pide motivo |
| 2.2 | Un producto desactivado con existencia sale del valor del inventario |
| 2.3 | Se puede desactivar un cliente con deuda (también el vendedor) y venderle a crédito a un cliente desactivado |
| 2.4 | No hay límite de crédito ni aviso de deuda vencida al vender |
| 2.5 | Fechas imposibles (`2026-02-31`), gastos con fecha futura y vencimientos anteriores a la venta |
| 2.6 | Los textos largos se cortan sin avisar |
| 2.7 | Una compra a costo 0 baja el costo promedio sin pedir confirmación |
| 2.8 | El servidor acepta cualquier categoría de gasto |
| 2.9 | A 1,100 px de ancho, Gastos, Otros ingresos, Contabilidad y Caja se desbordan a lo ancho |
| 2.10 | El CSV usa comas: correcto con Windows en español de República Dominicana; con otra región, Excel lo muestra en una columna |
| 2.11 | La base no restringe los montos con `CHECK` (solo el núcleo los valida) |

## Funciones que no existen

- **ITBIS, NCF y RNC del negocio en el recibo.** Quedaron fuera por DT-06; conviene confirmarlo con el contador.
- **Recibo de abono.**
- **Devolución parcial a proveedor** y notas de crédito.
- **Apartados** y saldo a favor del cliente.
- **Límite de crédito.**
- **Factura en PDF o por WhatsApp.**
- **Uso desde celular o tablet** (DP-09).

## Pruebas pendientes (en la tienda)

- Windows 10/11 real, con el antivirus de la tienda.
- Impresora de tickets (58 y 80 mm) y lector de código de barras reales.
- Red y firewall de la tienda.
- Actualizar de 1.1.0 a 1.2.0.
- Restaurar la copia externa en otra PC.
- Cortar la luz a mitad de una venta.
- Revisar el CSV en el Excel del dueño.
- Probar con el hardware real de la tienda.

Todas están en el [plan del piloto](../piloto/README.md) y la [lista de aceptación](../piloto/aceptacion.md).
