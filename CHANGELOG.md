# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico ([cómo publicar](docs/tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).

## Sin publicar

### Agregado
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

[1.0.0]: https://github.com/kelvinjose14/CS-SHOP/releases/tag/v1.0.0
