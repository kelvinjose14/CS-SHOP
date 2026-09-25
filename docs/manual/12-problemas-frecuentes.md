# 12. Problemas frecuentes

Busque el mensaje que ve en pantalla. Los mensajes de error salen abajo a la derecha, con borde rojo.

## Al instalar o abrir

| Situación | Qué hacer |
|---|---|
| **"Windows protegió su PC"** al instalar | Pulse **Más información** → **Ejecutar de todas formas**. Sale porque el instalador aún no tiene firma digital |
| Al abrir, aparece la ventana que ya estaba abierta | El programa solo permite una ventana a la vez, para proteger los datos. Use la que ya está abierta |
| **"No se pudo abrir la base de datos"** | No borre nada. Cierre el programa y reinicie la computadora. Si sigue, restaure la última copia de `respaldos\` ([Respaldos](11-configuracion-y-respaldos.md#114-restaurar-una-copia)) y avise al soporte |

## Al entrar

| Mensaje | Qué hacer |
|---|---|
| **Usuario o contraseña incorrectos.** | Revise el usuario y las mayúsculas de la contraseña |
| **Su usuario fue desactivado.** | El administrador debe reactivarlo en **Usuarios** |
| **Su sesión terminó. Vuelva a entrar.** | Pasa si la PC principal se reinició, si se restauró una copia o tras 12 horas sin uso. Entre de nuevo |
| **Sin conexión con la PC principal (…)**, **Clave de conexión incorrecta…** o **La PC principal tiene la versión…** | Ver [Varias computadoras, errores comunes](13-varias-computadoras.md#138-errores-comunes) |
| El sistema pide cambiar la contraseña | Es normal la primera vez o después de que el administrador la restableció |
| El administrador olvidó su contraseña | Si hay otro usuario administrador, ese puede restablecerla. Si no, hoy no hay recuperación desde el programa ([Usuarios, 10.4](10-usuarios-y-permisos.md#104-si-se-olvida-una-contraseña)) |

## Caja

| Mensaje | Qué hacer |
|---|---|
| **La caja está cerrada. Abra la caja antes de registrar movimientos en efectivo.** | La caja de **esta computadora** está cerrada: **Caja** → **Abrir caja**. También puede usar otro método de pago |
| **Ya hay una caja abierta en esta computadora.** | Ciérrela antes de abrir otra |
| **No hay suficiente efectivo en caja (esperado: …).** | El retiro es mayor que lo que debería haber |
| La caja no cuadra | Revise **Movimientos de efectivo**: ¿alguna venta se cobró en efectivo pero se pagó con tarjeta? ¿Falta registrar un gasto o un retiro? Anote la diferencia y el motivo al cerrar |

## Ventas

| Mensaje | Qué hacer |
|---|---|
| **Existencia insuficiente de "…" (disponible: N).** | El sistema tiene menos unidades de las que quiere vender. Si en realidad hay más, el administrador debe ajustar el inventario |
| **"…" está agotado.** | Igual que el anterior |
| **Producto no encontrado.** al escanear | El código no está registrado. Búsquelo por nombre, o el administrador agrega el código al producto |
| **Las ventas a crédito requieren un cliente.** | Elija o cree el cliente |
| **El pago recibido (…) es menor que el total (…).** | Corrija el monto o agregue otro método de pago |
| **Sólo se puede dar cambio sobre pagos en efectivo.** | Escriba el monto exacto en tarjeta o transferencia |
| **El descuento máximo permitido es N%.** | Baje el descuento o pida al administrador que haga la venta |
| **No tiene permiso para aplicar descuentos.** | El administrador desactivó los descuentos del vendedor |
| **Sólo el administrador puede cambiar el precio de un producto en la venta.** | Use el precio de lista |
| **La venta tiene devoluciones; no se puede anular.** | Haga una devolución por lo que falta |

## Cobros y pagos

| Mensaje | Qué hacer |
|---|---|
| **No hay balance pendiente para cobrar.** / **…para pagar.** | Ya está saldado |
| **El abono excede el balance pendiente (…).** / **El pago excede…** | Corrija el monto |
| **No tiene permiso para registrar pagos de clientes.** | El administrador desactivó esa opción para el vendedor |

## Inventario y compras

| Mensaje | Qué hacer |
|---|---|
| **Ya existe un producto con ese SKU.** / **…código de barras.** | Ese código ya lo tiene otro producto |
| **Seleccione un proveedor.** | Elija el proveedor de la compra |
| **Agregue al menos un producto a la compra.** | Agregue productos |
| **La existencia no cambia con este ajuste.** | El conteo coincide: no hace falta ajustar |

## Mensajes de campos

Mensajes del tipo **"Monto debe ser mayor que cero."**, **"Nombre es obligatorio."**, **"Cantidad debe ser un número entero mayor que cero."** o **"Fecha: formato inválido."** indican que un campo del formulario está vacío o mal escrito. Corríjalo y vuelva a intentar.

## Varias computadoras

Los mensajes de conexión, clave, versión y computadoras desactivadas están en [Varias computadoras en red](13-varias-computadoras.md#138-errores-comunes).

## Si nada de esto resuelve el problema

Anote:
- qué estaba haciendo;
- el mensaje exacto;
- la hora;
- el usuario;
- en qué computadora.

Si es posible, tome una captura de pantalla con la tecla Impr Pant. Con eso, el soporte puede revisar el **Historial de movimientos**. Si el programa muestra **"Error inesperado: …"**, esos datos son indispensables.
