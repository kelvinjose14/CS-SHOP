# Desarrollo y publicación

## Requisitos

- Node.js 22.13 o superior, y npm. La base usa `node:sqlite`, incluido en Node; muestra un aviso "ExperimentalWarning" que se puede ignorar.
- Para ejecutar la aplicación en Linux sin pantalla: `xvfb-run`.
- El instalador de Windows se genera en CI (`windows-latest`). En Linux, NSIS necesita wine de 32 bits, así que no se compila ahí.

## Comandos

```bash
npm install          # dependencias (descarga Electron)
npm start            # abre la aplicación
npm test             # pruebas de lógica, migración, respaldos, permisos y red (sin ventanas)
npm run test:ui      # pruebas de interfaz con la app real (en Linux: xvfb-run -a npm run test:ui)
npm run test:perf    # rendimiento con 3 años de datos (la base se genera la primera vez)
npm run dist         # instalador de Windows en dist/ (solo en Windows)
npm run dist:dir     # aplicación empaquetada sin instalador (cualquier sistema)
```

- **Datos de desarrollo:** la aplicación guarda sus datos en `%APPDATA%\CAPS Shop\data`. Para no tocarlos al probar, use otra carpeta:

  ```bash
  CAPSSHOP_DATA=/tmp/capsshop-prueba npm start
  ```

  Una base nueva abre primero **Configurar esta computadora**. Para probar con datos de muestra, copie `test/fixtures/v1.0.0.db` como `capsshop.db` en esa carpeta: abre como PC principal.
- **Usuarios iniciales** de una base nueva: `admin` / `admin123` y `vendedor` / `vendedor123`. Se exige cambiar la contraseña al entrar.

## Pruebas

**`npm test`** (64 pruebas, sin ventanas):

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `test/core.test.js` | 14 | Reglas del negocio a través de `createApi` (detalle abajo) |
| `test/migration.test.js` | 4 | Abrir la base de la 1.0.0 (`test/fixtures/v1.0.0.db`) sin perder datos; migración que falla sin dejar nada a medias; rechazo de una base más nueva; respaldos válidos |
| `test/backup.test.js` | 8 | Copia diaria y recorte a 30, copia con WAL pendiente, restaurar, copia ilegible, permisos y límite de intentos en la PC principal; **copia fuera de la PC** con fotos, memoria desconectada, aviso de 7 días y restaurar trayendo las fotos |
| `test/updates.test.js` | 2 | Actualizaciones: avisa sin descargar, instala solo cuando se pide; sin versión nueva, sin internet y en desarrollo |
| `test/permissions.test.js` | 1 | Todas las operaciones: el vendedor recibe "sin permiso" en las de administrador; sin sesión, nada; con la contraseña inicial, solo cambiarla |
| `test/terminals.test.js` | 3 | Caja por computadora, sesiones independientes, renombrar y desactivar PCs |
| `test/network.test.js` | 12 | Servidor real: clave, versión, permisos, 40 ventas simultáneas desde 2 PCs, reintentos, fotos, búsqueda, sin conexión, corte a mitad de una operación, tráfico cifrado, mensaje alterado y hora desfasada |
| `test/log.test.js` | 1 | Registro de errores: pila, 14 días, últimas líneas |
| `test/o5.test.js` | 6 | Saldos iniciales, depósito al banco y retiro, aportes del dueño, precio obligatorio, historial en español y código de recuperación |
| `test/import.test.js` | 5 | Leer CSV y Excel reales, importar con vista previa y errores por fila, Code 128 e impresora de recibos |
| `test/release.test.js` | 3 | Notas de la versión desde el CHANGELOG y etiqueta igual a `package.json` |
| `test/o6.test.js` | 5 | Conteo de inventario (vista previa, aplicar, ventas durante el conteo, permisos), la lista de aceptación igual a los requisitos y los números de los ejercicios de la capacitación |

`test/helpers.js` simula una computadora que guarda su token de sesión y cambia la contraseña inicial.

**`npm run test:ui`** (`test/ui/`): abre la aplicación real con Playwright (`playwright-core`, dependencia de desarrollo) y una carpeta de datos temporal con la base de muestra y sus fotos. Cualquier error de la página o de la consola hace fallar la prueba.

| Archivo | Qué recorre |
|---|---|
| `screens.test.js` | Todas las pantallas y los 15 reportes como administrador, y las del vendedor |
| `flows.test.js` | Venta con lector y cambio, compra a crédito, abono, devolución, anulación y cierre de caja con faltante, comprobando los números |
| `network.test.js` | Dos instancias: principal y conectada, venta, caja de la otra PC, fotos por la red, sin conexión y reconexión |
| `setup.test.js` | Instalación nueva en la ventana más pequeña; cambio obligatorio de contraseña; copia y restauración; diagnóstico sin secretos; fotos que faltan; copia fuera de la PC y aviso del Inicio |
| `o5.test.js` | Depósito al banco, saldo inicial, aportes, importar desde CSV, etiquetas, impresora de recibos, historial en español y recuperar la contraseña con el código |
| `o6.test.js` | Conteo de inventario con el lector y a mano, borrador que sobrevive al salir, revisar y aplicar |
| `installed.test.js` | El programa **instalado**: se configura, vende, conserva los datos y busca actualizaciones. Solo con `CAPSSHOP_EXE` (la usa el CI de Windows) |

**`npm run test:perf`:** ver [Rendimiento](rendimiento.md).

- **Qué cubre `core.test.js`** (cada prueba crea una base temporal):
  - Permisos del vendedor.
  - Compras y costo promedio.
  - Ventas con descuento y cambio.
  - Crédito y abonos.
  - Devoluciones y anulaciones.
  - Existencia insuficiente.
  - Caja y ajustes.
  - Historial de precios.
  - Dashboard y flujo de dinero.
  - Persistencia en disco.
  - Campos vacíos.
  - Límites del vendedor.
  - Anulación de compra.
- **Qué queda a mano:** la impresión en una impresora real, y Windows 10/11 de escritorio (el CI usa Windows Server). Los dos se prueban en el piloto (O6).

**Regla:** toda regla de negocio nueva o cambiada lleva su prueba y su actualización en [Reglas de negocio](../producto/reglas-de-negocio.md).

## Cómo agregar una operación

1. Escriba la función en el servicio que corresponda (`src/core/services/*.js`) con la firma `(ctx, params)`:
   - `ctx.db` es la base de datos y `ctx.user`, el usuario de la sesión.
   - Valide con los ayudantes de `util.js` (`money`, `int`, `text`, `date`, `method`).
   - Lance `AppError` con un mensaje en español para el usuario.
   - Si escribe, use `ctx.db.tx(() => …)` y registre en el historial con `audit()`.
   - Si mueve existencia, use `changeStock()`. Si mueve dinero, use `ledger()`.
2. Regístrela en la tabla `METHODS` de `src/core/api.js` con sus roles (`ALL` o `ADMIN`).
3. Úsela desde la interfaz con `api('modulo.accion', params)` (`renderer/js/lib.js`). Funciona igual en la PC principal y en las conectadas: no hay que tocar la red.
   - Si necesita saber la computadora, use `ctx.terminal`.
4. Agregue su prueba en `test/core.test.js`.
5. Si cambia la base, agregue una migración **al final** de `MIGRATIONS` en `schema.js`.

## Probar varias computadoras en una sola máquina

Cada instancia necesita su propia carpeta de datos. `CAPSSHOP_DATA` también separa el bloqueo de "una sola instancia".

```bash
# PC principal con datos de muestra
mkdir -p /tmp/pc-a && cp test/fixtures/v1.0.0.db /tmp/pc-a/capsshop.db
CAPSSHOP_DATA=/tmp/pc-a npm start      # Configuración → Red → Permitir que otras computadoras se conecten

# PC conectada (otra terminal)
CAPSSHOP_DATA=/tmp/pc-b npm start      # Conectar a la PC principal → Buscar → clave → nombre
```

- En Linux sin pantalla, anteponga `xvfb-run -a`.
- Con `CAPSSHOP_NO_RELAUNCH=1`, al guardar la configuración el programa se cierra en lugar de reiniciarse. Sirve para automatizar la prueba con Playwright.
- Usuarios de la base de muestra: `admin` / `admin123` y `vendedor` / `vendedor123`.

**Recorrido mínimo antes de unir un cambio de red:**
1. La conectada vende.
2. La principal ve la venta, la existencia y la caja de la otra PC.
3. Se cierra la principal: la conectada muestra **Sin conexión**.
4. Se abre la principal: la conectada se recupera y pide entrar de nuevo.

## Integración continua

`.github/workflows/build-windows.yml` ("Instalador Windows") tiene dos trabajos:

| Trabajo | Qué hace |
|---|---|
| `linux` (`ubuntu-latest`) | `npm test`, `xvfb-run npm run test:ui` y `npm run test:perf` |
| `build` (`windows-latest`) | `npm test` y `npm run test:ui`. Luego construye el instalador (artefacto descargable) y lo **instala de verdad**: instalación silenciosa (`/S`), prueba del programa instalado, reinstalación encima conservando los datos y desinstalación que no borra los datos |

| Evento | Qué corre |
|---|---|
| Pull request y ejecución manual (Actions → Run workflow) | Los dos trabajos |
| Etiqueta `v*`, o **Run workflow** en `main` con **Publicar** | Lo mismo y, además, publica la versión en GitHub Releases con el instalador, `latest.yml`, el `.blockmap` y las notas del CHANGELOG |

No se une un pull request con CI en rojo.

## Publicar una versión

Se usa versionado semántico:
- **MAYOR:** cambio que exige migrar datos o reinstalar de forma distinta.
- **MENOR:** funciones nuevas.
- **PARCHE:** correcciones.

1. En un pull request:
   - Suba `version` en `package.json`. El nombre del instalador sale de ahí.
   - Mueva las notas de **Sin publicar** a la nueva versión en `CHANGELOG.md`, con la fecha.
2. Una el pull request a `main`.
3. Publique, de una de estas formas:
   - **Desde GitHub Actions (la más simple):** **Actions** → **Instalador Windows** → **Run workflow** → **Branch: main**, marque **Publicar** → **Run workflow**. El CI toma la versión de `package.json`, crea la etiqueta `vX.Y.Z` sobre ese commit de `main` y publica. Si esa versión ya estaba publicada, falla sin tocar nada.
   - **Desde la terminal:** `git fetch origin main && git tag vX.Y.Z origin/main && git push origin vX.Y.Z`.
   - **En GitHub** → **Releases** → **Draft a new release**: **Choose a tag** `vX.Y.Z` con **Create new tag on publish**, **Target: `main`** (revíselo siempre: si la rama principal del repositorio no es `main`, GitHub propone otra) y **Publish release**.
4. En unos 5 minutos, el CI crea o completa la versión **CAPS Shop vX.Y.Z**:
   - la descripción son las notas de esa versión en `CHANGELOG.md`, sacadas por `scripts/notas-version.js`. Si la etiqueta no coincide con `package.json` o el CHANGELOG no tiene la sección, el CI falla antes de construir nada;
   - el `.exe`;
   - `latest.yml` y el `.blockmap`, que usan las PCs instaladas para enterarse de la versión nueva ([Actualizaciones](#actualizaciones)).
5. Verifique:
   - que el instalador, `latest.yml` y el `.blockmap` estén adjuntos;
   - que se instale sobre la versión anterior sin perder datos. Los datos viven en `%APPDATA%`, fuera de la carpeta del programa.
   - **con varias PCs:** que todas tengan la misma versión. La principal rechaza a las de otra versión.

> **Rama por defecto:** hoy la rama por defecto del repositorio es `claude/lucid-tesla-gqar2k`, y por eso GitHub propone esa rama como destino. La versión 1.0.0 quedó así, con código idéntico a `main`. **El dueño debe cambiarla a `main`** en GitHub → Settings → General → Default branch. Hasta entonces, elija `main` a mano en **Target**.

## Actualizaciones

- **Cómo funciona:** el programa instalado usa `electron-updater` (`src/main/updates.js`) con GitHub Releases como origen (`build.publish` en `package.json`; el repositorio es público).
  - Busca al abrir y cada 6 horas.
  - **No descarga ni instala** hasta que el administrador pulsa **Instalar** (DT-19).
- **Qué necesita:** que cada versión tenga adjuntos `latest.yml` y el `.blockmap`. El CI los sube.
- **Borradores y prerelease:** una versión en borrador o marcada como prerelease no se ofrece.
- **Dónde está desactivado:** en desarrollo (`npm start`) y en las pruebas, la sección muestra "Las actualizaciones funcionan en el programa instalado". `CAPSSHOP_NO_UPDATES=1` las desactiva también en el programa instalado.
- **Pruebas:**
  - `test/updates.test.js`, con un actualizador falso;
  - `test/ui/installed.test.js`: el programa instalado busca actualizaciones sin fallar.

## Firma del instalador

Hoy el instalador **no** está firmado (DT-18), así que Windows muestra "Windows protegió su PC". El CI ya está preparado:

1. **Compre un certificado de firma de código.** Opciones:
   - **Azure Trusted Signing**: unos US$10 al mes. Pide verificar la empresa. Usa otra configuración en `electron-builder` (`azureSignOptions`).
   - **Certificado OV** de una autoridad como Sectigo o DigiCert: unos US$200–400 al año. Hoy se entregan en un token USB o en un servicio en la nube; confirme con el vendedor que permite firmar desde CI.
2. **Con un certificado en archivo `.pfx`:**
   - conviértalo a base64: `base64 -w0 certificado.pfx`;
   - cárguelo en GitHub → Settings → Secrets and variables → Actions:
     - `WIN_CSC_LINK`: el base64;
     - `WIN_CSC_KEY_PASSWORD`: la contraseña.
3. El paso **Construir instalador** del CI los pasa a `electron-builder` como `CSC_LINK` y `CSC_KEY_PASSWORD`, y el `.exe` sale firmado. **Sin los secretos, sale sin firmar, como hoy.**
4. **Verificación:** clic derecho en el `.exe` → Propiedades → **Firmas digitales**. Al instalar ya no debe aparecer "Windows protegió su PC". Con certificados OV nuevos, el aviso puede seguir unos días, hasta que el certificado gane reputación.

## Convenciones

- **Idioma:** español en la interfaz, los mensajes, los comentarios del código y la documentación.
- **Estilo:** siga el del archivo que edita. JavaScript con `'use strict'`, sin framework en la interfaz.
- **Formularios:** los textos de pantalla y los mensajes de error se documentan en el manual. Si cambian, actualice la página correspondiente de `docs/manual/`.
- **Capturas del manual:** `docs/manual/img/`, 1280×800 en JPEG, tomadas de la aplicación con datos de muestra.
