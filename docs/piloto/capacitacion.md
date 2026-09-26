# Capacitación

Dos sesiones **con datos de práctica** en la PC principal, el día de la instalación ([Plan, Día 0](README.md#día-0-instalación-y-carga-de-datos)). Al terminar, los datos de práctica se borran y se empieza con los reales.

Cada ejercicio dice **qué comprobar**. Si el número no coincide, algo se hizo distinto: repáselo con el manual antes de seguir.

## Preparar la práctica

Sobre la instalación nueva (PC principal, recién configurada):
1. Entre con `admin` / `admin123` y cambie la contraseña (en la práctica puede ser `practica1`).
2. **Configuración:** escriba el nombre del negocio y guarde.
3. **Inventario → Importar → Descargar plantilla**. Abra la plantilla en Excel, agregue dos filas y guárdela:

   | Nombre | Color | Talla | Costo | Precio detalle | Precio por mayor | Existencia |
   |---|---|---|---|---|---|---|
   | Gorra práctica A | Negro | Ajustable | 500 | 1000 | 800 | 0 |
   | Gorra práctica B | Rojo | M | 300 | 700 | 550 | 5 |

4. **Importar → Elegir archivo…** → la plantilla → **Importar**.

## Sesión 1: dueño (administrador)

Unas 2 horas. Manual de referencia: capítulos [1](../manual/01-primeros-pasos.md) a [14](../manual/14-soporte-y-recuperacion.md).

| # | Ejercicio | Qué comprobar | Manual |
|---|---|---|---|
| 1 | **Compra a crédito** a un proveedor nuevo ("Proveedor práctica"): 10 × Gorra práctica A a RD$ 500 | Existencia de A = 10. **Inicio → Debo a proveedores** = RD$ 5,000 | [5.2](../manual/05-compras-y-proveedores.md#52-registrar-una-compra) |
| 2 | **Abrir la caja** con RD$ 1,000 | Caja abierta, efectivo esperado RD$ 1,000 | [7.1](../manual/07-caja.md#71-abrir-la-caja) |
| 3 | **Venta al detalle** de 2 × A con el **lector** (o escribiendo el nombre), pago en efectivo con RD$ 2,500 | Cambio RD$ 500. Existencia de A = 8. Esperado en caja RD$ 3,000 | [3.1](../manual/03-ventas.md#31-hacer-una-venta) |
| 4 | **Venta por mayor** de 3 × B, pago con tarjeta | Precio RD$ 550 c/u, total RD$ 1,650. La caja no cambia (no es efectivo) | [3.1](../manual/03-ventas.md#31-hacer-una-venta) |
| 5 | **Venta a crédito** de 1 × A a un cliente nuevo ("Cliente práctica") | **Cuentas por cobrar** = RD$ 1,000 | [6.2](../manual/06-clientes-y-cobros.md#62-vender-a-crédito) |
| 6 | **Abono** del cliente: RD$ 400 en efectivo | Le quedan RD$ 600. Esperado en caja RD$ 3,400 | [6.4](../manual/06-clientes-y-cobros.md#64-registrar-un-abono) |
| 7 | **Pago al proveedor**: RD$ 2,000 por transferencia | **Debo a proveedores** = RD$ 3,000 | [5.4](../manual/05-compras-y-proveedores.md#54-cuentas-por-pagar) |
| 8 | **Devolución** de 1 gorra de la venta del ejercicio 3, reembolso en efectivo | Existencia de A = 8. Esperado en caja RD$ 2,400 | [3.3](../manual/03-ventas.md#33-devolución-administrador) |
| 9 | **Gasto** de RD$ 300 en efectivo (Transporte) | Esperado en caja RD$ 2,100 | [8.1](../manual/08-gastos-e-ingresos.md#81-registrar-un-gasto) |
| 10 | **Depósito al banco** de RD$ 1,000 | Esperado RD$ 1,100. En **Flujo de dinero** no cuenta como salida | [7.2](../manual/07-caja.md#72-durante-el-día) |
| 11 | **Aporte del dueño** de RD$ 5,000 por transferencia | Aparece en el flujo de dinero, **no** en la ganancia | [8.3.1](../manual/08-gastos-e-ingresos.md#831-aportes-del-dueño) |
| 12 | **Saldo inicial** de otro cliente ("Cliente cuaderno"): RD$ 2,000 | **Cuentas por cobrar** = RD$ 2,600; las ventas del día no cambian | [6.1](../manual/06-clientes-y-cobros.md#saldo-inicial-administrador) |
| 13 | **Anular** la venta a crédito del ejercicio 5 | Vuelve la gorra (A = 9) y se devuelve el abono en efectivo: esperado en caja RD$ 700. **Cuentas por cobrar** = RD$ 2,000 | [3.4](../manual/03-ventas.md#34-anular-una-venta-administrador) |
| 14 | **Cerrar la caja** contando RD$ 650 | Diferencia **−RD$ 50** (faltante). Escriba el motivo | [7.3](../manual/07-caja.md#73-cerrar-la-caja) |
| 15 | **Inicio** y **Contabilidad** del día | Ventas netas de hoy RD$ 2,650 (2,000 + 1,650 − 1,000 devuelto). Encuentre también la ganancia y lo que se debe | [9](../manual/09-contabilidad-y-reportes.md) |
| 16 | **Conteo de inventario**: cuente A (9) y B, y escriba 1 menos de B (1) → **Revisar y aplicar** | Falta 1 unidad de B. Queda en el historial | [4.9](../manual/04-inventario.md#49-conteo-de-inventario-administrador) |
| 17 | **Depósitos por verificar** (Caja): marque el depósito del ejercicio 10 **En el banco** | El aviso del Inicio desaparece | [7.4](../manual/07-caja.md#74-depósitos-por-verificar-administrador) |
| 18 | **Etiquetas** de A (2 unidades) | Salen con el código y el precio. Escanee una en **Nueva venta**: encuentra la gorra | [4.8](../manual/04-inventario.md#48-etiquetas-de-código-de-barras) |
| 19 | **Historial de movimientos** | Está todo lo que se hizo, con usuario y hora | [9](../manual/09-contabilidad-y-reportes.md) |
| 20 | **Soporte:** Guardar diagnóstico | Se guarda un archivo `capsshop-diagnostico-….txt` | [14.5](../manual/14-soporte-y-recuperacion.md#145-pedir-ayuda-al-soporte) |
| 21 | **Copias:** Crear copia de seguridad y ver la carpeta de respaldos automáticos | Hay un archivo `.db` | [11.3](../manual/11-configuracion-y-respaldos.md#113-copias-de-seguridad) |
| 22 | **Recuperar la contraseña:** genere un código de práctica, salga y use **¿Olvidó la contraseña del administrador?** | Entra con la contraseña nueva | [10.4](../manual/10-usuarios-y-permisos.md#104-si-se-olvida-una-contraseña) |

Los números de esta tabla los comprueba la prueba automática `test/o6.test.js`.

**Preguntas de cierre** (el dueño las responde solo, desde **Inicio**):
- ¿Cuánto se vendió hoy?
- ¿Cuánto deben los clientes, y quién?
- ¿Cuánto le debo al Proveedor práctica?
- ¿Qué gorra se vendió más?
- ¿Cuánto efectivo debería haber en la caja?

## Sesión 2: vendedor

Unos 45 minutos, con los mismos datos de práctica, después de la sesión del dueño. Entra con el usuario `vendedor`.

| # | Ejercicio | Qué comprobar | Manual |
|---|---|---|---|
| 1 | Entrar y cambiar la contraseña | Llega a **Nueva venta** | [1.3](../manual/01-primeros-pasos.md#13-entrar-por-primera-vez) |
| 2 | Abrir la caja con RD$ 500 | Pide el **motivo**, porque al cerrar se contaron RD$ 650. Escriba "El dueño se llevó RD$ 150" | [7.1](../manual/07-caja.md#71-abrir-la-caja) |
| 3 | Venta con el **lector**, pago en efectivo con billete grande | El cambio está bien | [3.1](../manual/03-ventas.md#31-hacer-una-venta) |
| 4 | Venta con **dos métodos** (parte efectivo, parte tarjeta) | Solo el efectivo entra en la caja | [3.1](../manual/03-ventas.md#31-hacer-una-venta) |
| 5 | Venta con **descuento** dentro del máximo, y otra por encima | La segunda la rechaza | [3.1](../manual/03-ventas.md#31-hacer-una-venta) |
| 6 | Buscar una gorra por color y talla en **Inventario** | La encuentra; no ve costos | [4.1](../manual/04-inventario.md#41-la-lista-de-inventario) |
| 7 | Registrar un **cliente** y venderle a crédito | Aparece en Cuentas por cobrar | [6.2](../manual/06-clientes-y-cobros.md#62-vender-a-crédito) |
| 8 | Reimprimir el recibo de una venta anterior | Sale el recibo | [3.2](../manual/03-ventas.md#32-consultar-ventas) |
| 9 | **Depósito al banco** de RD$ 200 | Se registra; **Retiro** no aparece para el vendedor | [7.2](../manual/07-caja.md#72-durante-el-día) |
| 10 | **Cerrar la caja** contando el efectivo | Ve la diferencia | [7.3](../manual/07-caja.md#73-cerrar-la-caja) |

**Qué hacer si algo falla** (el vendedor lo debe saber de memoria):
- **"Sin conexión con la PC principal":** revisar que la principal esté encendida; el programa reintenta solo. Si no vuelve, vender en papel y avisar.
- **Cualquier otro mensaje:** anotar el mensaje exacto y la hora, y avisar al dueño.
- **Nunca** borrar ni reinstalar el programa sin hablar con el dueño.

## Al terminar: borrar los datos de práctica

Se hace **en la PC principal**, antes de conectar las demás y de elegir la impresora.
1. Cierre CAPS Shop.
2. Pulse **Windows + R**, escriba `%APPDATA%\CAPS Shop` y pulse **Enter**.
3. Cambie el nombre de la carpeta `data` a `data-practica`. No la borre todavía: sirve si hay que repasar algo.
4. Abra CAPS Shop. Sale **Configurar esta computadora**: elija **Esta es la PC principal** con el mismo nombre de antes.
5. Entre con `admin` / `admin123`: es una base vacía. Siga con el paso 4 del [Día 0](README.md#día-0-instalación-y-carga-de-datos).

Cuando el piloto esté andando, puede borrar la carpeta `data-practica`.
