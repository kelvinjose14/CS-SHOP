# Decisiones

Registro corto de lo que se decidió y de lo que falta decidir.
- Una decisión pendiente (**DP**) se resuelve antes de empezar el objetivo que la necesita.
- Al resolverla, se mueve a **Tomadas** (**DT**) con su fecha.

## Pendientes

| ID | Pregunta | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| DP-04 | ¿Se compra un certificado de firma de código? | Sí (costo anual; se quita la advertencia de Windows) / No | Sí, antes del piloto | O4 |
| DP-05 | Los aportes de capital del dueño, ¿cuentan como otros ingresos? | Sí (suman a la ganancia neta, como hoy) / No, se registran aparte como capital | Registrarlos aparte, para que la ganancia refleje solo la operación | O5 |
| DP-06 | ¿Qué impresora de tickets se usará? | Marca, modelo y ancho (58 u 80 mm) | Definir el modelo real antes de programar la impresión directa | O5 (RF-NUE-03) |
| DP-07 | ¿El vendedor puede hacer retiros de caja? | Sí (como hoy) / Solo el administrador | Solo depósitos al banco, con descripción obligatoria | O5 (RF-NUE-02) |
| DP-08 | ¿Se aprueban los requisitos nuevos RF-NUE-01 a 09? | Aprobar todos / algunos / ninguno | Aprobar todos: son necesarios para operar | O5 |
| DP-09 | ¿El dueño quiere ver datos desde fuera de la tienda o desde el celular? | Sí / No / Más adelante | Más adelante, sobre el modelo de DT-13 | Futuro |

## Tomadas

| ID | Fecha | Decisión | Motivo |
|---|---|---|---|
| DT-01 | 25/09/2026 | Aplicación de escritorio para Windows (Electron) que funciona sin internet | La tienda debe operar aunque no haya internet |
| DT-02 | 25/09/2026 | Base de datos SQLite local en memoria (sql.js), guardada en un archivo | Sin dependencias nativas, fácil de instalar. **Reemplazada por DT-16** |
| DT-03 | 25/09/2026 | Costo de mercancía por **costo promedio ponderado** | La ganancia real no depende del orden de compra |
| DT-04 | 25/09/2026 | Las compras de mercancía no son gasto; pasan a costo al venderse | Así la ganancia de cada mes es la real |
| DT-05 | 25/09/2026 | Ganancia neta = ganancia bruta − gastos + otros ingresos | Refleja todo el dinero que gana el negocio (ver DP-05) |
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
