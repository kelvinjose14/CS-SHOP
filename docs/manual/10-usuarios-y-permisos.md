# 10. Usuarios y permisos

**Para qué sirve:** que cada persona entre con su propio usuario, que todo quede registrado a su nombre y que el vendedor no vea costos ni ganancias.

**Quién administra usuarios:** solo el **Administrador**.

## 10.1 Los dos perfiles

| Área | Vendedor | Administrador |
|---|:---:|:---:|
| Inicio (resumen) | Reducido: ventas, lo que deben los clientes, caja e inventario en unidades | Completo |
| Nueva venta | ✔ | ✔ |
| Descuentos | Hasta el máximo configurado, si está permitido | Sin límite |
| Cambiar precio en la venta | ✘ | ✔ |
| Historial de ventas | ✔ sin costos | ✔ |
| Devoluciones y anulaciones de ventas | ✘ | ✔ |
| Inventario y movimientos (consultar) | ✔ sin costos | ✔ |
| Crear o editar productos, ajustar existencias | ✘ | ✔ |
| Compras, proveedores y cuentas por pagar | ✘ | ✔ |
| Clientes (registrar y editar) | ✔ | ✔ |
| Cuentas por cobrar (ver) | ✔ | ✔ |
| Registrar abonos de clientes | ✔ si está permitido | ✔ |
| Caja: abrir, entradas, retiros y cerrar | ✔ | ✔ |
| Historial de cierres de caja | ✘ | ✔ |
| Gastos y otros ingresos | ✘ | ✔ |
| Contabilidad, flujo de dinero y reportes | ✘ | ✔ |
| Historial de movimientos | ✘ | ✔ |
| Usuarios y configuración | ✘ | ✔ |

Los permisos se comprueban en el núcleo del sistema, no solo en la pantalla. Aunque alguien intente una operación no permitida, el sistema la rechaza con **"No tiene permiso para realizar esta operación."**

## 10.2 Crear o editar usuarios

Menú **Sistema** → **Usuarios**.

![Usuarios](img/usuarios.jpg)

- **Nuevo usuario:** **Nombre**, **Usuario (para entrar)**, **Rol** y **Contraseña inicial**, de al menos 6 caracteres.
- **Editar:** pulse el usuario.
  - Se puede cambiar el nombre, el usuario y el rol, y activar o desactivar.
  - **Nueva contraseña** restablece la contraseña. Déjela vacía para no cambiarla.
  - Un usuario desactivado ya no puede entrar. Si estaba dentro, se le cierra la sesión en su siguiente acción.
- Al crear un usuario o cambiarle la contraseña, se le pedirá cambiarla la próxima vez que entre.
- El sistema se entrega con dos usuarios, pero se pueden crear más.
- Un administrador no puede quitarse a sí mismo el rol ni desactivarse.

## 10.3 Cambiar la propia contraseña

Cualquier usuario: ícono de persona al pie del menú izquierdo → **Contraseña actual**, **Nueva contraseña** y repetirla → **Guardar**.

## 10.4 Si se olvida una contraseña

- **Vendedor:** el administrador le pone una nueva en **Usuarios**.
- **Administrador:** hoy no hay forma de recuperarla desde el programa si no existe otro administrador. **Se recomienda crear un segundo usuario administrador de respaldo** y guardar su contraseña en un lugar seguro. La recuperación está anotada en [Objetivos](../producto/objetivos.md#o5-brechas-funcionales).

## 10.5 Errores comunes

| Mensaje | Qué hacer |
|---|---|
| **Usuario o contraseña incorrectos.** | Revise mayúsculas y el usuario |
| **La contraseña debe tener al menos 6 caracteres.** | Use una más larga |
| **La contraseña actual no es correcta.** | Al cambiarla, escriba bien la actual |
| **Ya existe un usuario con ese nombre de usuario.** | Elija otro |
| **Su usuario fue desactivado.** | Hable con el administrador |
| **No tiene permiso para realizar esta operación.** | La acción es solo para el administrador |
