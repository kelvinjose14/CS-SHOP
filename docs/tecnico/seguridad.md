# Seguridad

Revisión del objetivo O3 (25/09/2026). Cada punto indica cómo está protegido, cómo se comprueba y qué riesgo queda.

## Resumen

| Área | Estado | Se comprueba en |
|---|---|---|
| Permisos por perfil | En el núcleo, para **todas** las operaciones | `test/permissions.test.js` |
| Costos ocultos al vendedor | Ninguna respuesta al vendedor trae costos, ganancias ni márgenes (se revisan todas) | `test/auditoria.test.js` |
| Contraseñas | scrypt con sal; cambio obligatorio de la inicial, exigido también por la red; límite de intentos | `test/core.test.js`, `permissions`, `backup`, `network` |
| Red entre computadoras | **Cifrada y autenticada** con la clave de conexión; la clave no viaja | `test/network.test.js` |
| Interfaz | Aislada de Node; HTML escapado; CSP | Revisión de código |
| Archivos | Nombres de fotos validados; respaldos validados antes de restaurar | `network`, `migration`, `backup` |
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

- **Guardado:** scrypt con sal aleatoria por usuario, comparación en tiempo constante y mínimo 6 caracteres.
- **Código de recuperación del administrador:** 16 caracteres al azar (unos 79 bits), generado solo si el administrador escribe su contraseña. Se guarda su huella scrypt en `settings._recovery`, que nunca sale del núcleo. Sirve una vez, solo en la PC principal (no hay ruta de red para usarlo), con el mismo límite de intentos que la entrada. Al usarlo se cierran las sesiones de ese usuario (`test/o5.test.js`).
- **Sesiones:** token aleatorio de 192 bits. Vence tras 12 horas sin uso y se pierde al reiniciar la principal o al restaurar una copia.

## Interfaz de Electron

- **Aislamiento:** `contextIsolation`, `sandbox` y sin `nodeIntegration`. La interfaz solo ve `window.capsApi` (`preload.js`).
- **CSP:** `script-src 'self'`, sin scripts en línea. Imágenes solo de la app, de `caps-foto:` y de `data:`.
- **Texto dinámico:** todo pasa por `html`/`esc`. También lo que llega por la red, como los nombres de otras PCs o de la principal.
- **Recibos, etiquetas y código de recuperación:** se imprimen en una ventana sin JavaScript.
- **Importar productos:** el archivo se lee en el proceso principal (sin bibliotecas externas, máximo 20 MB) y solo pasan filas de texto al núcleo, que valida cada una como si se escribiera a mano.

## Riesgos que quedan

| Riesgo | Mitigación | Dónde se resuelve |
|---|---|---|
| Quien use la PC principal como administrador ve la clave de conexión | Es parte de su rol; puede cambiarla en Configuración → Red | — |
| Una PC conectada sin sesión puede volver a conectarse a otra "principal" (pantalla de entrada) | Solo aparece si hay error de conexión y no permite convertirla en principal. Una principal falsa no conoce la clave, así que no puede descifrar | — |
| Quien consiga el código de recuperación puede poner una contraseña nueva al administrador | Sirve una vez, solo en la PC principal, con límite de intentos; el administrador lo guarda fuera de la tienda. Queda en el historial | — |
| El instalador no está firmado | Aviso de Windows al instalar. Si alguien entra a la cuenta de GitHub, podría publicar una actualización falsa | Certificado (DT-18), verificación en dos pasos en GitHub y proteger `main` |
| El vendedor puede registrar un depósito al banco que nadie compara con el banco | El dueño revisa los depósitos contra el estado de cuenta | Reporte de depósitos por verificar ([auditoría 4.2](auditoria.md#seguridad)) |
| La ventana no bloquea la navegación fuera de la app; un nombre que empieza con `=` se ejecuta como fórmula al abrir el CSV | No hay enlaces externos; los nombres los escriben usuarios de la tienda | [Auditoría 4.5 y 4.6](auditoria.md#seguridad) |
| La base y las copias (también la externa) no van cifradas | La carpeta de datos es del usuario de Windows | Cifrar la copia externa; BitLocker ([auditoría 4.3](auditoria.md#seguridad)) |
