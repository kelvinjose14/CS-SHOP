# Importación de conduces históricos (700+ archivos Excel)

Última revisión: 2026-09-30 — **Diseño. Aún no se han recibido los archivos.**

> Todo hallazgo sobre los Excel reales (formatos, anomalías, decisiones de mapeo) se registra en §8 "Bitácora de hallazgos".

## 1. Objetivo

Traer al sistema más de 700 conduces históricos que hoy están en Excel, **conservando su información original**
(número, fecha, empresa, punto, asunto, productos, comentarios, despacho/recepción), sin renumerarlos, sin
corregir en silencio datos dudosos y sin tocar la secuencia activa hasta que un administrador lo confirme.

## 2. Hipótesis sobre los archivos (a verificar con muestras)

| # | Hipótesis | Consecuencia de diseño |
|---|---|---|
| H1 | Cada archivo es **un conduce con formato de formulario** (celdas ubicadas como el documento impreso), no una tabla. | Modo **formulario**: extracción por etiquetas ("Conduce", "Fecha", "Punto Comercial", "Asunto", encabezado "CANTIDAD") y por posiciones relativas. |
| H2 | Algunos archivos pueden tener **varias hojas**, una por conduce (copias de la plantilla). | Cada hoja es un registro candidato. |
| H3 | Puede existir alguna **hoja resumen/tabla** (un conduce o un ítem por fila). | Modo **tabular**: mapeo de columnas. |
| H4 | Hay variaciones de plantilla a lo largo del tiempo (celdas movidas, empresas distintas, prefijos distintos). | Detección por etiquetas + perfiles de mapeo reutilizables por plantilla. |
| H5 | Hay números con formatos mixtos (`NS-710`, `NS 710`, `ns710`, `710`), fechas como texto o como número de serie Excel. | Normalizadores con reporte de cada transformación; lo ambiguo queda como advertencia/error. |
| H6 | Puede haber archivos `.xls` antiguos (formato BIFF). | SheetJS lee `.xls`, `.xlsx` y `.csv`. |

## 3. Proceso (asistente en `/importar`)

```
SUBIR → ANALIZAR → MAPEAR → VALIDAR → MOSTRAR ERRORES → VISTA PREVIA → CONFIRMACIÓN → IMPORTAR → REPORTE
```

1. **SUBIR**: se crea un `import_batch`. Se suben uno o muchos archivos (arrastrar y soltar, carpetas completas).
   Por cada archivo: validar extensión, firma (magic bytes), tamaño; calcular SHA-256; guardar el archivo original en
   `stored_files` (dentro de PostgreSQL, ADR-016); registrar en `import_files`. Mismo SHA-256 ya subido ⇒ `duplicate_file` (advertencia).
2. **ANALIZAR** (servidor, por partes para no exceder tiempos): leer cada hoja con SheetJS (solo valores, sin fórmulas
   ni macros), detectar modo (formulario/tabular), extraer candidatos a `import_records.raw` (celdas originales con
   coordenadas) y una primera propuesta en `normalized`.
3. **MAPEAR**: el administrador revisa/ajusta el perfil de mapeo (dónde está cada campo; qué empresa corresponde a
   cada prefijo/plantilla; cómo interpretar fechas `dd/mm/aaaa` vs `mm/dd/aaaa`). Se guarda en `import_mapping_profiles`.
4. **VALIDAR**: reglas de §5 → `import_errors` con severidad `error` / `warning` / `info`.
5. **MOSTRAR ERRORES**: tabla filtrable por archivo, código y severidad; descarga del reporte en Excel.
   El usuario puede **excluir** un registro o corregir el mapeo y re-validar. **No hay corrección automática silenciosa.**
6. **VISTA PREVIA**: muestra cómo quedará cada conduce (misma vista que el sistema), con enlace a la celda original.
7. **CONFIRMACIÓN**: resumen (cuántos se importarán, cuántos excluidos, advertencias aceptadas) y confirmación explícita
   escribiendo el texto `IMPORTAR`. Solo registros `valid`/`warning` aceptados.
8. **IMPORTAR**: `commit_import_batch(batch_id)` en **una transacción** (todo o nada). Inserta `delivery_notes`
   con `origin='import'`, número original, `legacy_number_raw`, `legacy_data`, ítems e historial de estado; enlaza
   `import_record_id`. Si cualquier número colisiona con uno existente ⇒ se aborta todo con reporte.
9. **REPORTE**: totales, por empresa y prefijo, rango de números, huecos, duplicados, errores; exportable. Queda en
   `import_batches.result_report` y en auditoría (`import.commit`).

Deshacer: un lote importado puede revertirse **solo si ninguno de sus conduces fue modificado después**
(función `revert_import_batch`, solo admin, auditada). [PROPUESTA]

## 4. Campos a detectar

número · prefijo · fecha · empresa · punto comercial · asunto · productos (cantidad, unidad, descripción) ·
comentario · despachado por · recibido por · fecha de recepción · (cédula, observaciones si existen) · marca "ANULADO".

Estado asignado al histórico [PROPUESTA]:
- Contiene marca de anulado ⇒ `voided` (motivo: "Anulado en registro histórico").
- Tiene *recibido por* o *fecha de recepción* ⇒ `received`.
- En otro caso ⇒ `issued`.

## 5. Validaciones (códigos de `import_errors`)

| Código | Severidad | Regla |
|---|---|---|
| `UNKNOWN_FORMAT` | error | No se reconoce plantilla ni tabla |
| `MISSING_NUMBER` | error | Sin número |
| `UNPARSEABLE_NUMBER` | error | Número no interpretable |
| `UNKNOWN_COMPANY` | error | No se puede determinar la empresa |
| `DUPLICATE_IN_BATCH` | error | Mismo empresa+prefijo+valor en otro registro del lote (se muestran ambos) |
| `DUPLICATE_IN_DB` | error | Ya existe en el sistema |
| `INVALID_DATE` | error | Fecha inválida o imposible |
| `AMBIGUOUS_DATE` | warning | Día y mes intercambiables (p. ej. 03/04/2024) sin regla del perfil |
| `FUTURE_DATE` / `OUT_OF_RANGE_DATE` | warning | Fecha futura o fuera del rango esperado |
| `DATE_NUMBER_ORDER` | warning | Número mayor con fecha anterior a uno menor (posible error de tipeo) |
| `EMPTY_ITEMS` | warning | Sin líneas de productos |
| `INVALID_QUANTITY` | warning | Cantidad no numérica, cero o negativa (se conserva el texto original) |
| `MISSING_COMMERCIAL_POINT` | warning | Sin punto comercial |
| `PADDING_VARIANT` | info | `NS-0710` vs `NS-710`: mismo número, distinto formato |
| `NEW_COMMERCIAL_POINT` | info | Punto no existe en catálogo (se creará o se dejará como texto, según decisión) |

## 6. Reporte de análisis (antes de importar)

Por lote y por empresa/prefijo: cantidad total · primer número · último número · prefijos encontrados · empresas ·
duplicados · **números faltantes (huecos)** · archivos problemáticos · registros incompletos · fechas inválidas ·
formatos desconocidos · rango de fechas.

## 7. Secuencia después de la importación

`sequence_suggestion(company_id)` calcula el mayor número por prefijo (incluyendo históricos y emitidos).
Ejemplo: último encontrado `NS-742` ⇒ próximo sugerido `NS-743`. La pantalla muestra la sugerencia, los huecos y
conflictos, y exige al administrador **CONFIRMAR PRÓXIMO NÚMERO** (`set_sequence_next_number`, con motivo). Hasta
entonces la secuencia sigue igual (o en `pending_confirmation`).

## 8. Bitácora de hallazgos (llenar al recibir los archivos)

| Fecha | Hallazgo | Decisión | Documentado en |
|---|---|---|---|
| — | Aún no se han recibido muestras | — | — |

## 9. Preparación que debe hacer el cliente

- Reunir **todos** los Excel en una carpeta (sin renombrar ni editar) y conservar una copia fuera de la PC (ver
  `BACKUP_AND_RECOVERY.md`).
- Enviar primero **5–10 archivos de muestra** de distintas épocas/empresas para diseñar el perfil de mapeo.
- Indicar qué prefijo corresponde a qué empresa y si hay conduces anulados marcados de alguna forma.
