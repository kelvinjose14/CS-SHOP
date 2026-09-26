# Documentación de CAPS Shop

Sistema de inventario, compras, ventas, caja y contabilidad para **CAPS._.SHOP · Tienda de Gorras**.

Versión documentada: **1.2.0** (26/09/2026, para el piloto en la tienda). Los cambios de cada versión están en el [CHANGELOG](../CHANGELOG.md).

## ¿Qué leer?

| Si usted es… | Empiece por |
|---|---|
| **Dueño o administrador** | [Primeros pasos](manual/01-primeros-pasos.md) → [Varias computadoras](manual/13-varias-computadoras.md) (si hay más de una) → [Rutina diaria](manual/02-rutina-diaria.md) → el resto del manual según lo que necesite |
| **Vendedor** | [Rutina diaria](manual/02-rutina-diaria.md) → [Ventas](manual/03-ventas.md) → [Caja](manual/07-caja.md) → [Clientes y cobros](manual/06-clientes-y-cobros.md) |
| **Quien decide qué se construye** | [Requisitos](producto/requisitos.md) → [Objetivos](producto/objetivos.md) → [Decisiones](producto/decisiones.md) |
| **Quien hace el piloto en la tienda** | [Plan del piloto](piloto/README.md) → [Capacitación](piloto/capacitacion.md) → [Bitácora](piloto/bitacora.md) → [Lista de aceptación](piloto/aceptacion.md) |
| **Desarrollador** | [Arquitectura](tecnico/arquitectura.md) → [Red](tecnico/red.md) → [Modelo de datos](tecnico/modelo-de-datos.md) → [Desarrollo y publicación](tecnico/desarrollo-y-publicacion.md) → [Reglas de negocio](producto/reglas-de-negocio.md) |

## Manual de uso

| # | Página | Para qué |
|---|---|---|
| 1 | [Primeros pasos](manual/01-primeros-pasos.md) | Instalar, entrar, cambiar contraseñas, configurar y cargar los datos iniciales |
| 2 | [Rutina diaria](manual/02-rutina-diaria.md) | Lo que se hace cada día, de la apertura al cierre |
| 3 | [Ventas](manual/03-ventas.md) | Cobrar, recibo, historial, devoluciones y anulaciones |
| 4 | [Inventario](manual/04-inventario.md) | Productos, fotos, códigos, ajustes, importar desde Excel, etiquetas, conteo de inventario y qué reponer |
| 5 | [Compras y proveedores](manual/05-compras-y-proveedores.md) | Registrar compras, pagar a proveedores y cuentas por pagar |
| 6 | [Clientes y cobros](manual/06-clientes-y-cobros.md) | Ventas a crédito, abonos y cuentas por cobrar |
| 7 | [Caja](manual/07-caja.md) | Abrir, entradas, depósitos al banco, retiros y cierre |
| 8 | [Gastos e ingresos](manual/08-gastos-e-ingresos.md) | Gastos, otros ingresos y aportes del dueño |
| 9 | [Contabilidad y reportes](manual/09-contabilidad-y-reportes.md) | Ganancias, flujo de dinero y los 15 reportes |
| 10 | [Usuarios y permisos](manual/10-usuarios-y-permisos.md) | Qué puede hacer cada perfil y cómo crear usuarios |
| 11 | [Configuración y respaldos](manual/11-configuracion-y-respaldos.md) | Ajustes del negocio, copias de seguridad y cambio de computadora |
| 12 | [Problemas frecuentes](manual/12-problemas-frecuentes.md) | Mensajes de error y qué hacer |
| 13 | [Varias computadoras en red](manual/13-varias-computadoras.md) | PC principal, conectar otras PCs, caja por PC y sin conexión |
| 14 | [Soporte y recuperación](manual/14-soporte-y-recuperacion.md) | Si la PC principal se daña, cambiar de PC, versiones nuevas y pedir ayuda |

## Producto: lo que queremos construir

- [Requisitos](producto/requisitos.md): todo lo pedido, numerado, con criterio de aceptación y estado actual.
- [Reglas de negocio](producto/reglas-de-negocio.md): cómo calcula el sistema costos, ganancias, créditos y caja. Es la fuente única de verdad.
- [Objetivos](producto/objetivos.md): hoja de ruta hacia producción, objetivo por objetivo, con las brechas actuales.
- [Decisiones](producto/decisiones.md): lo que ya se decidió y lo que falta decidir.

## Piloto en la tienda (O6)

- [Plan del piloto](piloto/README.md): instalación, carga de datos, una semana de uso y criterios para aceptar.
- [Capacitación](piloto/capacitacion.md): ejercicios para el dueño y el vendedor, con los resultados esperados.
- [Bitácora](piloto/bitacora.md): revisión de cada día y registro de problemas.
- [Lista de aceptación](piloto/aceptacion.md): cada requisito verificado en la tienda y el acta que firma el cliente.

## Técnico

- [Arquitectura](tecnico/arquitectura.md)
- [Modelo de datos](tecnico/modelo-de-datos.md)
- [Desarrollo y publicación](tecnico/desarrollo-y-publicacion.md)
- [Red: varias computadoras](tecnico/red.md)
- [Seguridad](tecnico/seguridad.md)
- [Auditoría de producción](tecnico/auditoria.md): hallazgos del 26/09/2026 y su estado
- [Rendimiento](tecnico/rendimiento.md)

## Convenciones de esta documentación

- Los nombres **en negrita** son textos que aparecen tal cual en la pantalla (botones, menús, campos).
- "Administrador" y "Vendedor" son los dos perfiles de usuario. Cada página del manual indica quién puede hacer cada cosa.
- Las capturas usan **datos de muestra** (productos, clientes y cifras inventados), no datos reales de la tienda.
- Montos en pesos dominicanos (RD$). El símbolo se puede cambiar en Configuración.
