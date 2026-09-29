# Rendimiento

Requisito **RNF-08**: cada pantalla responde en menos de 1 segundo con 3 años de operación.

## Cómo se mide

```bash
npm run test:perf
```

1. **Base de prueba:** `test/perf/generar.js` la crea la primera vez (tarda alrededor de un minuto) y la reutiliza después. Usa la API real, con las mismas reglas que la aplicación, y un reloj simulado que avanza día por día:

   | Dato | Cantidad |
   |---|---|
   | Días de tienda | 1,095 (3 años), con apertura y cierre de caja cada día |
   | Ventas | 19,710, con 58,708 líneas: detalle y mayor, contado y crédito, efectivo y tarjeta |
   | Productos | 150 |
   | Clientes | 400, con créditos y abonos |
   | Compras | 768, reponiendo cuando baja la existencia |
   | Gastos | 731 (diarios y alquiler mensual) |
   | Devoluciones | 188 |

2. **Medición:** `test/perf/medir.js` trabaja sobre una copia de esa base. Ejecuta 3 veces cada consulta que usan las pantallas y toma la peor. **Falla si alguna pasa de 1 s.**
3. **Límite en CI:** el límite se cambia con `CAPSSHOP_PERF_LIMIT` (en ms). CI la corre en Linux en cada pull request.

## Resultados (25/09/2026)

Núcleo, en milisegundos, peor de 3 intentos:

| Pantalla u operación | Antes de la migración 3 | Con la migración 3 |
|---|---:|---:|
| **Ventas (mes)** | **1,458** | 2.7 |
| **Ventas (año)** | **16,695** | 33.7 |
| **Ventas (todas)** | **15,912** | 27.4 |
| Inicio (administrador / vendedor) | 17.6 / 12.3 | 8.2 / 5.7 |
| Inventario | 1.4 | 1.6 |
| Clientes / cliente con más compras | 15.5 / 17.3 | 16.2 / 16.6 |
| Contabilidad (3 años) | 17.7 | 21.4 |
| Flujo de dinero (3 años) | 59.6 | 59.6 |
| Más vendidos (3 años) | 57.8 | 60.0 |
| Historial de movimientos (3 años) | 4.2 | 5.3 |
| Registrar una venta | 3.0 | 1.9 |

**Hallazgo:** la lista de ventas calcula, para cada venta, las unidades y los métodos de pago. Sin índice en `sale_items(sale_id)` ni en `sale_payments(sale_id)`, cada fila recorría las tablas completas. La **migración 3** agrega esos índices y los de las demás tablas de detalle ([modelo de datos](modelo-de-datos.md)). Se aplica sola al abrir la base.

**Interfaz completa**, con la aplicación real y la misma base, del clic a la pantalla terminada:

| Pantalla | Tiempo |
|---|---|
| Inventario movimientos | 314 ms |
| Caja | 241 ms (500 cierres) |
| Historial de movimientos (año) | 238 ms (3,000 filas) |
| Ventas (año) | 185 ms (4,806 filas) |
| Flujo de dinero | 161 ms |
| Las demás | Menos de 120 ms |

## Resultados de la 1.3.0 (26/09/2026)

Con la migración 5 y los controles de la [auditoría](auditoria.md). La base de prueba ahora deposita cada día en el banco lo que pasa del fondo de caja (1,095 depósitos) y abre la caja con lo contado al cerrar.

| Pantalla u operación | ms |
|---|---:|
| Inicio (administrador / vendedor) | 10.6 / 8.0 |
| Ventas (mes / año / todas) | 2.5 / 27.1 / 162.3 |
| Clientes / cliente con más compras | 18.1 / 19.1 |
| **Depósitos al banco (todos / por verificar)** | **10.9 / 8.1** |
| Detalle de un cierre | 0.7 |
| Contabilidad (3 años) | 20.3 |
| Flujo de dinero (3 años) | 170.2 |
| Historial de movimientos (3 años) | 81.2 |
| Registrar una venta | 4.6 |

**Hallazgo:** la lista de depósitos y el aviso del Inicio tardaban **1.5 s**. Por cada depósito buscaban su anulación en todo el libro de dinero (`ref_type = 'anulacion' AND ref_id = …`), que no tenía índice. La migración 5 agrega los índices `money_movements(ref_type, ref_id)` y `(category, method)`. También el detalle de un cierre bajó de 14 ms a 0.7 ms.

## Resultados de la 1.4.0 (27/09/2026)

Con la migración 6. La base de prueba reparte las gorras en 4 categorías. El dashboard ejecutivo calcula cada vez los indicadores de 3 rangos (el período, el anterior y el del año anterior), el pronóstico, la salud del inventario y las 4 tablas de utilidad.

| Pantalla u operación | ms |
|---|---:|
| Inicio (administrador / vendedor) | 10.0 / 9.3 |
| **Dashboard ejecutivo (mes / año / 3 años)** | **127.6 / 194.0 / 406.3** |
| Contabilidad (3 años) | 17.7 |
| Flujo de dinero (3 años) | 249.5 |
| Más vendidos (3 años) | 55.2 |
| Registrar una venta | 2.2 |

Lo que más pesa del dashboard es la salud del inventario (unos 90 ms: última venta y primera entrada de cada producto) y la utilidad por producto de 3 años (unos 75 ms). Está muy por debajo del segundo; si la tienda llega a miles de productos, la última venta de cada uno se puede guardar en el producto.

## Resultados de la 1.5.0 (29/09/2026)

Con la migración 7. Medido en un equipo más lento que el de la 1.4.0: pantallas que no cambiaron tardan cerca del doble (Ventas del año: 20 → 44 ms), así que se comparan entre sí.

| Pantalla u operación | ms |
|---|---:|
| Inicio (administrador / vendedor) | 22.7 / 16.6 |
| Inventario (con lo apartado de cada gorra) | 2.6 |
| **Inventario por modelo** | **3.8** |
| **Detalle de un modelo** | **1.4** |
| **Conteo sugerido (cíclico)** | **15.7** |
| **Apartados** | **0.6** |
| Dashboard ejecutivo (mes / año / 3 años) | 33.4 / 149.1 / 557.3 |
| Registrar una venta (revisa lo apartado) | 5.0 |

**Hallazgo:** en este equipo, el dashboard ejecutivo tardaba 690 ms con 3 años. La salud del inventario buscaba la última venta de cada producto recorriendo las ventas de 3 años (190 ms). Ahora descarta primero lo vendido desde la fecha de corte, con el índice por fecha, y busca la última venta solo de lo que queda: 10 ms. El mes pasó de 264 a 33 ms.

## Resultados de la 1.6.0 (29/09/2026)

Con la migración 8. Las métricas del CRM de todos los clientes salen de una sola consulta agrupada por cliente.

| Pantalla u operación | ms |
|---|---:|
| Clientes (con segmento, gasto, frecuencia y VIP de 400 clientes) | 38.9 |
| Clientes, filtro VIP | 41.3 |
| Ficha del cliente con más compras | 14.2 |
| Cumpleaños de los próximos 30 días | 8.3 |
| Inicio (administrador / vendedor), con los cumpleaños de la semana | 27.5 / 20.7 |

## Qué vigilar

- **Listas sin paginar:** algunas listas muestran todas las filas del período (Ventas del año: unas 4,800). Hoy dibujan en menos de 0.3 s. Si la tienda crece mucho, conviene paginar.
- **Historial de movimientos y listas largas:** desde la 1.2.0 traen todas las filas del período. La pantalla dibuja las primeras 1,000 y ofrece **Mostrar todas**; los totales, el CSV y el PDF usan todas.
