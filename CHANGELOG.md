# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico ([cómo publicar](docs/tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).

## Sin publicar

## [1.3.1] - 2026-09-26

Corrección menor de la 1.3.0. Se instala encima o desde Configuración → Actualizaciones.

### Corregido
- Los mensajes del sistema escriben los montos como en pantalla, con el símbolo de la moneda y separador de miles ("RD$ 6,600.00" en vez de "6600.00"): crédito vencido o sobre el límite, costos por confirmar, apertura de caja, abonos y pagos.

## [1.3.0] - 2026-09-26

Controles de la [auditoría de producción](docs/tecnico/auditoria.md) (secciones 2 y 4). La base pasa a la versión 5 al abrir: todas las PCs deben tener la 1.3.0 (actualice primero la PC principal).

### Agregado
- **Depósitos por verificar** (Caja): el administrador compara cada depósito al banco con el estado de cuenta y lo marca **En el banco** o **No llegó**. Si no llegó, se descuenta del banco como dinero que salió del negocio. El Inicio avisa mientras haya depósitos sin revisar.
- **Límite de crédito** por cliente y control de **deuda vencida** al vender a crédito: el vendedor no puede seguir y el administrador autoriza la venta, que queda en el historial. Se puede apagar el control de deuda vencida en Configuración.
- **Copia externa con contraseña** (opcional): la copia de la memoria USB o la nube va cifrada; restaurarla pide la contraseña.
- **Formato del CSV** según la región de Windows de cada PC, o fijo desde Configuración (coma, o punto y coma con decimales con coma).
- Clientes: **Ver desactivados** en la lista, y lo vencido y el límite en el detalle.

### Cambiado
- Abrir la caja con otro monto que el contado en el último cierre **pide el motivo**; la diferencia queda en la caja y en los historiales.
- Solo el administrador desactiva o reactiva clientes, y no si deben. A un cliente desactivado no se le vende.
- Un producto desactivado con existencia **sigue contando** en el valor del inventario; al desactivarlo, la pantalla avisa.
- Una compra con costo 0, o menos de la mitad o más del doble del costo actual, **pide confirmación**.
- Los gastos y otros ingresos solo aceptan las categorías de Configuración.
- Las contraseñas nuevas piden **8 caracteres** como mínimo (las que ya existen siguen sirviendo).
- Las fotos se piden por la red con la sesión iniciada.

### Corregido
- Se aceptaban fechas que no existen (31 de febrero), gastos y compras con fecha futura y vencimientos anteriores a la venta.
- Los textos más largos que el máximo se cortaban sin avisar; ahora se rechazan con un mensaje.
- En la ventana más pequeña (1,100 px), Gastos, Otros ingresos, Contabilidad y Caja se salían de la pantalla.
- Un nombre que empieza con `=` se ejecutaba como fórmula al abrir el CSV en Excel.
- La ventana del programa no impedía navegar a otra página.

### Técnico
- Migración 5: `customers.credit_limit`, diferencia y motivo de apertura en `cash_sessions`, tabla `deposit_checks`, índices del libro de dinero y **reglas en la base** que rechazan montos y movimientos imposibles como segunda defensa.

## [1.2.0] - 2026-09-26

Para el piloto en la tienda (O6). Una PC con la 1.1.0 la ofrece al administrador en **Configuración → Actualizaciones**; con la 1.0.0, instálela encima.

### Agregado
- **Conteo de inventario** (Inventario → Conteo): se cuentan muchas gorras con el lector o a mano, con hoja de conteo imprimible, y se aplican todas las diferencias con un motivo. Lo vendido mientras se contaba no se ajusta; el conteo sin terminar se guarda en la PC.
- **Kit del piloto** en `docs/piloto/`: plan, capacitación con ejercicios comprobados, bitácora y lista de aceptación generada de los requisitos.
- Publicar una versión desde GitHub Actions (**Run workflow** con **Publicar**), sin crear la etiqueta a mano.
- **Anular un abono, un pago a proveedor o una entrada, depósito o retiro de caja** registrado por error (administrador, con motivo): se registra el movimiento contrario y queda en el historial.
- Registro de la [auditoría de producción](docs/tecnico/auditoria.md) con el estado de cada hallazgo.

### Corregido
- Una venta al por mayor de un producto sin precio por mayor salía en RD$ 0. Ahora se rechaza; el administrador puede escribir el precio en la venta.
- Los reportes largos (ventas, movimientos, flujo, historial, cierres) se cortaban sin avisar y sus totales salían mal. Ahora traen todas las filas: en pantalla se ven 1,000 con **Mostrar todas**, y los totales, el CSV y el PDF incluyen todas.
- Al anular una compra, el costo promedio de sus productos no volvía a como estaba.
- El vendedor recibía el costo de cada venta en el detalle de un cliente.

## [1.1.0] - 2026-09-26

Versión para el piloto en la tienda (O6). Incluye los objetivos O2 a O5. Una computadora con la 1.0.0 se actualiza instalando esta encima: los datos se conservan y se migran solos.

### Agregado
- **Saldos iniciales** de clientes y proveedores: lo que ya se debía al empezar. Se cobra o se paga con abonos, pero no cuenta como venta ni compra.
- **Depósito al banco** en Caja, separado del **Retiro**. El depósito no es salida del negocio en el Flujo de dinero. El vendedor deposita; solo el administrador retira.
- **Aportes del dueño** (Gastos → Aportes del dueño): entran al flujo de dinero, pero no suman a la ganancia.
- **Importar productos** desde Excel (.xlsx) o CSV, con plantilla, vista previa y errores por fila. Crea productos nuevos o actualiza por SKU.
- **Etiquetas de código de barras** (Code 128) de 50×25, 40×30 o 60×40 mm, con nombre, código y precio.
- **Impresora de recibos de cada PC**: el recibo sale directo, sin ventana, en papel de 80 o 58 mm, y opcionalmente al cobrar. Con **Imprimir prueba**.
- **Código de recuperación** del administrador: se genera en Usuarios y, en la PC principal, permite poner una contraseña nueva. Sirve una vez.
- **Copia fuera de esta computadora** (Configuración → Copias de seguridad):
  - diaria, con la base **y las fotos**, a una memoria USB o a la carpeta de OneDrive o Google Drive;
  - si la memoria no está conectada, se hace al conectarla;
  - el Inicio avisa al administrador si pasan 7 días sin copia.
  - Al restaurar una de estas copias, también vuelven las fotos.
- **Actualizaciones con aviso** desde GitHub Releases:
  - el programa avisa al administrador y este instala con un botón;
  - una PC conectada con otra versión que la principal se actualiza desde la pantalla de entrada.
- Guía **Soporte y recuperación** (manual 14): la PC principal se daña, cambiar de PC, versiones nuevas y pedir ayuda.
- El CI queda listo para firmar el instalador cuando haya certificado, y publica `latest.yml` para las actualizaciones.
- **Registro de errores** en `registros\` (14 días) y **Configuración → Soporte → Guardar diagnóstico**, un archivo para el soporte sin contraseñas ni la clave. También está en la pantalla de entrada de una PC conectada que no puede conectarse.
- **Pruebas automáticas en CI**, en Linux y en Windows:
  - interfaz con la app real: todas las pantallas, flujos principales, dos computadoras e instalación nueva;
  - rendimiento con 3 años de datos;
  - el instalador instalado de verdad, reinstalado encima y desinstalado sin perder datos.
- Pruebas de migración, de copias y restauración, y de permisos de todas las operaciones.
- Documentación de [seguridad](docs/tecnico/seguridad.md) y de [rendimiento](docs/tecnico/rendimiento.md).
- **Varias computadoras en red** ([manual](docs/manual/13-varias-computadoras.md), [diseño](docs/tecnico/red.md)):
  - Una PC principal guarda los datos y las demás se conectan a ella por la red local, sin internet.
  - Pantalla **Configurar esta computadora**: PC principal o conectada, con búsqueda automática en la red y clave de conexión.
  - **Configuración → Red:** compartir, clave de conexión y lista de computadoras (renombrar y desactivar).
  - **Una caja por computadora.** El administrador ve las cajas abiertas de todas; el Inicio suma el efectivo de todas.
  - El historial y los cierres de caja muestran la computadora.
  - Aviso **Sin conexión con la PC principal**, con reintento automático. Una operación reintentada no se duplica.
- Pruebas de migración desde 1.0.0, de caja por computadora y de red (40 ventas simultáneas desde dos PCs).
- Documentación completa en `docs/`:
  - Manual de uso de 13 páginas con capturas.
  - Requisitos numerados con criterio de aceptación y estado.
  - Reglas de negocio con ejemplos comprobados.
  - Objetivos hacia producción y registro de decisiones.
  - Documentación técnica: arquitectura, modelo de datos, y desarrollo y publicación.
- Este archivo de cambios.

### Cambiado
- **Migración 4:** saldos iniciales (`opening` en ventas y compras) y tabla de aportes del dueño.
- El precio al detalle es obligatorio al crear o editar un producto.
- El **Historial de movimientos** muestra todo en español (gastos, usuarios, configuración, computadoras, cambios de precio), también en los registros anteriores. La configuración guarda solo lo que cambió, con el antes y el después.
- La categoría "Aporte del dueño" ya no viene entre los otros ingresos.
- **La red entre computadoras va cifrada** con la clave de conexión (AES-256-GCM). La clave ya no viaja por la red. Las claves nuevas tienen 10 caracteres.
- **Migración 3:** índices de las tablas de detalle. Con 3 años de datos, la lista de ventas del año bajó de 16 s a 34 ms.
- El cambio de la contraseña inicial lo exige el núcleo: sin cambiarla no se puede operar, tampoco desde otra computadora.
- La PC principal limita los intentos de contraseña (5 por minuto por usuario), igual que por la red.
- Una base creada por una versión más nueva del programa no se abre, para no dañarla.
- Si falta el archivo de una foto, se muestra el ícono en lugar de una imagen rota.
- **Base de datos:** SQLite con `node:sqlite` en modo WAL, en lugar de sql.js. Cada operación escribe solo lo que cambió, en lugar de reescribir el archivo completo. La base de la 1.0.0 se abre y se actualiza sola, sin perder datos.
- Las copias de seguridad se hacen con `VACUUM INTO` (copia consistente) y solo en la PC principal.
- El README ahora es una presentación corta que enlaza a la documentación.

### Corregido
- Al abrir una ventana, el cursor saltaba al primer campo 30 ms después, aunque ya se estuviera escribiendo en otro: lo escrito caía en el campo equivocado. Lo encontró la prueba de interfaz de la devolución.
- Los avisos que dependen del código de error (sesión terminada, sin conexión) no llegaban a la pantalla: el código se perdía entre Electron y la interfaz.

## [1.0.0] - 2026-09-25

Primera versión. Funciona en una sola computadora ([límites](docs/tecnico/arquitectura.md#límites-actuales)).

### Agregado
- **Inventario:**
  - Productos con foto, SKU automático, código de barras, costo promedio, precios al detalle y por mayor, y stock mínimo.
  - Ajustes de existencia e historial de movimientos.
- **Compras:** de contado y a crédito. Proveedores y cuentas por pagar.
- **Punto de venta:**
  - Venta al detalle y por mayor, de contado y a crédito.
  - Descuentos, pagos mixtos y cambio.
  - Lector de código de barras y recibo.
  - Devoluciones y anulaciones.
- **Clientes:** cuentas por cobrar, abonos y vencimientos.
- **Gastos y otros ingresos:** por categoría.
- **Caja:** apertura, entradas, retiros, cierre con diferencia e historial.
- **Contabilidad:**
  - Estado de resultados por período y flujo de dinero.
  - Dashboard y 15 reportes exportables a CSV y PDF.
- **Usuarios:** perfiles Administrador y Vendedor, con permisos en el núcleo e historial de movimientos.
- **Respaldos:** automáticos diarios, manuales y restauración.
- **Instalador:** para Windows, generado por CI y publicado en GitHub Releases.

[1.3.1]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.3.1
[1.3.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.3.0
[1.2.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.2.0
[1.1.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.1.0
[1.0.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.0.0
