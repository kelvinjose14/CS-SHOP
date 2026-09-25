# Desarrollo y publicación

## Requisitos

- Node.js 22 y npm.
- Para ejecutar la aplicación en Linux sin pantalla: `xvfb-run`.
- El instalador de Windows se genera en CI (`windows-latest`). En Linux, NSIS necesita wine de 32 bits, así que no se compila ahí.

## Comandos

```bash
npm install          # dependencias (descarga Electron)
npm start            # abre la aplicación
npm test             # pruebas del núcleo: node --test test/*.test.js
npm run dist         # instalador de Windows en dist/ (solo en Windows)
npm run dist:dir     # aplicación empaquetada sin instalador (cualquier sistema)
```

- **Datos de desarrollo:** la aplicación guarda sus datos en `%APPDATA%\CAPS Shop\data`. Para no tocarlos al probar, use otra carpeta:

  ```bash
  CAPSSHOP_DATA=/tmp/capsshop-prueba npm start
  ```
- **Usuarios iniciales** de una base nueva: `admin` / `admin123` y `vendedor` / `vendedor123`. Se exige cambiar la contraseña al entrar.

## Pruebas

- **`test/core.test.js`:** 14 pruebas del núcleo. Cada una crea una base temporal y ejercita el sistema real a través de `createApi`.
- **Qué cubren:**
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
- **Qué no cubren:** la interfaz y el proceso principal (IPC, archivos, respaldos e impresión). Hoy se prueban a mano. Automatizarlo es parte de [O3](../producto/objetivos.md#o3-calidad-para-producción).

**Regla:** toda regla de negocio nueva o cambiada lleva su prueba y su actualización en [Reglas de negocio](../producto/reglas-de-negocio.md).

## Cómo agregar una operación

1. Escriba la función en el servicio que corresponda (`src/core/services/*.js`) con la firma `(ctx, params)`:
   - `ctx.db` es la base de datos y `ctx.user`, el usuario de la sesión.
   - Valide con los ayudantes de `util.js` (`money`, `int`, `text`, `date`, `method`).
   - Lance `AppError` con un mensaje en español para el usuario.
   - Si escribe, use `ctx.db.tx(() => …)` y registre en el historial con `audit()`.
   - Si mueve existencia, use `changeStock()`. Si mueve dinero, use `ledger()`.
2. Regístrela en la tabla `METHODS` de `src/core/api.js` con sus roles (`ALL` o `ADMIN`).
3. Úsela desde la interfaz con `api('modulo.accion', params)` (`renderer/js/lib.js`).
4. Agregue su prueba en `test/core.test.js`.
5. Si cambia la base, agregue una migración **al final** de `MIGRATIONS` en `schema.js`.

## Integración continua

`.github/workflows/build-windows.yml` ("Instalador Windows") corre en `windows-latest`:

| Evento | Qué hace |
|---|---|
| Pull request | `npm ci`, `npm test` e instalador como artefacto descargable |
| Ejecución manual (Actions → Run workflow) | Lo mismo |
| Etiqueta `v*` (al publicar una versión) | Lo mismo y, además, adjunta `CAPS-Shop-Setup-<versión>.exe` a la versión en GitHub Releases |

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
3. En GitHub → **Releases** → **Draft a new release**:
   - **Choose a tag:** `vX.Y.Z`, con **Create new tag on publish**.
   - **Target: `main`**. Revíselo siempre: si la rama principal del repositorio no es `main`, GitHub propone otra.
   - Título `CAPS Shop X.Y.Z` y, como descripción, las notas del CHANGELOG.
   - **Publish release**.
4. El flujo de CI arranca con la etiqueta. En unos 4 minutos, el `.exe` aparece adjunto a la versión.
5. Verifique:
   - que el instalador esté adjunto;
   - que se instale sobre la versión anterior sin perder datos. Los datos viven en `%APPDATA%`, fuera de la carpeta del programa.

> La versión 1.0.0 quedó con la etiqueta en la rama de trabajo (`claude/lucid-tesla-gqar2k`), con código idéntico a `main`. Las siguientes deben apuntar a `main`.

## Convenciones

- **Idioma:** español en la interfaz, los mensajes, los comentarios del código y la documentación.
- **Estilo:** siga el del archivo que edita. JavaScript con `'use strict'`, sin framework en la interfaz.
- **Formularios:** los textos de pantalla y los mensajes de error se documentan en el manual. Si cambian, actualice la página correspondiente de `docs/manual/`.
- **Capturas del manual:** `docs/manual/img/`, 1280×800 en JPEG, tomadas de la aplicación con datos de muestra.
