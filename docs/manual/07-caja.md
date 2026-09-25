# 7. Caja

**Para qué sirve:** controlar el efectivo de la gaveta. Se abre con el dinero que hay, el sistema suma y resta cada movimiento en efectivo, y al cerrar se compara lo esperado con lo contado.

**Quién:**

| Acción | Vendedor | Administrador |
|---|:---:|:---:|
| Abrir y cerrar caja, entradas y retiros | ✔ | ✔ |
| Ver el historial de cierres | ✘ | ✔ |

> Solo el **efectivo** pasa por la caja. Los cobros y pagos con tarjeta o transferencia no cambian la caja; se ven en [Flujo de dinero](09-contabilidad-y-reportes.md#92-flujo-de-dinero).

## 7.1 Abrir la caja

Menú **Finanzas** → **Caja**. Si está cerrada, se ve el resultado del último cierre.

1. Cuente el efectivo de la gaveta.
2. Escriba el monto en **Efectivo inicial**. Se propone lo contado en el último cierre.
3. Pulse **Abrir caja**.

Con la opción **Exigir caja abierta para movimientos en efectivo** activada (así viene), **no se puede** mover efectivo sin caja abierta: ni cobrar, ni abonar, ni pagar gastos o compras.

## 7.2 Durante el día

![Caja abierta](img/caja.jpg)

La caja abierta muestra:

| Línea | Qué suma o resta |
|---|---|
| **Efectivo inicial** | Lo que se contó al abrir |
| **+ Ventas en efectivo** | Cobros de ventas en efectivo, ya descontado el cambio |
| **+ Abonos de clientes** | Abonos recibidos en efectivo |
| **+ Otros ingresos** | Otros ingresos en efectivo, **Entradas de efectivo**, reembolsos de compras anuladas y gastos anulados |
| **− Gastos y pagos en efectivo** | Gastos, compras y pagos a proveedores hechos en efectivo |
| **− Retiros** | Retiros registrados (depósitos al banco, dinero que se lleva el dueño) |
| **− Devoluciones y anulaciones** | Reembolsos de devoluciones y dinero devuelto al anular ventas (solo aparece si hubo) |
| **Efectivo esperado en caja** | El resultado: lo que debería haber en la gaveta |

A la derecha, **Movimientos de efectivo** lista cada uno con hora, concepto, detalle, monto y usuario.

- **Entrada de efectivo:** para meter dinero que no es venta, por ejemplo sencillo para dar cambio. Pide **Monto** y **Descripción**.
- **Retiro:** para sacar dinero que no es un gasto, por ejemplo un depósito al banco o un retiro del dueño. Pide **Monto** y **Descripción**. No se puede retirar más de lo esperado en caja.

## 7.3 Cerrar la caja

![Cerrar caja](img/cierre-caja.jpg)

1. Cuente el efectivo.
2. **Cerrar caja** → escriba el **Efectivo real contado**.
3. El sistema muestra la **Diferencia**:
   - **(cuadrada)**: coincide.
   - **(faltante)**: hay menos de lo esperado.
   - **(sobrante)**: hay más.
4. Si hay diferencia, explique el motivo en **Nota**.
5. Pulse **Cerrar caja**.

Lo contado al cerrar se propone como efectivo inicial de la próxima apertura.

## 7.4 Historial de cierres (administrador)

Debajo de la caja, **Historial de cierres** lista cada apertura con:
- quién abrió y quién cerró;
- el efectivo inicial, el esperado y el real;
- la **Diferencia**: en verde si cuadró, rojo si faltó y naranja si sobró.

Al pulsar un cierre se ven todos sus movimientos.

## 7.5 Aviso sobre los retiros

Hoy un depósito al banco se registra como **Retiro**. En **Flujo de dinero** cuenta como dinero que salió del negocio, aunque solo cambió de lugar. Por eso el flujo neto puede verse más negativo de lo real. La corrección está anotada en [Objetivos](../producto/objetivos.md#o5-brechas-funcionales): separar "depósito al banco" de "retiro del dueño".

## 7.6 Errores comunes

| Mensaje | Qué hacer |
|---|---|
| **La caja está cerrada. Abra la caja antes de registrar movimientos en efectivo.** | Abra la caja (7.1) |
| **Ya hay una caja abierta.** | Solo puede haber una caja abierta a la vez: ciérrela antes de abrir otra |
| **No hay caja abierta.** | Se intentó un retiro, una entrada o un cierre sin caja abierta |
| **No hay suficiente efectivo en caja (esperado: …).** | El retiro supera lo que debería haber |
| **Descripción es obligatorio.** | Escriba para qué es la entrada o el retiro |
