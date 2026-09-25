# 11. Configuración y respaldos

**Para qué sirve:** ajustar el sistema al negocio y proteger los datos.
**Quién:** solo el **Administrador**.

## 11.1 Configuración

Menú **Sistema** → **Configuración**. Pulse **Guardar configuración** al terminar.

![Configuración](img/configuracion.jpg)

| Opción | Por defecto | Efecto |
|---|---|---|
| **Nombre del negocio**, **Eslogan**, **Teléfono**, **Dirección** | CAPS._.SHOP / Tienda de Gorras | Salen en el recibo y en los reportes en PDF |
| **Símbolo de moneda** | RD$ | Cómo se muestran los montos |
| **Mensaje al pie del recibo** | ¡Gracias por su compra! | Última línea del recibo |
| **Días de crédito por defecto** | 30 | Fecha de vencimiento propuesta en ventas y compras a crédito |
| **Descuento máximo del vendedor (%)** | 10 | Tope de descuento para el vendedor. Se cuenta sobre el subtotal antes de descuentos |
| **Exigir caja abierta para movimientos en efectivo** | Activado | Sin caja abierta no se puede cobrar, pagar ni abonar en efectivo. Se recomienda dejarlo activado |
| **Permitir vender sin existencia (inventario negativo)** | Desactivado | Si se activa, se puede vender aunque el sistema diga 0. No se recomienda |
| **El vendedor puede registrar abonos de clientes** | Activado | Permite que el vendedor reciba abonos |
| **El vendedor puede aplicar descuentos** | Activado | Si se desactiva, el vendedor no puede dar descuentos |
| **Categorías de gastos** | Alquiler, Transporte, Publicidad, Nómina, Servicios, Internet, Delivery, Otros | Una por línea. Cambiarlas no modifica los gastos ya registrados |
| **Categorías de otros ingresos** | Otros ingresos, Aporte del dueño, Servicios | Una por línea |

Cada cambio de configuración queda en el **Historial de movimientos**.

La sección **Red** (compartir con otras computadoras, clave de conexión y lista de computadoras) se explica en [Varias computadoras en red](13-varias-computadoras.md#132-preparar-la-pc-principal).

## 11.2 Dónde están los datos

Todo se guarda en la **PC principal**, en `%APPDATA%\CAPS Shop\data`:

| Archivo o carpeta | Qué contiene |
|---|---|
| `capsshop.db` | La base de datos: productos, ventas, compras, clientes, caja, usuarios, configuración e historial. Junto a ella pueden aparecer `capsshop.db-wal` y `capsshop.db-shm`: son parte de la base mientras el programa está abierto, no los borre |
| `config.json` | Cómo trabaja esta computadora: principal o conectada ([Varias computadoras](13-varias-computadoras.md)) |
| `fotos\` | Las fotos de los productos |
| `respaldos\` | Las copias automáticas diarias |

Desinstalar el programa no borra esta carpeta. En una computadora conectada, la carpeta solo tiene `config.json`: los datos están en la principal.

## 11.3 Copias de seguridad

Las copias se hacen **solo en la PC principal**. En una computadora conectada, la sección **Copias de seguridad** lo indica y no tiene botones.

**Automáticas**
- Cada día, la primera vez que se abre el programa, se guarda una copia de la base en `respaldos\capsshop-AAAA-MM-DD.db`.
- Se conservan las **30 copias más recientes**. Si el programa no se abre un día, ese día no hay copia.
- **Abrir carpeta de respaldos automáticos** abre esa carpeta.

**Manuales**
- **Crear copia de seguridad…** guarda un archivo `capsshop-respaldo-AAAA-MM-DD.db` donde usted elija.
- Guárdelo en una memoria USB o en la nube **al menos una vez por semana**. Las copias automáticas están en el mismo disco: si el disco se daña, se pierden con él.

> **Las fotos no van dentro del archivo de copia.** La copia `.db` guarda todos los datos, pero no las fotos de los productos. Para respaldar también las fotos, copie la carpeta `fotos\` completa. Incluirlas en la copia está anotado en [Objetivos](../producto/objetivos.md#o4-instalación-y-operación).

## 11.4 Restaurar una copia

1. **Restaurar desde copia…** → elija el archivo `.db`.
2. El sistema comprueba que sea una copia válida de CAPS Shop.
3. Confirme el aviso: **se reemplazarán todos los datos actuales** por los de la copia.
4. Antes de reemplazar, el sistema guarda los datos actuales en `respaldos\antes-de-restaurar-….db`, por si hay que volver atrás.
5. Al terminar, vuelva a iniciar sesión. Las contraseñas son las que había en la copia. Las computadoras conectadas también deben entrar de nuevo.

## 11.5 Pasar el sistema a otra computadora

1. En la computadora vieja, cierre CAPS Shop.
2. Copie la carpeta completa `%APPDATA%\CAPS Shop\data` a una memoria USB. Así van la base, las fotos y los respaldos.
3. En la computadora nueva, instale CAPS Shop. Si lo abre, cierre la pantalla **Configurar esta computadora** sin configurar nada.
4. Copie la carpeta a `%APPDATA%\CAPS Shop\data` de la nueva (créela si no existe; si existe, reemplácela).
5. Abra CAPS Shop y entre con sus usuarios de siempre.

> Esto es para cambiar la **PC principal**. Si tiene computadoras conectadas, siguen funcionando: al no encontrar la principal en la dirección vieja, la buscan en la red. Si no la encuentran, escriba la nueva dirección con **Configurar esta PC** ([Varias computadoras](13-varias-computadoras.md)).
>
> Para que otra computadora trabaje con los mismos datos, **no copie la base**: conéctela a la principal. Dos copias de la base no se pueden unir después.
