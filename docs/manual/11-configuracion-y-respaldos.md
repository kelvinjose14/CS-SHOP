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
| `registros\` | El registro de errores de los últimos 14 días ([11.6](#116-soporte-diagnóstico-y-registro-de-errores)) |

Desinstalar el programa no borra esta carpeta. En una computadora conectada, la carpeta solo tiene `config.json`: los datos están en la principal.

## 11.3 Copias de seguridad

Las copias se hacen **solo en la PC principal**. En una computadora conectada, la sección **Copias de seguridad** lo indica y no tiene botones.

**Automáticas**
- Cada día, la primera vez que se abre el programa, se guarda una copia de la base en `respaldos\capsshop-AAAA-MM-DD.db`.
- Se conservan las **30 copias más recientes**. Si el programa no se abre un día, ese día no hay copia.
- **Abrir carpeta de respaldos automáticos** abre esa carpeta.

**Copia fuera de esta computadora** (la más importante)
- Las copias automáticas están en el mismo disco: si el disco se daña, se pierden con él. Configure una copia afuera.
- **Elegir carpeta…**: elija una **memoria USB** o la carpeta de **OneDrive** o **Google Drive** de esa PC. El programa de la nube la sube a internet solo.
- **Qué guarda:** cada día, en la carpeta **CAPS Shop respaldos**:
  - la base, `capsshop-AAAA-MM-DD.db`; se conservan 30;
  - **las fotos**, en la carpeta `fotos`, que se copian solo si son nuevas.
- **Cuándo copia:** se hace sola al abrir el programa y se vuelve a intentar cada hora. Si la memoria no está conectada, copia en cuanto se conecta.
- **Copiar ahora** hace la copia en el momento. **Quitar** deja de copiar.
- El **Inicio** avisa al administrador si no hay copia externa o si pasaron **7 días** sin copia.

**Manuales**
- **Crear copia de seguridad…** guarda un archivo `capsshop-respaldo-AAAA-MM-DD.db` donde usted elija. Esta copia no lleva las fotos; la copia externa sí.

## 11.4 Restaurar una copia

1. **Restaurar desde copia…** → elija el archivo `.db`.
2. El sistema comprueba que sea una copia válida de CAPS Shop.
3. Confirme el aviso: **se reemplazarán todos los datos actuales** por los de la copia.
4. Antes de reemplazar, el sistema guarda los datos actuales en `respaldos\antes-de-restaurar-….db`, por si hay que volver atrás.
5. Al terminar, vuelva a iniciar sesión. Las contraseñas son las que había en la copia. Las computadoras conectadas también deben entrar de nuevo.
6. Si la copia viene de la **copia fuera de esta computadora**, las fotos que falten se recuperan solas desde la carpeta `fotos` que está al lado del archivo.

Para recuperar todo en otra computadora, vea [Soporte y recuperación](14-soporte-y-recuperacion.md#142-la-pc-principal-se-dañó-volver-a-trabajar-en-otra-computadora).

## 11.5 Pasar el sistema a otra computadora

1. En la computadora vieja, cierre CAPS Shop.
2. Copie la carpeta completa `%APPDATA%\CAPS Shop\data` a una memoria USB. Así van la base, las fotos y los respaldos.
3. En la computadora nueva, instale CAPS Shop. Si lo abre, cierre la pantalla **Configurar esta computadora** sin configurar nada.
4. Copie la carpeta a `%APPDATA%\CAPS Shop\data` de la nueva (créela si no existe; si existe, reemplácela).
5. Abra CAPS Shop y entre con sus usuarios de siempre.

> Esto es para cambiar la **PC principal**. Si tiene computadoras conectadas, siguen funcionando: al no encontrar la principal en la dirección vieja, la buscan en la red. Si no la encuentran, escriba la nueva dirección con **Configurar esta PC** ([Varias computadoras](13-varias-computadoras.md)).
>
> Para que otra computadora trabaje con los mismos datos, **no copie la base**: conéctela a la principal. Dos copias de la base no se pueden unir después.

## 11.6 Soporte: diagnóstico y registro de errores

El programa anota los errores y los eventos importantes en la carpeta `registros\` de la carpeta de datos, con un archivo por día. Se guardan los últimos 14 días. Nunca se anotan contraseñas ni la clave de conexión.

Anota:
- el arranque;
- la red compartida;
- las copias y restauraciones;
- las caídas de conexión.

**Configuración** → **Soporte**:
- **Guardar diagnóstico…** crea un archivo de texto para enviar al soporte. Incluye:
  - la versión y el sistema;
  - el estado de la base: tamaño, integridad y cantidad de registros;
  - la red y las computadoras;
  - las últimas copias;
  - las últimas 500 líneas del registro.

  No incluye contraseñas, la clave de conexión ni datos de clientes.
- **Abrir carpeta de registros** abre la carpeta `registros\`.

En una computadora conectada, el diagnóstico muestra a qué PC principal está conectada y si la conexión funciona. Si no puede entrar, el enlace **Guardar diagnóstico** aparece en la pantalla de entrada junto a **Configurar esta PC**.

## 11.7 Actualizaciones

**Configuración → Actualizaciones** (administrador) muestra la versión instalada y si hay una más nueva. El programa busca solo al abrirse y cada 6 horas, pero **no descarga ni instala nada sin que usted lo pida**.

- **Buscar ahora:** busca en el momento. Necesita internet.
- **Instalar la versión X:**
  - descarga la versión nueva;
  - cierra el programa;
  - la instala y lo vuelve a abrir.

  Los datos no se tocan.
- Con varias computadoras, **primero la PC principal** y después las demás ([Soporte y recuperación, 14.4](14-soporte-y-recuperacion.md#144-instalar-una-versión-nueva)).

Cuando hay versión nueva, la barra de arriba muestra **Versión X disponible** (solo al administrador).
