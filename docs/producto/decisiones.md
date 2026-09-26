# Decisiones

Registro corto de lo que se decidió y de lo que falta decidir.
- Una decisión pendiente (**DP**) se resuelve antes de empezar el objetivo que la necesita.
- Al resolverla, se mueve a **Tomadas** (**DT**) con su fecha.

## Pendientes

| ID | Pregunta | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| DP-09 | ¿El dueño quiere ver datos desde fuera de la tienda o desde el celular? | Sí / No / Más adelante | Más adelante, sobre el modelo de DT-13 | Futuro |

## Tomadas

| ID | Fecha | Decisión | Motivo |
|---|---|---|---|
| DT-01 | 25/09/2026 | Aplicación de escritorio para Windows (Electron) que funciona sin internet | La tienda debe operar aunque no haya internet |
| DT-02 | 25/09/2026 | Base de datos SQLite local en memoria (sql.js), guardada en un archivo | Sin dependencias nativas, fácil de instalar. **Reemplazada por DT-16** |
| DT-03 | 25/09/2026 | Costo de mercancía por **costo promedio ponderado** | La ganancia real no depende del orden de compra |
| DT-04 | 25/09/2026 | Las compras de mercancía no son gasto; pasan a costo al venderse | Así la ganancia de cada mes es la real |
| DT-05 | 25/09/2026 | Ganancia neta = ganancia bruta − gastos + otros ingresos | Refleja todo el dinero que gana el negocio. Los aportes del dueño no son otros ingresos (DT-21) |
| DT-06 | 25/09/2026 | Sin facturación fiscal ni NCF | Pedido del cliente |
| DT-07 | 25/09/2026 | Los permisos se comprueban en el núcleo, no solo en la pantalla | Seguridad: el vendedor no puede saltárselos |
| DT-08 | 25/09/2026 | Nada se borra: productos y clientes se desactivan; ventas, compras y gastos se anulan con motivo | Trazabilidad completa |
| DT-09 | 25/09/2026 | Instalador e historial de versiones en GitHub Releases, generados por CI | Sin compilar a mano |
| DT-10 | 25/09/2026 | Documentación en `docs/` del repositorio, en Markdown y en español | Versionada junto al código |
| DT-11 | 25/09/2026 | Instalación objetivo en la tienda: **varias computadoras en red** | Indicado por el cliente; origina O2 |
| DT-12 | 25/09/2026 | Trabajo por objetivos (O1…O6), uno a la vez | Pedido del cliente |
| DT-13 | 25/09/2026 | Varias PCs: **una PC principal guarda los datos y las demás se conectan por la red local** (opción A de la antigua DP-01). Descartadas: servidor en la nube (internet y costo mensual) y base compartida en carpeta de red (se corrompe) | Elegido por el dueño. Sin internet ni costo mensual |
| DT-14 | 25/09/2026 | **Una caja por computadora**: cada PC abre, cobra y cierra su caja; el dashboard suma todas (antigua DP-02) | Elegido por el dueño: cada PC tiene su gaveta |
| DT-15 | 25/09/2026 | **Sin la PC principal, las demás no trabajan**: muestran "Sin conexión" y reintentan. La principal es la que siempre está encendida y se elige al instalar (antigua DP-03) | El dueño no tuvo preferencia y se aplicó la recomendación: es lo más seguro y nunca hay dos versiones de la existencia o la caja. Se puede revisar si hace falta |
| DT-16 | 25/09/2026 | Base de datos con **`node:sqlite`** (SQLite incluido en Node y Electron) en modo WAL, en lugar de sql.js | Sin módulos nativos; escribe solo lo que cambia; abre la misma base de la 1.0.0 |
| DT-17 | 25/09/2026 | **Red cifrada con la clave de conexión** (AES-256-GCM con llave derivada por scrypt), en lugar de HTTPS con certificados | Nadie en la tienda tendría que crear ni renovar certificados. La clave, que ya se escribía al conectar cada PC, deja de viajar por la red y protege todo el tráfico ([Seguridad](../tecnico/seguridad.md#red-cifrada)) |
| DT-18 | 25/09/2026 | **Certificado de firma de código: todavía no** (antigua DP-04). El CI queda listo: firma solo si se cargan los secretos `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` | Decisión del dueño. Mientras tanto, Windows muestra "Windows protegió su PC" al instalar |
| DT-19 | 25/09/2026 | **Actualizaciones con aviso**: el programa busca versiones nuevas en GitHub Releases, pero descargar e instalar lo decide el administrador en cada PC | Elegido por el dueño: nunca se interrumpe una venta con una instalación |
| DT-20 | 25/09/2026 | **Copia fuera de la PC en una memoria USB o en la carpeta de OneDrive o Google Drive**, diaria y con las fotos, desde la PC principal | Elegido por el dueño; sin servicios nuevos ni costo |
| DT-21 | 26/09/2026 | **Los aportes de capital del dueño se registran aparte** (Gastos → Aportes del dueño): entran al flujo de dinero, pero **no suman a la ganancia** (antigua DP-05). Reemplaza la nota de DT-05 | Recomendación aplicada con el permiso del dueño; **revisable**. La ganancia refleja solo lo que produce la tienda |
| DT-22 | 26/09/2026 | **El vendedor no hace retiros de caja**: solo registra **depósitos al banco**, con descripción obligatoria. El retiro (dinero que sale del negocio) es del administrador. El depósito no es salida del negocio: el efectivo pasa al banco (antigua DP-07) | Recomendación aplicada con el permiso del dueño; **revisable** |
| DT-23 | 26/09/2026 | **Impresión directa del recibo configurable en cada PC**: se elige la impresora de Windows y el ancho (58 u 80 mm), sin fijar marca ni modelo (antigua DP-06) | Todavía no se conoce la impresora real; así sirve cualquiera. Se verifica en el piloto (O6) |
| DT-24 | 26/09/2026 | **Se aprueban los requisitos nuevos RF-NUE-01 a 09** (antigua DP-08) | Recomendación aplicada con el permiso del dueño: son necesarios para operar. **Revisable** |
| DT-25 | 26/09/2026 | **Conteo de inventario** de muchos productos a la vez para el piloto y la operación (RF-NUE-10): hoja imprimible, lector o a mano, y todas las diferencias con un solo motivo | Elegido por el dueño: la revisión diaria del piloto no es práctica producto por producto |
| DT-26 | 26/09/2026 | **Versión 1.1.0 para el piloto**; las correcciones del piloto salen como 1.1.x o 1.2.0 con aviso, y al firmar la aceptación se publica la **2.0.0** | Elegido por el dueño. Así el piloto también prueba las actualizaciones |
| DT-27 | 26/09/2026 | **Publicar desde GitHub Actions** (Run workflow en `main` con **Publicar**): el CI crea la etiqueta con la versión de `package.json` | Se puede publicar sin terminal. Crear la etiqueta a mano sigue funcionando |
