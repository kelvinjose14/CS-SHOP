# 8. Gastos e ingresos

**Para qué sirve:** registrar todo lo que el negocio paga que no es mercancía (alquiler, nómina, luz, publicidad, delivery…) y los ingresos que no son ventas. Con eso se calcula la ganancia neta.

**Quién:** solo el **Administrador**.

> **Compra de mercancía ≠ gasto.** Las gorras se registran en **Compras**, no aquí. Si se registran como gasto, la ganancia se descuenta dos veces.

## 8.1 Registrar un gasto

Menú **Finanzas** → **Gastos**.

![Gastos](img/gastos.jpg)

1. Pulse **Registrar gasto**.
2. Complete los campos:
   - **Categoría:** Alquiler, Transporte, Publicidad, Nómina, Servicios, Internet, Delivery u Otros. Se pueden cambiar en [Configuración](11-configuracion-y-respaldos.md).
   - **Fecha:** puede ser anterior a hoy.
   - **Descripción:** por ejemplo "Luz de agosto".
   - **Monto.**
   - **Método de pago.**
3. Pulse **Guardar**.

### Qué cambia en el sistema
- **Ganancias:** el gasto resta en la ganancia neta del período de su **fecha**.
- **Dinero:** sale como "Gastos" en el flujo de dinero. Si fue en efectivo, sale de la **caja abierta en ese momento**, aunque la fecha del gasto sea anterior.
- **Historial:** queda registrado quién lo anotó y cuándo.

## 8.2 Consultar y anular

- La lista muestra los gastos del período con fecha, categoría, descripción, método, monto, quién lo registró y cuándo. A la derecha está el total por categoría.
- Filtre por período y por categoría. **Exportar** guarda la lista en CSV.
- **Anular:** pulse el ícono de papelera de la fila y escriba el motivo. El gasto deja de contar y su dinero se registra como entrada ("Gastos anulados"). No se borra: queda en el historial.

## 8.3 Otros ingresos

En la misma pantalla, pestaña **Otros ingresos**, se registra el dinero que entra y no es una venta de gorras.
- Ejemplos: un servicio de bordado o un aporte del dueño.
- Categorías por defecto: Otros ingresos, Aporte del dueño y Servicios.
- Funciona igual que los gastos: **Registrar ingreso**, filtros y anulación.

Los otros ingresos **suman** en la ganancia neta. Si registra un aporte de capital del dueño aquí, contará como ganancia. Tenga eso en cuenta al leer los números ([Decisiones](../producto/decisiones.md), DP-05).

## 8.4 Errores comunes

| Mensaje | Qué hacer |
|---|---|
| **Monto debe ser mayor que cero.** | Escriba un monto válido |
| **Categoría es obligatorio.** | Elija una categoría |
| **La caja está cerrada…** | Gasto en efectivo sin caja abierta: abra la caja o use otro método |
| **El gasto ya está anulado.** | No se puede anular dos veces |
