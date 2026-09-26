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
| DT-28 | 26/09/2026 | **Corregir pagos y movimientos anulándolos** (auditoría 3.4): el administrador anula un abono, un pago a proveedor o una entrada, depósito o retiro de caja, con motivo. Nada se edita ni se borra: se registra el movimiento contrario. Los de contado se corrigen anulando la venta o compra; los de caja, solo con esa caja abierta | Sigue DT-08 (nada se borra) y permite corregir los errores de tecleo más comunes sin descuadrar la caja ni las cuentas |
| DT-29 | 26/09/2026 | **Abrir la caja con otro monto pide motivo** (auditoría 2.1): si el efectivo inicial no es lo contado al cerrar la última caja de esa PC, se escribe el motivo. La diferencia queda en la caja y en los historiales | El dinero no debe cambiar sin rastro mientras la caja está cerrada. **Revisable** |
| DT-30 | 26/09/2026 | **Depósitos al banco por verificar** (auditoría 4.2): el administrador marca cada depósito "En el banco" o "No llegó". Si no llegó, se descuenta del banco y cuenta como dinero que salió del negocio. "En el banco" se puede desmarcar; "No llegó", no | Mantiene DT-22 (el vendedor deposita) y cierra el hueco: un depósito falso aparece al comparar con el estado de cuenta. **Revisable** |
| DT-31 | 26/09/2026 | **Crédito controlado** (auditoría 2.3 y 2.4): límite de crédito opcional por cliente (0 = sin límite); a quien tiene deuda vencida no se le fía sin autorización (se puede apagar en Configuración); el vendedor no puede pasar el control y el administrador lo autoriza. Solo el administrador desactiva clientes, nunca a uno que debe, y a un cliente desactivado no se le vende | Evita seguir fiando a quien no paga, sin impedir la excepción que decide el dueño. **Revisable**: los límites los pone el dueño |
| DT-32 | 26/09/2026 | **Un producto desactivado sigue en el valor del inventario** mientras tenga existencia (auditoría 2.2). Para sacarlo, se ajusta la existencia con un motivo | La mercancía sigue en la tienda; desactivar solo la quita de la venta |
| DT-33 | 26/09/2026 | **Validaciones más estrictas** (auditoría 2.5 a 2.8): fechas que existan; gastos, ingresos, aportes, compras, pagos y saldos iniciales no futuros; vencimientos no anteriores a su fecha; textos largos rechazados, no cortados; costo de compra 0, menor que la mitad o mayor que el doble del actual, confirmado; categorías solo de Configuración | Los errores de tecleo se detectan al escribir, no en los reportes |
| DT-34 | 26/09/2026 | **CSV con el formato de la región de Windows de cada PC** (auditoría 2.10), o fijo desde Configuración: coma, o punto y coma con decimales con coma | Excel abre el CSV en columnas sin configurar nada; con República Dominicana es la coma, como antes |
| DT-35 | 26/09/2026 | **Copia externa con contraseña, opcional** (auditoría 4.3). Por defecto, sin contraseña. Con ella, las copias de la memoria van cifradas y las anteriores sin cifrar se borran. Si se olvida, esas copias no se abren | Proteger los datos si se pierde la memoria es decisión del dueño, porque una contraseña olvidada inutiliza las copias. **Revisable** |
