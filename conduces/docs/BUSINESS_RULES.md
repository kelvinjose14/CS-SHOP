# Reglas de negocio

> Toda decisión del cliente o del equipo que afecte el comportamiento del sistema **debe quedar aquí**.
> Si una regla cambia, se edita aquí, se anota la fecha y se registra en `CHANGELOG.md`.
> Estado de cada regla: **[CONFIRMADA]** (pedida explícitamente por el cliente), **[PROPUESTA]** (decisión
> técnica razonable pendiente de validación; ver `OPEN_QUESTIONS.md`).

Última revisión: 2026-09-30

---

## RN-01 Borradores y numeración [CONFIRMADA]

- **Los borradores NO consumen número oficial.** Mientras está en borrador, el número se muestra como
  *"Se asignará al emitir"*.
- El número se asigna **únicamente al EMITIR**, de forma atómica en la base de datos.
- Guardar, editar o descartar un borrador nunca afecta la secuencia.

## RN-02 Formato y secuencias de numeración [CONFIRMADA]

- Cada empresa tiene su propia secuencia independiente (`delivery_note_sequences`).
- Configurable: prefijo, separador, número actual (último emitido), dígitos mínimos, empresa, estado.
- Formato = `prefijo + separador + número con ceros a la izquierda hasta los dígitos mínimos`.
  Ejemplos: `NS-710` (NS, "-", 0 dígitos mín.), `NS-0710` (4), `JG-000710` (6), `710` (sin prefijo ni separador).
- El número observado `NS-710` **no** determina el próximo número. La secuencia real se decidirá después de
  analizar los 700+ históricos (RN-13).

## RN-03 Unicidad e inmutabilidad del número [CONFIRMADA]

1. Dos computadoras nunca pueden obtener el mismo número (garantizado por la BD, no por el navegador).
2. Un número emitido **nunca cambia**.
3. Un número anulado **nunca se reutiliza**.
4. Dentro de una empresa, un mismo prefijo + valor numérico es único: `NS-710` y `NS-0710` se consideran el
   **mismo número** y no pueden coexistir. [PROPUESTA en cuanto a tratar ambos como iguales]
5. Si al emitir el número calculado ya existe (p. ej. un histórico importado), la emisión **falla** con un
   error claro y la secuencia no avanza. El sistema nunca "salta" números en silencio.

## RN-04 ID interno [CONFIRMADA]

Cada conduce tiene un UUID interno inmutable, independiente del número comercial. Todas las relaciones,
URLs y auditoría usan el UUID.

## RN-05 Estados y transiciones [CONFIRMADA estados / PROPUESTA transiciones]

| Estado (BD) | Nombre visible |
|---|---|
| `draft` | BORRADOR |
| `issued` | EMITIDO |
| `dispatched` | DESPACHADO |
| `received` | RECIBIDO |
| `voided` | ANULADO |

Transiciones permitidas:

| Desde | Hacia | Acción |
|---|---|---|
| (nuevo) | draft | Crear / Duplicar |
| draft | issued | Emitir (asigna número) |
| draft | (eliminado) | Descartar borrador (queda en auditoría con su contenido) |
| issued | dispatched | Despachar |
| issued | received | Recibir (entrega inmediata, sin despacho registrado) |
| dispatched | received | Recibir |
| issued / dispatched / received | voided | Anular (con motivo) |

- No hay transiciones hacia atrás ni salida de `voided`.
- Cada cambio de estado se guarda en `delivery_note_status_history` (quién, cuándo, desde, hacia, motivo).

## RN-06 Edición [PROPUESTA]

- Un **borrador** se puede editar libremente (por quien tenga permiso `delivery_notes.edit_draft`).
- Un conduce **emitido** tiene el contenido congelado: empresa, fecha, punto comercial, asunto, productos y
  comentario **no se editan**. Solo se completan los datos de despacho y recepción mediante sus acciones.
- Para corregir un conduce emitido: **anular** (con motivo) y **duplicar** para emitir uno nuevo.
- Control de concurrencia en edición: cada conduce tiene `version`; si dos personas editan el mismo
  borrador, la segunda en guardar recibe *"Este conduce fue modificado por otra persona, recargue"*.

## RN-07 Anulación [CONFIRMADA]

- Solicita **motivo** obligatorio (mínimo 5 caracteres, configurable).
- Guarda usuario, fecha y hora, y motivo.
- **No borra** el conduce ni **libera** el número.
- El PDF/impresión de un conduce anulado muestra la marca de agua **ANULADO**.
- Permiso: solo ADMINISTRADOR por defecto (ver `SECURITY.md`). [PROPUESTA — ver OPEN_QUESTIONS Q5]

## RN-08 Duplicar [CONFIRMADA]

- Copia: empresa, punto comercial, asunto, productos (con cantidades y unidades) y comentario.
- No copia: número, fecha (se usa la de hoy), despacho/recepción/firmas, estado, auditoría.
- El duplicado nace **BORRADOR** y guarda referencia al original (`duplicated_from_id`).
- Se puede duplicar un conduce en cualquier estado, incluido ANULADO.

## RN-09 Contenido del conduce [CONFIRMADA]

- Campos: empresa emisora, fecha, punto comercial, número (asignado al emitir), asunto, productos,
  comentario, despachado por, recibido por, fecha de recepción. Opcionales: cédula, hora, firma, observaciones.
- Productos: 1..N líneas con **CANTIDAD, UNIDAD, DESCRIPCIÓN**. Se puede elegir un producto del catálogo o
  escribir una descripción manual. Cantidad > 0, admite hasta 3 decimales. [PROPUESTA decimales]
- Para **emitir** se exige: empresa activa, fecha, punto comercial (catálogo o texto), asunto y al menos una
  línea de producto. Un borrador puede guardarse incompleto.
- **Fecha del conduce**: editable en borrador. Al emitir no puede ser futura. [PROPUESTA] Se permitirá fecha
  anterior (hasta N días configurables en `system_settings.max_backdate_days`, por defecto 30) — ver OPEN_QUESTIONS.

## RN-10 Comentario [CONFIRMADA]

- Cada empresa tiene un **comentario predeterminado** configurable (no hardcodeado). Ejemplo actual:
  *"Por medio del presente conduce hacemos entrega, de productos industrial ya mencionado arriba para fines correspondientes."*
- Al crear un conduce se precarga el comentario de la empresa; el usuario puede modificarlo para ese conduce.

## RN-11 Snapshot de datos al emitir [PROPUESTA]

Al emitir, se copian al conduce los datos de la empresa (nombre, razón social, RNC, dirección, teléfono, fax,
correo, logo, título del documento, configuración de impresión) y del punto comercial (nombre, dirección).
Así, reimprimir un conduce de hace 2 años muestra los datos vigentes en ese momento, aunque la empresa
cambie de dirección o logo después.

## RN-12 Recepción [CONFIRMADA]

- Despacho: *despachado por* (texto; puede no ser usuario del sistema) y fecha/hora de despacho.
- Recepción: *recibido por*, *fecha de recepción*; opcionales: cédula, hora, observaciones, firma.
- Firma: en papel (el conduce firmado se devuelve: *"Favor devolver este conduce después de haber recibido y
  firmado el mismo"*). Adjuntar el escaneo firmado o capturar firma digital queda como mejora futura. [PROPUESTA]

## RN-13 Históricos y secuencia tras importar [CONFIRMADA]

- Los conduces históricos conservan su **número original**, fecha y datos. **Nunca** se les asigna número nuevo.
- La importación **no** modifica la secuencia activa. Tras analizar los históricos el sistema **sugiere** el
  próximo número (último encontrado + 1) y un administrador debe **CONFIRMAR PRÓXIMO NÚMERO** explícitamente.
- Información dudosa no se corrige en silencio: se reporta como error/advertencia para revisión humana.
- Recomendación operativa: **importar los históricos antes de emitir conduces reales** en el sistema. Mientras
  la secuencia de una empresa esté en `pending_confirmation`, esa empresa no puede emitir.

## RN-14 Secuencia nueva o modificada [PROPUESTA]

- Toda secuencia nace en estado `pending_confirmation` y no permite emitir.
- Solo un administrador puede confirmar o cambiar el próximo número, indicando motivo.
- El próximo número no puede ser menor o igual al mayor número ya existente para esa empresa y prefijo.
- Cada cambio queda en auditoría con valores anteriores y nuevos.

## RN-15 Empresas [CONFIRMADA]

- Catálogo configurable, sin empresas hardcodeadas. Ejemplos observados: *MILADYS RODRIGUEZ*, *Junquito Gas, S.R.L.*
- Una empresa **no se elimina** si tiene conduces; se desactiva. Una empresa inactiva no puede emitir.

## RN-16 Catálogos [CONFIRMADA / PROPUESTA alcance]

- Puntos comerciales (ej. *HERMANOS TORRES*), productos frecuentes y unidades son catálogos configurables.
- Unidades iniciales (editables): Unidad, Caja, Paquete, Galón, Cilindro, Pieza, Metro, Libra, Otro.
- Un punto comercial o producto puede pertenecer a una empresa o a **todo el grupo** (`company_id` vacío). [PROPUESTA]
- Los registros de catálogo usados en conduces no se borran: se desactivan.
- No se permiten nombres duplicados de punto comercial dentro de la misma empresa (sin distinguir mayúsculas ni acentos).

## RN-17 Usuarios y roles [CONFIRMADA]

- Roles iniciales: ADMINISTRADOR, OPERADOR / ALMACÉN, CONSULTA. Matriz exacta en `SECURITY.md`.
- Un usuario puede tener acceso a una o varias empresas. El administrador tiene acceso a todas.
- Los usuarios no se eliminan; se desactivan (conservan su autoría en conduces y auditoría).

## RN-18 Auditoría [CONFIRMADA]

- Se registran: creación, edición, emisión, cambios de estado, anulación, descarte de borradores, cambios de
  secuencia, importaciones, cambios de configuración, empresas, usuarios y permisos.
- Los registros de auditoría no se pueden modificar ni borrar desde la aplicación.

## RN-19 Zona horaria [PROPUESTA]

`America/Santo_Domingo` (UTC-4, sin horario de verano). "Hoy", "esta semana" y "este mes" del dashboard se
calculan en esa zona. Semana de lunes a domingo.

## RN-20 Impresión [CONFIRMADA]

- Formato principal: **Carta** (Letter, 8.5" × 11").
- Estructura y textos basados en el conduce actual (ver `ARCHITECTURE.md` §PDF). El título
  *"ENTREGA DE PIEZA INDUSTRIAL"* y el texto inferior son configurables por empresa.
- Un borrador puede previsualizarse/imprimirse con marca de agua **BORRADOR** y número *"Se asignará al emitir"*.
- Nombre del PDF: `CONDUCE_<NÚMERO>_<EMPRESA>.pdf`, ej. `CONDUCE_NS-710_JUNQUITO_GAS.pdf`.
