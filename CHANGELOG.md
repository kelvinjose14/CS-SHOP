# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico ([cómo publicar](docs/tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).

## Sin publicar

### Agregado
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
