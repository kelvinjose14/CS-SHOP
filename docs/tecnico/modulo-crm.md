# Módulo CRM de clientes (opcional)

El CRM (RF-NUE-19 a 21, versión 1.6) está hecho y probado, pero **viene apagado de fábrica** (DT-50). Se vende aparte: mientras esté apagado, el cliente no ve nada de él ni sabe que existe.

## Qué cambia al apagarlo

| Parte | Apagado (de fábrica) | Encendido |
|---|---|---|
| Clientes → lista | Cliente, teléfono, cédula/RNC, lo que debe y el límite de crédito | Segmentos, VIP, etiquetas, compras, gasto, ticket promedio, última compra y cumpleaños; botones **Cumpleaños** y **Copiar teléfonos** |
| Ficha del cliente | Datos, crédito, apartados, compras y pagos | Además: segmento, VIP, etiquetas, cumpleaños, métricas de compra, **Lo que más compra** y **Notas de seguimiento** |
| Nuevo / editar cliente | Sin cumpleaños, etiquetas ni VIP | Con cumpleaños, etiquetas y VIP |
| Inicio | Sin cumpleaños | Tarjeta **Cumpleaños esta semana** |
| Configuración | Sin el monto del VIP | **Cliente VIP: compras de los últimos 12 meses desde** |
| Excel de clientes | Contacto y crédito | Además segmento, VIP, etiquetas y métricas |

Los datos no se borran: si un cliente ya tenía cumpleaños, etiquetas o notas, vuelven a verse al encenderlo. El núcleo tampoco devuelve cumpleaños con el CRM apagado (`customers.birthdays` y el Inicio dan una lista vacía).

## Cómo se enciende o apaga (solo el técnico)

1. Entre como **administrador** en la PC principal (o en cualquier PC conectada: el cambio es para todas).
2. Abra **Configuración**.
3. Pulse **Ctrl + Alt + Shift + M**. Se abre **Opciones del técnico**.
4. Marque o desmarque **CRM de clientes** y pulse **Guardar**. La pantalla se recarga.

No hay botón ni menú, y el cambio **no queda en el Historial**. Se guarda en la base, en la clave interna `_mod_crm` de `settings` (`'1'` encendido); `settings.get` la expone como `crm_enabled` y la API `settings.modules` (solo administrador) la cambia.

El manual del cliente ([capítulo 6](../manual/06-clientes-y-cobros.md)) y la [lista de aceptación](../piloto/aceptacion.md) describen el sistema **sin** CRM. Al venderlo, entregue también esta guía de uso:

## Guía de uso del CRM

![Clientes](../manual/img/clientes.jpg)

- **Nuevo cliente:** **Nombre** (obligatorio), **Teléfono**, **Cédula / RNC**, **Correo**, **Dirección**, **Cumpleaños** (día y mes, por ejemplo 15/08), **Etiquetas** (separadas por coma: "mayorista, Santiago") y **Notas**. También se puede crear desde **Nueva venta** con el botón **+** junto al cliente.
- La lista muestra de cada cliente su **segmento**, cuántas **compras** hizo, el **gasto total**, el **ticket promedio**, la **última compra** (y hace cuántos días), lo que **debe** y su **cumpleaños**. La ★ marca a los VIP; debajo del nombre van sus etiquetas.
- Arriba se filtra por **segmento** (con cuántos hay en cada uno) y por **etiqueta**; el buscador también encuentra por etiqueta.
- **Cumpleaños** muestra quién cumple en los próximos 30 días. **Copiar teléfonos** copia los teléfonos de los clientes que se están viendo, para pegarlos en WhatsApp o en una lista de difusión. **Exportar** los guarda en Excel con todos los datos.
- Al pulsar un cliente se abre su **ficha** ([ver abajo](#la-ficha-con-el-crm)).

**Segmentos** (el sistema los calcula solo, con las ventas que no son saldos iniciales):

| Segmento | Quién es |
|---|---|
| **Nuevo** | Empezó a comprar en los últimos 30 días y todavía no tiene 3 compras en el año |
| **Frecuente** | 3 compras o más en los últimos 12 meses |
| **Ocasional** | Compra de vez en cuando |
| **En riesgo** | Lleva sin comprar más del doble de lo que normalmente tarda entre compras (al menos 45 días) |
| **Perdido** | Lleva sin comprar más del triple de lo normal (al menos 90 días) |
| **Sin compras** | Registrado, pero todavía no ha comprado |

**VIP:** el cliente que compró **RD$ 25,000 o más en los últimos 12 meses** (se cambia en **Configuración** → **Cliente VIP**; 0 = sin VIP automático). El administrador puede marcarlo a mano en **Editar** → **Cliente VIP**: **Automático**, **Sí, siempre** o **No**.

> Para recuperar clientes: filtre **En riesgo** o **Perdidos**, pulse **Copiar teléfonos** y escríbales con una oferta. Anote en la ficha lo que respondió cada uno.
- **Límite de crédito** (administrador): en **Editar**, lo máximo que el cliente puede deber. **0 = sin límite** (así se crean).
- **Dar de baja un cliente** (administrador): en **Editar** desmarque **Activo**. No se borran clientes.
  - No se puede si el cliente **debe**: primero cobre o anule lo pendiente.
  - A un cliente desactivado **no se le vende**. Para verlo, marque **Ver desactivados** en la lista; para volver a venderle, márquelo **Activo** otra vez.

### La ficha con el CRM

![Ficha del cliente](../manual/img/ficha-cliente.jpg)

- **Arriba:** el segmento, la ★ VIP, sus etiquetas y su cumpleaños (y cuánto falta, si es pronto).
- **Números:** compras, gasto total, gasto de los últimos 12 meses, ticket promedio, primera y última compra, **cada cuántos días compra**, lo que debe, lo vencido y su límite de crédito.
- **Lo que más compra:** las categorías, marcas, tallas y gorras que más lleva, en unidades. Sirve para ofrecerle lo que le gusta.
- **Apartados activos**, si tiene.
- **Notas de seguimiento:** escriba lo que se habló ("le escribí; viene el sábado") y pulse **Agregar nota**. Quedan con la fecha y quién la escribió, la más nueva primero.
- Después, todas sus **compras** y su **historial de pagos**, como antes.

El vendedor ve la misma ficha: son montos de lo que el cliente pagó, nunca costos ni utilidad.
