# 4. Inventario

**Para qué sirve:** tener cada gorra registrada con su foto, códigos, costo y precios, y saber en todo momento cuánto hay, cuánto vale y qué hay que reponer.

**Quién:**

| Acción | Vendedor | Administrador |
|---|:---:|:---:|
| Consultar productos, existencias y movimientos | ✔ (sin costos) | ✔ |
| Crear y editar productos, cambiar precios | ✘ | ✔ |
| Ajustar existencias | ✘ | ✔ |

## 4.1 La lista de inventario

Menú **Inventario** → **Inventario**.

![Inventario](img/inventario.jpg)

- **Resumen:**
  - **Productos** y **Unidades en existencia**.
  - **Invertido en mercancía (costo)**: solo lo ve el administrador.
  - **Valor a precio de venta**, con la ganancia potencial.
  - Cuántos productos tienen **Stock bajo** y cuántos están **Agotados**.
- **Buscar:** por nombre, marca, color, talla, SKU o código de barras.
- **Filtros:**
  - **Todos**.
  - **Stock bajo**: existencia mayor que 0 pero igual o menor que el mínimo.
  - **Agotados**: existencia 0.
  - **Reponer**: los dos anteriores juntos.
- **Ver inactivos** muestra los productos dados de baja.
- **Exportar** guarda la lista en CSV (Excel). El archivo incluye el stock mínimo y el valor al costo de cada producto.
- **Estado de cada producto:** **Normal**, **Stock bajo** o **Agotado**. Debajo de la existencia se ve el mínimo.

## 4.2 Crear un producto (administrador)

**Inventario** → **Nuevo producto**.

![Nuevo producto](img/producto-nuevo.jpg)

Cree una ficha por cada combinación que se vende por separado: modelo, color y talla. Por ejemplo, "NY Yankees 59FIFTY Negro 7 1/4" y "NY Yankees 59FIFTY Azul marino 7 3/8" son dos productos.

| Campo | Obligatorio | Nota |
|---|:---:|---|
| **Nombre** | ✔ | Ej. "Gorra NY Yankees 59FIFTY" |
| **Marca**, **Modelo**, **Color**, **Talla** | | Ayudan a buscar y salen en el recibo |
| **Código / SKU** | | Si lo deja vacío, el sistema asigna uno: `CS-00001`, `CS-00002`… No se puede repetir |
| **Código de barras** | | Escanéelo con el lector. No se puede repetir |
| **Costo de compra** | | Luego se actualiza solo con cada compra ([costo promedio](../producto/reglas-de-negocio.md#1-costo-de-cada-gorra-costo-promedio)) |
| **Precio al detalle** | ✔ (en pantalla) | Al escribirlo se muestra el margen. Aviso: si se deja vacío, hoy el sistema lo guarda en 0 sin avisar ([brecha anotada](../producto/objetivos.md#o5-brechas-funcionales)); revíselo siempre |
| **Precio al por mayor** | | Si queda vacío se guarda en 0: complételo si vende por mayor |
| **Stock mínimo** | | Cuando la existencia llega a este número, el producto aparece en **Por reponer** |
| **Existencia inicial** | | Solo al crear. Úsela para cargar lo que ya tiene |
| **Foto** | | Botón **Foto**. La imagen se reduce automáticamente |
| **Notas** | | Texto libre |

Pulse **Guardar**.

## 4.3 Ver y editar un producto

Pulse un producto de la lista.

![Detalle de un producto](img/detalle-producto.jpg)

El detalle muestra:
- Los datos del producto.
- El costo promedio y el valor al costo (solo el administrador).
- El margen al detalle.
- El **Historial de movimientos**: cada entrada y salida con fecha, cantidad, existencia resultante, detalle y usuario.

- **Editar:** cambia datos y precios. Cada cambio de costo o precio queda en **Historial de movimientos** (menú **Análisis**) con el valor anterior y el nuevo. La existencia no se edita aquí: se cambia con compras, ventas o ajustes.
- **Dar de baja:** en **Editar**, desmarque **Producto activo**. El producto deja de salir en ventas y búsquedas, pero conserva su historial. No se borran productos.

## 4.4 Ajustar la existencia (administrador)

Úselo cuando el conteo físico no coincide con el sistema, o cuando sale mercancía que no es venta (dañada, regalo, muestra).

Abra el producto → **Ajustar existencia**:

- **Entrada (+):** suma unidades.
- **Salida (−):** resta unidades.
- **Conteo físico:** escriba la **Existencia real contada** y el sistema calcula la diferencia.
- **Motivo:** obligatorio.

Pulse **Aplicar ajuste**. El ajuste queda en los movimientos del producto y en el historial.

> El ajuste cambia las unidades, pero no registra dinero. Si la mercancía se compró, use **Compras**. Si se vendió, use **Nueva venta**.

## 4.5 Movimientos de inventario

Menú **Inventario** → **Movimientos de inventario**. Muestra todas las entradas y salidas de todos los productos. Se puede filtrar por período, por tipo y por producto, y exportar.

| Tipo | Lo genera | Efecto |
|---|---|---|
| Inventario inicial | Existencia inicial al crear el producto | + |
| Compra | **Compras** | + |
| Venta | **Nueva venta** | − |
| Devolución de cliente | **Devolución** con reingreso | + |
| Ajuste manual / Entrada / Salida | **Ajustar existencia** | + o − |
| Anulación de venta | **Anular venta** | + |
| Anulación de compra | **Anular compra** | − |

## 4.6 Qué reponer

- **Inicio** → **Por reponer**: los productos agotados y los que están en su stock mínimo o por debajo.
- **Inventario** → filtro **Reponer**: la misma lista con todos los datos.
- Para decidir cuánto pedir, compare con **Reportes** → **Productos más vendidos** ([Contabilidad y reportes](09-contabilidad-y-reportes.md)).

## 4.7 Errores comunes

| Mensaje | Qué hacer |
|---|---|
| **Ya existe un producto con ese SKU.** | Use otro código o deje el campo vacío para que se asigne uno |
| **Ya existe un producto con ese código de barras.** | Ese código ya pertenece a otro producto: búsquelo en la lista |
| **Nombre es obligatorio.** | Escriba el nombre |
| **La existencia no cambia con este ajuste.** | El conteo es igual a la existencia actual: no hace falta ajustar |
| **Existencia insuficiente de "…" (disponible: N).** | Una **Salida** no puede dejar la existencia en negativo |
| **Motivo es obligatorio.** | Escriba el motivo del ajuste |
