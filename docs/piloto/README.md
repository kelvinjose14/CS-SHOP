# Plan del piloto en la tienda (O6)

**Meta:** que el dueño use CAPS Shop en la tienda, con los datos reales, durante **una semana**, y lo acepte formalmente con la [lista de aceptación](aceptacion.md). Al firmarla se publica la versión **2.0.0** ([Objetivos, O6](../producto/objetivos.md#o6-piloto-en-tienda-y-aceptación)).

| Documento | Para qué |
|---|---|
| Este plan | Qué se hace cada día y quién lo hace |
| [Capacitación](capacitacion.md) | Las dos sesiones: dueño y vendedor, con ejercicios |
| [Bitácora](bitacora.md) | La revisión de cada día y el registro de problemas |
| [Lista de aceptación](aceptacion.md) | Cada requisito verificado en la tienda y el acta que firma el cliente |

## Quién hace qué

| Rol | Quién | Qué hace |
|---|---|---|
| **Dueño** (administrador) | ______________________ | Carga los datos con ayuda, revisa la caja y el inventario cada día, llena la lista de aceptación y la firma |
| **Vendedor** | ______________________ | Vende, cobra, abre y cierra su caja, avisa cualquier problema |
| **Responsable del sistema** | ______________________ | Instala, capacita, revisa la bitácora cada día, corrige y publica las correcciones |

## Antes de ir a la tienda

- [ ] Versión publicada para el piloto (1.2.0 o una posterior, con el **Conteo**) en [Releases](https://github.com/kelvinjose14/CS-SHOP/releases/latest), con el instalador y `latest.yml`.
- [ ] Una memoria USB para la copia fuera de la PC. Si prefiere la nube: la carpeta de OneDrive o Google Drive ya instalada en la PC principal.
- [ ] Lista de productos del dueño en Excel, con al menos **Nombre** y **Precio detalle** ([plantilla](../manual/04-inventario.md#47-importar-productos-desde-excel-administrador)). Si no existe, se arma en la tienda con la **hoja de conteo**.
- [ ] Lista de proveedores y clientes, con lo que se les debe o deben (**saldos iniciales**).
- [ ] Datos de la impresora de tickets (marca, modelo y ancho: 58 u 80 mm) y su controlador de Windows descargado.
- [ ] Lista de aceptación y bitácora impresas.
- [ ] Decidir qué PC será la **principal**: la que siempre está encendida (DT-15).

## Día 0: instalación y carga de datos

Tiempo estimado: una tarde, con la tienda cerrada o con poco movimiento.

| # | Paso | Dónde está explicado | Hecho |
|---|---|---|:-:|
| 1 | Instalar en la **PC principal** y configurarla como principal | [Manual 1.2](../manual/01-primeros-pasos.md#12-instalar) | ☐ |
| 2 | **Capacitación** del dueño y del vendedor, con datos de práctica | [Capacitación](capacitacion.md) | ☐ |
| 3 | **Borrar los datos de práctica** y configurar la PC principal de nuevo. Se hace antes de conectar las demás PCs y de elegir la impresora, porque se borran junto con la práctica | [Capacitación, al terminar](capacitacion.md#al-terminar-borrar-los-datos-de-práctica) | ☐ |
| 4 | Cambiar las contraseñas de `admin` y `vendedor`. Anotar la de `admin` en un lugar seguro | [Manual 1.3](../manual/01-primeros-pasos.md#13-entrar-por-primera-vez) | ☐ |
| 5 | Configuración del negocio: nombre, teléfono, dirección, pie del recibo | [Manual 1.4](../manual/01-primeros-pasos.md#14-configurar-el-negocio) | ☐ |
| 6 | **Código de recuperación**: generarlo, imprimirlo y dárselo al dueño para guardarlo fuera de la tienda | [Manual 10.4](../manual/10-usuarios-y-permisos.md#código-de-recuperación) | ☐ |
| 7 | **Copia fuera de la PC**: elegir la memoria USB o la carpeta de la nube y pulsar **Copiar ahora** | [Manual 11.3](../manual/11-configuracion-y-respaldos.md#113-copias-de-seguridad) | ☐ |
| 8 | Red: activar **Permitir que otras computadoras se conecten** y anotar la clave. Instalar y conectar cada PC, con un nombre por PC ("Caja 1", "Caja 2") | [Manual 13](../manual/13-varias-computadoras.md) | ☐ |
| 9 | En cada PC con impresora: instalar el controlador, elegirla en **Impresora de recibos de esta PC** y pulsar **Imprimir prueba** | [Manual 11.8](../manual/11-configuracion-y-respaldos.md#118-impresora-de-recibos-de-esta-pc) | ☐ |
| 10 | Probar el **lector de código de barras** en **Nueva venta** en cada PC (sin cobrar) | [Manual 3.1](../manual/03-ventas.md#31-hacer-una-venta) | ☐ |
| 11 | Proveedores | [Manual 5.1](../manual/05-compras-y-proveedores.md#51-proveedores) | ☐ |
| 12 | Productos: **Importar** desde Excel, o uno por uno | [Manual 4.7](../manual/04-inventario.md#47-importar-productos-desde-excel-administrador) | ☐ |
| 13 | Existencias: la columna **Existencia** al importar o, mejor, un **conteo de inventario** de todo lo que hay en la tienda | [Manual 4.9](../manual/04-inventario.md#49-conteo-de-inventario-administrador) | ☐ |
| 14 | Etiquetas para las gorras que no traen código de barras | [Manual 4.8](../manual/04-inventario.md#48-etiquetas-de-código-de-barras) | ☐ |
| 15 | Clientes y **saldos iniciales** de clientes y proveedores | [Manual 6.1](../manual/06-clientes-y-cobros.md#saldo-inicial-administrador) | ☐ |
| 16 | Revisar en **Inicio**: productos, unidades, valor del inventario, cuentas por cobrar y por pagar. Deben coincidir con lo que el dueño sabe | — | ☐ |
| 17 | **Copiar ahora** en la copia fuera de la PC | — | ☐ |

## Día 1: capacitación del vendedor y primer día de uso

1. Repaso de 10 minutos con el vendedor antes de abrir: vender con el lector, abrir y cerrar la caja, y qué hacer si algo falla ([Capacitación](capacitacion.md#sesión-2-vendedor)).
2. Cada PC abre su caja con el efectivo real.
3. Se trabaja normal. El responsable del sistema está presente o disponible por teléfono.
4. Al cerrar: revisión del día en la [bitácora](bitacora.md).

## Días 2 a 7: uso real con revisión diaria

- **Cada día**, al cerrar, el dueño llena la revisión del día en la [bitácora](bitacora.md):
  - cada caja cuadra;
  - las ventas del día coinciden con lo que se vendió;
  - el conteo de 10 productos al azar coincide;
  - la copia fuera de la PC se hizo.
- **Cualquier problema** se anota en la bitácora con la hora y la PC. Si sale un mensaje de error: **Configuración → Soporte → Guardar diagnóstico** y enviar el archivo.
- **Durante la semana**, el dueño va marcando la [lista de aceptación](aceptacion.md). Casi todo se prueba con el uso normal; lo que no, se prueba a propósito, por ejemplo una devolución o un saldo inicial.
- El **día 7**: conteo de inventario completo y cierre de todas las cajas.

## Correcciones durante el piloto

- El responsable del sistema revisa la bitácora cada día.
- Cada problema confirmado se corrige en un pull request, con su prueba automática.
- Se publica como versión de corrección (1.1.1, 1.1.2…). El administrador la instala con **Instalar**:
  - primero en la PC principal;
  - después en las demás ([Manual 14.4](../manual/14-soporte-y-recuperacion.md#144-instalar-una-versión-nueva)).
- Esto prueba también que las actualizaciones llegan a todas las PCs (criterio pendiente de O4).
- Si un problema **impide vender**:
  1. se sigue vendiendo en papel;
  2. se registra en el sistema cuando se resuelva;
  3. se anota en la bitácora.

## Criterios para aceptar

El piloto termina bien cuando se cumplen todos:

| Criterio | Cómo se comprueba |
|---|---|
| Una semana completa de ventas reales en el sistema | Reportes → Ventas del período |
| Las cajas cuadran o sus diferencias están explicadas | Historial de cierres y bitácora |
| El conteo completo del día 7 coincide con el sistema, o las diferencias están explicadas | Conteo de inventario e historial |
| La copia fuera de la PC se hizo cada día | Configuración → Copias de seguridad y bitácora |
| Ningún problema abierto que impida trabajar | Bitácora |
| La lista de aceptación está completa y firmada | [Acta de aceptación](aceptacion.md#acta-de-aceptación) |

Los requisitos marcados **No** que no impiden trabajar pueden quedar como observaciones con fecha de corrección. Un ejemplo es la firma del instalador (RNF-09), que depende de comprar el certificado.

## Al terminar

1. Actualizar [Requisitos](../producto/requisitos.md) con lo verificado en la tienda. Por ejemplo, RNF-03 (Windows 10/11) y RF-ENT-01 (instalador en una PC real).
2. Mover las notas a la versión **2.0.0** en el CHANGELOG, subir la versión en `package.json` y publicarla ([Desarrollo y publicación](../tecnico/desarrollo-y-publicacion.md#publicar-una-versión)).
3. Guardar el acta firmada: escaneada, junto a este plan, o en un lugar acordado con el cliente.
4. Marcar O6 como hecho en [Objetivos](../producto/objetivos.md).
