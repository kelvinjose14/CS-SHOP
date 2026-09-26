# Seguridad

Revisión del objetivo O3 (25/09/2026). Cada punto indica cómo está protegido, cómo se comprueba y qué riesgo queda.

## Resumen

| Área | Estado | Se comprueba en |
|---|---|---|
| Permisos por perfil | En el núcleo, para **todas** las operaciones | `test/permissions.test.js` |
| Costos ocultos al vendedor | Ninguna respuesta al vendedor trae costos, ganancias ni márgenes (se revisan todas) | `test/auditoria.test.js` |
| Contraseñas | scrypt con sal; mínimo 8 caracteres; cambio obligatorio de la inicial, exigido también por la red; límite de intentos | `test/core.test.js`, `permissions`, `backup`, `network` |
| Red entre computadoras | **Cifrada y autenticada** con la clave de conexión; la clave no viaja | `test/network.test.js` |
| Interfaz | Aislada de Node; HTML escapado; CSP; sin navegación fuera de la app | `test/ui/controles.test.js` |
| Archivos | Nombres de fotos validados y fotos solo con sesión; respaldos validados antes de restaurar; copia externa con contraseña opcional | `network`, `migration`, `backup` |
| Registro de errores | Sin contraseñas, tokens ni clave | `test/ui/setup.test.js` |

## Hallazgos corregidos en esta revisión

1. **La clave de conexión viajaba en claro.** Iba en la cabecera `X-Caps-Key` de cada petición: cualquiera que mirara la red la aprendía y, con ella, podía conectarse. **Corregido:** la red va cifrada (sección siguiente) y la clave no se envía nunca.
2. **El cambio obligatorio de contraseña solo lo exigía la pantalla.** Una PC conectada, o un programa que imitara una, podía operar con `admin` / `admin123`. **Corregido:** el núcleo solo permite `settings.get` y `auth.changePassword` mientras la contraseña no se cambie (código `PASSWORD`).
3. **La PC principal no limitaba los intentos de contraseña**, aunque por la red sí. **Corregido:** 5 intentos fallidos por usuario y minuto, igual en los dos casos.
4. **Una base de una versión más nueva** podía abrirse con un programa viejo y dañarse. **Corregido:** se rechaza con un mensaje claro.

## Red cifrada

Diseño en `src/net/secure.js`. Decisión: DT-17 en [Decisiones](../producto/decisiones.md).

- **Llave:** llave AES-256 = `scrypt(clave, "caps-shop:" + server_id)` con N=2¹⁵ y r=8. Cuesta unos 100 ms de proceso y 32 MB de memoria por intento. La calcula una vez cada PC.
- **Mensajes:** cada pedido y cada respuesta van como `{ iv, data }` con **AES-256-GCM**. Si alguien cambia un solo byte, se rechaza.
- **Contra repetición y cambio de respuestas:**
  - Dentro del mensaje cifrado van la hora (`ts`) y un `nonce`.
  - La principal rechaza mensajes con más de **10 minutos** de diferencia: código `CLOCK`, que pide corregir la hora de Windows.
  - La respuesta repite el `nonce`, así que no se puede cambiar por la de otro pedido.
  - Una operación repetida con el mismo `request_id` devuelve el resultado guardado y no se ejecuta dos veces.
- **Prueba de la clave:** una clave incorrecta no puede descifrar. La principal responde con el código `KEY` y bloquea la IP un minuto tras 10 intentos.
- **Sin cifrar:** solo el saludo (`GET /v1/hello`) y la búsqueda por UDP. Muestran el nombre del negocio, el de la PC principal y la versión. No tienen datos de ventas, clientes ni usuarios.
- **Clave:** 10 caracteres de un alfabeto de 32, unos 50 bits. Para adivinarla a partir de tráfico grabado haría falta del orden de 2⁴⁹ intentos de scrypt: millones de años de procesador.
- **Prueba automática:** un intermediario copia todo el tráfico entre las PCs, y la prueba verifica que no aparecen la clave, las contraseñas, el token, los nombres de clientes, los teléfonos ni las operaciones.

## Permisos

- **Dónde se decide:** cada operación de `src/core/api.js` (`METHODS`) declara sus perfiles. La comprobación ocurre en el núcleo en cada llamada, venga de la pantalla o de la red.
- **Estado del usuario:** se vuelve a leer en cada llamada, así que un usuario desactivado o con otro perfil cambia al instante.
- **Prueba:** `test/permissions.test.js` recorre **todas** las operaciones:
  - el vendedor recibe `FORBIDDEN` en cada una de administrador;
  - sin sesión, todas dan `AUTH`.
- **Proceso principal:**
  - respaldos, restauración y red exigen administrador en `backend.js`;
  - guardar una foto exige administrador antes de escribir el archivo.

## Contraseñas y sesiones

- **Guardado:** scrypt con sal aleatoria por usuario y comparación en tiempo constante. Mínimo **8 caracteres** al poner o cambiar una contraseña (desde la 1.3.0; antes, 6).
- **Código de recuperación del administrador:** 16 caracteres al azar (unos 79 bits), generado solo si el administrador escribe su contraseña. Se guarda su huella scrypt en `settings._recovery`, que nunca sale del núcleo. Sirve una vez, solo en la PC principal (no hay ruta de red para usarlo), con el mismo límite de intentos que la entrada. Al usarlo se cierran las sesiones de ese usuario (`test/o5.test.js`).
- **Sesiones:** token aleatorio de 192 bits. Vence tras 12 horas sin uso y se pierde al reiniciar la principal o al restaurar una copia.

## Interfaz de Electron

- **Aislamiento:** `contextIsolation`, `sandbox` y sin `nodeIntegration`. La interfaz solo ve `window.capsApi` (`preload.js`).
- **CSP:** `script-src 'self'`, sin scripts en línea. Imágenes solo de la app, de `caps-foto:` y de `data:`.
- **Texto dinámico:** todo pasa por `html`/`esc`. También lo que llega por la red, como los nombres de otras PCs o de la principal.
- **Recibos, etiquetas y código de recuperación:** se imprimen en una ventana sin JavaScript.
- **Importar productos:** el archivo se lee en el proceso principal (sin bibliotecas externas, máximo 20 MB) y solo pasan filas de texto al núcleo, que valida cada una como si se escribiera a mano.
- **Navegación bloqueada** (1.3.0): ninguna ventana del programa, tampoco las de impresión, puede ir a otra página, abrir otra ventana ni insertar un `webview` (`lockNavigation` en `main.js`). Un intento queda en el registro.
- **CSV sin fórmulas** (1.3.0): a los textos que empiezan con `=`, `+`, `-` o `@` se les antepone `'`, para que Excel no los ejecute. Los números negativos no se tocan.

## Fotos por la red

Desde la 1.3.0, una PC conectada pide las fotos **con su sesión**: sin iniciar sesión, o con una sesión cerrada, la principal responde `AUTH`. Antes bastaba la clave de conexión (`test/network.test.js`).

## Copia externa con contraseña

Opcional (DT-35). Diseño en `src/main/encrypted.js`:
- **Llave:** `scrypt(contraseña, sal)` con los mismos parámetros que la red. La sal es aleatoria y va en cada archivo, así que en otra PC basta la contraseña.
- **Archivo** (`capsshop-AAAA-MM-DD.cifrado`): `CAPSCIF1` + sal + iv + datos con **AES-256-GCM** + etiqueta. Un byte cambiado o una contraseña equivocada se detectan: "La contraseña de la copia no es correcta, o el archivo está dañado".
- **Sin rastros en la memoria:** la copia sin cifrar se hace en la carpeta de datos de la PC, se cifra hacia la memoria y se borra. Las copias sin contraseña que había en la memoria se borran después de la primera cifrada.
- **La llave queda en `config.json` de la PC principal**, para copiar cada día sin pedir la contraseña. Quien tenga esa PC ya tiene la base sin cifrar, así que no pierde nada; lo que protege es la memoria perdida.
- **Prueba:** `test/backup.test.js` revisa que el archivo no contenga el encabezado de SQLite, nombres ni teléfonos, y que se restaure solo con la contraseña correcta.

## Riesgos que quedan

| Riesgo | Mitigación | Dónde se resuelve |
|---|---|---|
| Quien use la PC principal como administrador ve la clave de conexión | Es parte de su rol; puede cambiarla en Configuración → Red | — |
| Una PC conectada sin sesión puede volver a conectarse a otra "principal" (pantalla de entrada) | Solo aparece si hay error de conexión y no permite convertirla en principal. Una principal falsa no conoce la clave, así que no puede descifrar | — |
| Quien consiga el código de recuperación puede poner una contraseña nueva al administrador | Sirve una vez, solo en la PC principal, con límite de intentos; el administrador lo guarda fuera de la tienda. Queda en el historial | — |
| El instalador no está firmado | Aviso de Windows al instalar. Si alguien entra a la cuenta de GitHub, podría publicar una actualización falsa | Certificado (DT-18), verificación en dos pasos en GitHub y proteger `main` |
| Un depósito al banco registrado que no llegó al banco | **Depósitos por verificar** (DT-30): el administrador compara cada uno con el estado de cuenta; el Inicio avisa mientras haya pendientes | Revisarlos cada semana o cada mes |
| La base de la PC principal y sus copias diarias no van cifradas | La carpeta de datos es del usuario de Windows. La copia externa puede ir con contraseña (DT-35) | BitLocker y una cuenta de Windows con contraseña en la PC principal |
| Si se olvida la contraseña de la copia externa, esas copias no se abren | Aviso al ponerla; las copias diarias de la PC principal no llevan contraseña | Anotarla junto al código de recuperación, fuera de la tienda |
