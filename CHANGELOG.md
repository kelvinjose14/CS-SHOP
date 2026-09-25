# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico ([cómo publicar](docs/tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).

## Sin publicar

### Agregado
- Documentación completa en `docs/`:
  - Manual de uso de 12 páginas con capturas.
  - Requisitos numerados con criterio de aceptación y estado.
  - Reglas de negocio con ejemplos comprobados.
  - Objetivos hacia producción y registro de decisiones.
  - Documentación técnica: arquitectura, modelo de datos, y desarrollo y publicación.
- Este archivo de cambios.

### Cambiado
- El README ahora es una presentación corta que enlaza a la documentación.

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
