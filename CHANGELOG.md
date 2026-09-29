# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico ([cómo publicar](docs/tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).

## Sin publicar

## [1.7.0] - 2026-09-29

Productos con un formulario simple (marca, modelo, categoría y tallas) y actualizaciones sin ventanas de instalación. Se instala encima de la 1.6.1 o desde Configuración → Actualizaciones; la base pasa sola a la versión 10 sin perder datos.

### Agregado
- **Nuevo producto, más simple** (RF-NUE-22, DT-45, DT-46, [manual 4.2](docs/manual/04-inventario.md#42-crear-un-producto-administrador)): Nombre; Marca y Modelo; Categoría y Tallas; Costo y Precio detalle; Precio por mayor y Stock mínimo (empieza en 2); Notas.
  - **Marca**, **Modelo** y **Categoría** son listas que empiezan con pocas opciones (New Era, Mitchell & Ness, Goorin Bros., Nike, Adidas; 59FIFTY, 9FIFTY, 9FORTY, 39THIRTY, 9TWENTY; Fitted, Snapback, Trucker, Ajustable, Dad Hat). **+ Crear nueva marca**, **+ Crear nuevo modelo** y **+ Crear nueva categoría** la guardan, la dejan elegida y sale en los próximos productos. No se repiten: "new era" y "NEW  ERA" son la misma. El modelo no depende de la marca.
  - **Tallas** que se marcan con un clic (✓), cada una con su existencia debajo. Sin tallas, una sola **Existencia inicial**.
- **Editar producto** con todas sus tallas: marcar una talla nueva la agrega; quitarla la desactiva (con aviso si tiene existencia). **Editar esta variante** cambia solo una talla (SKU, código, costo, precios, talla, foto).
- **Al vender** un producto con varias tallas se elige la **talla**, viendo lo disponible de cada una; solo baja esa. También al apartar y al comprar.
- **Configuración → Catálogo de productos:** renombrar (cambia el nombre en los productos) y desactivar marcas, modelos, categorías y tallas.
- Un producto no puede tener dos veces la misma talla.
- La base pasa a la versión 10 al abrir: marcas, modelos, categorías y tallas pasan a sus propias listas con lo que ya estaba escrito en los productos. Los productos que tenían color lo conservan (se ve en su detalle, en la exportación y al vender).

### Cambiado
- **Las actualizaciones se instalan solas, sin ventanas de instalación** (DT-44). **Actualizar ahora** cierra el programa unos segundos y lo vuelve a abrir en la versión nueva; **Al cerrar el programa** la descarga mientras se trabaja y la instala cuando se cierra, por ejemplo al final del día. La barra de arriba dice **Versión X al cerrar**.

### Corregido
- **La rueda del mouse cambiaba los números** (precios, costo, stock, cantidades) si el cursor estaba dentro del campo. Ahora la página baja y el número queda igual.
- **Precios y costo con demasiados decimales** (1500.00000001) o negativos se rechazan: 2 decimales como máximo. El campo se marca en rojo al escribirlo.
- El aviso de versión nueva de la barra de arriba desaparecía al refrescar la caja, y podía quedar repetida la etiqueta de la caja.
- **Configuración → Actualizaciones → Buscar ahora** no mostraba nada mientras buscaba ni al terminar, y parecía que el programa se había trabado. Ahora dice "Buscando…" y un aviso indica si hay una versión nueva o no, con la hora de la última revisión.

## [1.6.1] - 2026-09-29

Excel con formato. Se instala encima de la 1.6.0 o desde Configuración → Actualizaciones; la base no cambia.

### Cambiado
- **Exportar guarda un Excel con formato** (.xlsx) en lugar de un CSV, en todas las listas, los reportes y el dashboard ejecutivo ([manual 9.6](docs/manual/09-contabilidad-y-reportes.md#96-exportar-a-excel), DT-43):
  - arriba, el nombre de la tienda, el título, el período, cuántos registros son y quién lo generó;
  - títulos de columnas en rojo, fijos al bajar y con filtros; filas alternadas;
  - montos con RD$ (negativos en rojo), fechas y porcentajes como números de Excel, y la fila de totales como en pantalla;
  - "Crédito" o "Por mayor" en vez de los códigos internos, y los SKU y códigos de barras sin perder ceros ni volverse 7.5E+12;
  - al imprimir, una hoja de ancho, títulos en cada página y número de página.
- En la ventana de guardar se puede elegir **CSV** como antes. En Configuración, la opción se llama ahora **Separador al guardar en CSV**.
- **Descargar plantilla** (Importar productos) da un Excel con los títulos y un ejemplo.
- **Importar** acepta un inventario exportado en Excel tal cual: se salta la franja del título y la fila de totales.

## [1.6.0] - 2026-09-29

Gestión avanzada ([O7](docs/producto/objetivos.md#o7-gestión-avanzada)): dashboard ejecutivo, inventario con colores, tallas y apartados, y CRM de clientes. Trae juntas las partes preparadas como 1.4 y 1.5, que no se publicaron por separado. La base pasa a la versión 8 al abrir: todas las PCs deben tener la 1.6.0 (actualice primero la PC principal).

### Agregado: dashboard ejecutivo
- **Dashboard ejecutivo** (Análisis): ventas netas, utilidad bruta y neta, margen, ticket promedio, cantidad de ventas, unidades vendidas y unidades por venta, cada uno comparado con el período anterior (ayer, mes anterior…) y con el año anterior. Un período en curso se compara hasta el mismo día.
- **Pronóstico de cierre de mes** según lo que se vende normalmente cada día de la semana, con la utilidad estimada y la comparación con el mes anterior y el mismo mes del año pasado.
- **Salud del inventario:** rotación, días de inventario y productos estancados (30 a 180 días sin venderse) con el dinero parado.
- **Utilidad por producto, marca, categoría y vendedor**, exportable a Excel.
- **Categoría** en el producto (Snapback, Trucker…), con sugerencias de las ya usadas; también en la importación desde Excel.

### Agregado: inventario avanzado
- **Modelos con colores y tallas**: "Nuevo producto" → **Varios colores y tallas** crea todas las combinaciones desde una cuadrícula, cada una con su SKU y su existencia inicial. **Inventario → Modelos** agrupa las variantes; el detalle muestra la existencia por color y talla, y permite agregar colores o tallas y editar el modelo completo (nombre, categoría y, si se quiere, precios). Los productos que ya tenía se agrupan solos por nombre, marca y modelo.
- **Apartados** (Principal → Apartados): reservar gorras para un cliente hasta una fecha. Lo apartado no se le vende a otro cliente; en el inventario y en la venta se ve la existencia, lo apartado y lo disponible. Desde el apartado se vende (con el cliente y las gorras ya puestos), se dan más días o se cancela con motivo. El Inicio avisa de los apartados vencidos. El vendedor también puede usarlos.
- **Conteo sugerido** (Inventario → Conteo): cada semana, la lista de lo que toca contar, primero lo que más se vende (A cada 7 días, B cada 30, C cada 90).
- Configuración: **Días que dura un apartado** y **Gorras por conteo cíclico**.

### Agregado: CRM de clientes
- **CRM de clientes**: la lista de Clientes muestra el segmento de cada cliente (nuevo, frecuente, ocasional, en riesgo, perdido o sin compras), cuántas compras hizo, el gasto total, el ticket promedio, la última compra y su cumpleaños, y se filtra por segmento, VIP y etiqueta.
- **Ficha del cliente**: gasto de 12 meses, cada cuántos días compra, lo que más compra (categorías, marcas, tallas y gorras), apartados activos y **notas de seguimiento** con fecha y usuario. El vendedor la ve sin costos ni utilidad.
- **Cliente VIP** automático por lo comprado en 12 meses (Configuración → Cliente VIP) o a mano (administrador). **Etiquetas** libres y **cumpleaños**.
- **Cumpleaños** de los próximos 30 días y **Copiar teléfonos** de la lista filtrada, para escribirles. El Inicio muestra los cumpleaños de la semana.

### Corregido
- Una ventana que se abre encima de otra (por ejemplo, el motivo al anular un abono desde la ficha del cliente) ya no pierde el cursor: la de abajo se lo quitaba si la de arriba se abría enseguida.
- **Esc** cierra la ventana abierta aunque haya aparecido un aviso mientras estaba abierta.

### Documentación
- La rama por defecto del repositorio ya es `main`: se quitó el aviso de pendiente en objetivos y en la guía de publicación.

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

[1.7.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.7.0
[1.6.1]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.6.1
[1.6.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.6.0
[1.3.1]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.3.1
[1.3.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.3.0
[1.2.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.2.0
[1.1.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.1.0
[1.0.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.0.0
