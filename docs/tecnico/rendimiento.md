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

## Qué vigilar

- **Listas sin paginar:** algunas listas muestran todas las filas del período (Ventas del año: unas 4,800). Hoy dibujan en menos de 0.3 s. Si la tienda crece mucho, conviene paginar.
- **Historial de movimientos y listas largas:** desde la 1.2.0 traen todas las filas del período. La pantalla dibuja las primeras 1,000 y ofrece **Mostrar todas**; los totales, el CSV y el PDF usan todas.
