# Base de datos

Motor: **PostgreSQL 15+** (Supabase). Extensiones: `pgcrypto` (gen_random_uuid), `pg_trgm`, `unaccent`.
Última revisión: 2026-09-30 — **diseño (Fase 0). Ninguna migración creada ni aplicada todavía.**

Reglas:
- Todo cambio estructural se hace con una **migración versionada** en `supabase/migrations/`
  (`YYYYMMDDHHMMSS_descripcion.sql`). Nunca editar una migración ya aplicada: crear otra.
- Nunca modificar producción a mano sin dejar una migración y una entrada en §9.
- RLS activado en todas las tablas de `public`. Funciones internas en el esquema `app` (no expuesto por la API).
- Convención: tablas en plural, snake_case, inglés. `id uuid` por defecto; `created_at/updated_at timestamptz`;
  `created_by/updated_by uuid → profiles(id)`.

## 1. Diagrama (resumen)

```
companies 1─N delivery_note_sequences
companies 1─N delivery_notes 1─N delivery_note_items N─1 units
                     │  │                              N─1 products
                     │  └─1─N delivery_note_status_history
                     └─N─1 commercial_points
profiles (1─1 auth.users) N─1 roles 1─N role_permissions N─1 permissions
profiles N─N companies  (user_companies)
import_batches 1─N import_files 1─N import_records 1─N import_errors
import_records 1─1 delivery_notes (origin='import')
audit_logs (solo inserción) · system_settings (clave/valor)
```

## 2. Identidad, roles y permisos

### `roles`
| Columna | Tipo | Notas |
|---|---|---|
| code | text PK | `admin`, `operator`, `viewer` |
| name | text NOT NULL | ADMINISTRADOR, OPERADOR / ALMACÉN, CONSULTA |
| description | text | |
| is_system | boolean NOT NULL default true | roles de sistema no se borran |

### `permissions`
| code | text PK | p. ej. `delivery_notes.issue` (lista completa en `SECURITY.md`) |
| module | text NOT NULL | |
| description | text NOT NULL | |

### `role_permissions`
PK `(role_code, permission_code)`, FKs a `roles` y `permissions`.

### `profiles`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | FK → `auth.users(id)` **ON DELETE RESTRICT** (usuarios se desactivan, no se borran) |
| email | text NOT NULL UNIQUE | copia sincronizada de auth.users |
| full_name | text NOT NULL | |
| role_code | text NOT NULL FK roles | |
| is_active | boolean NOT NULL default true | inactivo ⇒ todas las funciones rechazan sus acciones |
| last_seen_at | timestamptz | actualizado (con límite de frecuencia) por el servidor |
| created_at, updated_at, created_by, updated_by | | |

### `user_companies`
| user_id | uuid FK profiles | PK compuesta |
| company_id | uuid FK companies | PK compuesta |
| role_code | text FK roles NULL | **reservado**: rol distinto por empresa en el futuro |
| created_at, created_by | | |

## 3. Empresas y configuración

### `companies`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| code | text NOT NULL UNIQUE | código corto `^[A-Z0-9_-]{1,12}$` |
| trade_name | text NOT NULL | nombre comercial |
| legal_name | text | razón social |
| rnc | text UNIQUE (si no es NULL) | 9 u 11 dígitos (validación de formato) |
| address, phone, fax, email | text | |
| logo_path | text | ruta en bucket privado `company-logos` |
| document_title | text NOT NULL default 'ENTREGA DE PIEZA INDUSTRIAL' | |
| default_comment | text | comentario predeterminado (RN-10) |
| footer_text | text NOT NULL default '*Favor devolver este conduce después de haber recibido y firmado el mismo*' | |
| print_settings | jsonb NOT NULL default '{}' | validado con Zod: `show_unit_column`, `pdf_name`, `accent_color`, `show_fax`, `show_email`, `show_signature_lines`, `show_id_doc_line` |
| is_active | boolean NOT NULL default true | |
| created_at, updated_at, created_by, updated_by | | |

### `system_settings`
| key | text PK | `timezone`, `void_reason_min_length`, `max_backdate_days`, `import_max_file_mb`, ... |
| value | jsonb NOT NULL | |
| description | text | |
| updated_at, updated_by | | |

## 4. Catálogos

### `units`
| id uuid PK · code text UNIQUE · name text NOT NULL UNIQUE (normalizado) · plural_name text · allows_decimals boolean default false · sort_order int · is_active boolean |
Seed: Unidad, Caja, Paquete, Galón, Cilindro, Pieza, Metro, Libra, Otro.

### `commercial_points`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies NULL | NULL = disponible para todo el grupo |
| name | text NOT NULL | |
| name_normalized | text NOT NULL | `app.normalize_text(name)` (minúsculas, sin acentos, espacios colapsados), vía trigger |
| address, contact_name, phone, notes | text | |
| is_active | boolean NOT NULL default true | |
| timestamps / autores | | |
Índices: `UNIQUE (company_id, name_normalized) NULLS NOT DISTINCT`; GIN trgm en `name_normalized`.

### `products`
| id uuid PK · company_id uuid NULL · code text · name text NOT NULL · name_normalized · description text · default_unit_id uuid FK units · is_active · timestamps |
Índices: `UNIQUE (company_id, code) NULLS NOT DISTINCT WHERE code IS NOT NULL`; GIN trgm en `name_normalized`.

## 5. Conduces

### `delivery_note_sequences`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid NOT NULL FK companies | |
| name | text NOT NULL default 'Principal' | |
| prefix | text NOT NULL default '' | `^[A-Z0-9]{0,10}$` |
| separator | text NOT NULL default '-' | CHECK en ('', '-', '/', '.', ' ') |
| min_digits | smallint NOT NULL default 0 | CHECK 0..12 |
| last_number | bigint NOT NULL default 0 | último número emitido; próximo = last_number + 1. CHECK ≥ 0 |
| status | text NOT NULL default 'pending_confirmation' | CHECK en ('pending_confirmation','active','inactive') |
| is_default | boolean NOT NULL default true | |
| confirmed_at, confirmed_by | | última confirmación del próximo número |
| version | int NOT NULL default 1 | |
| timestamps / autores | | |
Índices: `UNIQUE (company_id) WHERE is_default AND status <> 'inactive'` (una secuencia vigente por empresa).
Solo se modifica con `set_sequence_next_number` / `configure_sequence` (auditadas).

### `delivery_notes`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK default gen_random_uuid() | **ID interno inmutable** |
| company_id | uuid NOT NULL FK companies | |
| status | text NOT NULL default 'draft' | CHECK en ('draft','issued','dispatched','received','voided') |
| origin | text NOT NULL default 'system' | CHECK en ('system','import') |
| sequence_id | uuid FK sequences NULL | NULL en borradores e importados |
| number_prefix | text NULL | |
| number_value | bigint NULL | CHECK > 0 |
| number_display | text NULL | texto visible (`NS-710`); en importados = texto original normalizado |
| note_date | date NULL | fecha del conduce (obligatoria al emitir) |
| commercial_point_id | uuid FK commercial_points NULL | |
| commercial_point_name | text NULL | texto del punto (catálogo o manual); obligatorio al emitir |
| commercial_point_snapshot | jsonb NULL | dirección/contacto al emitir |
| subject | text NULL | asunto |
| comment | text NULL | |
| company_snapshot | jsonb NULL | datos de empresa al emitir (RN-11) |
| dispatched_by_name | text | |
| dispatched_at | timestamptz | |
| received_by_name | text | |
| received_by_id_doc | text | cédula (opcional) |
| received_date | date | |
| received_time | time | |
| reception_notes | text | observaciones |
| signature_path | text | reservado (firma digital/escaneo, futuro) |
| issued_at, issued_by | | |
| voided_at, voided_by, void_reason | | |
| duplicated_from_id | uuid FK delivery_notes NULL | |
| import_record_id | uuid FK import_records NULL UNIQUE | |
| legacy_number_raw | text | número exactamente como venía en el Excel |
| legacy_data | jsonb | campos originales no mapeados |
| search_text | text NOT NULL default '' | mantenido por trigger (ver §7) |
| version | int NOT NULL default 1 | bloqueo optimista; +1 en cada cambio |
| created_at, created_by, updated_at, updated_by | | |

Constraints clave:
- `UNIQUE (company_id, number_prefix, number_value)` — unicidad de números (drafts con NULL no chocan). Nota:
  `number_prefix` se guarda `''` (no NULL) cuando el número no tiene prefijo, para que la unicidad aplique.
- CHECK `draft ⇔ number_value IS NULL`: `(status = 'draft') = (number_value IS NULL)`.
- CHECK `status = 'voided' ⇒ void_reason IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL` (voided_by puede ser NULL solo si `origin='import'`).
- CHECK `status <> 'draft' ⇒ note_date IS NOT NULL AND commercial_point_name IS NOT NULL`.

Índices: `(company_id, note_date DESC, number_value DESC)`, `(company_id, status)`, `(status) WHERE status IN ('issued','dispatched')`
(pendientes de recepción), `(created_by)`, `(commercial_point_id)`, GIN trgm en `search_text`, `(upper(number_display))`.

Triggers:
- `trg_delivery_notes_immutable_number`: si `OLD.number_value IS NOT NULL`, prohíbe cambiar `number_*`, `company_id`, `sequence_id`.
- `trg_delivery_notes_frozen_content`: si `OLD.status <> 'draft'`, prohíbe cambiar `note_date`, punto, asunto,
  comentario y snapshots (solo se permiten campos de despacho/recepción/anulación a través de las funciones).
- `trg_delivery_notes_no_delete`: prohíbe `DELETE` si `status <> 'draft'`.
- `trg_delivery_notes_version`: incrementa `version` y `updated_at`.
- `trg_delivery_notes_search`: recalcula `search_text`.

### `delivery_note_items`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| delivery_note_id | uuid NOT NULL FK delivery_notes ON DELETE CASCADE | (solo borradores pueden borrarse) |
| line_no | smallint NOT NULL | UNIQUE (delivery_note_id, line_no) |
| quantity | numeric(14,3) NOT NULL | CHECK > 0 |
| unit_id | uuid FK units NULL | |
| unit_name | text NULL | snapshot del nombre de la unidad |
| product_id | uuid FK products NULL | |
| description | text NOT NULL | CHECK length 1..1000 |
| created_at | timestamptz | |
Trigger: prohíbe INSERT/UPDATE/DELETE si el conduce padre no es `draft` (excepto dentro de `commit_import_batch`,
que activa `set_config('app.importing','on', true)` local a la transacción). Cambios en ítems recalculan `search_text` del padre.

### `delivery_note_status_history`
| id bigint identity PK · delivery_note_id uuid FK NOT NULL · from_status text NULL · to_status text NOT NULL · changed_at timestamptz default now() · changed_by uuid NULL · reason text · metadata jsonb |
Índice `(delivery_note_id, changed_at)`. Solo inserción (trigger bloquea UPDATE/DELETE).

## 6. Auditoría

### `audit_logs`
| Columna | Tipo | Notas |
|---|---|---|
| id | bigint identity PK | |
| occurred_at | timestamptz NOT NULL default now() | |
| actor_id | uuid NULL | NULL = sistema/script |
| actor_email | text | snapshot |
| action | text NOT NULL | `delivery_note.issue`, `sequence.update`, `company.update`, `import.commit`, ... |
| entity_type | text NOT NULL | `delivery_note`, `company`, `sequence`, `profile`, `import_batch`, ... |
| entity_id | text NOT NULL | |
| company_id | uuid NULL | |
| old_values | jsonb | |
| new_values | jsonb | |
| context | jsonb | ip, user_agent, request_id, origen (web/script) |
Índices: `(entity_type, entity_id)`, `(occurred_at DESC)`, `(actor_id, occurred_at DESC)`, `(company_id, occurred_at DESC)`.
Protección: RLS (SELECT solo con `audit.view`; sin políticas de INSERT/UPDATE/DELETE para usuarios), escritura solo
por `app.write_audit()` (SECURITY DEFINER), y trigger que bloquea UPDATE/DELETE **para todos** (incluye service role).
Retención: indefinida.

## 7. Búsqueda

`app.normalize_text(t)`: `lower(unaccent(t))` + espacios colapsados (función IMMUTABLE envolviendo un diccionario unaccent fijo).
`search_text` = normalize(number_display ‖ legacy_number_raw ‖ commercial_point_name ‖ subject ‖ comment ‖
descripciones de ítems ‖ dispatched_by_name ‖ received_by_name). Búsqueda: `search_text ILIKE '%' || normalize(q) || '%'`
con índice GIN `gin_trgm_ops`. Filtros por usuario creador, estado, empresa y fechas usan columnas indexadas.

## 8. Importación

### `import_batches`
| id uuid PK · name text · status text CHECK ('uploaded','analyzing','analyzed','mapped','validated','confirmed','importing','imported','failed','cancelled') · mode text CHECK ('form','tabular') NULL · mapping jsonb · mapping_profile_id uuid NULL · default_company_id uuid NULL · analysis_report jsonb · result_report jsonb · total_files int · total_records int · valid_records int · warning_records int · error_records int · imported_records int · created_by, created_at, updated_at, confirmed_by, confirmed_at, imported_at |

### `import_files`
| id uuid PK · batch_id uuid FK · original_filename text · storage_path text · sha256 text NOT NULL · size_bytes bigint · mime_type text · file_format text CHECK ('xls','xlsx','csv') · sheet_count int · status text CHECK ('uploaded','parsed','error','duplicate_file','excluded') · parse_error text · created_at |
Índice `(sha256)` para detectar el mismo archivo subido dos veces (en este u otro lote).

### `import_records`
| id uuid PK · batch_id uuid FK · file_id uuid FK · sheet_name text · source_ref text (`Hoja1!A1:H40` o `fila 12`) · raw jsonb NOT NULL (celdas originales) · normalized jsonb (registro mapeado: empresa, número, fecha, punto, asunto, ítems, ...) · status text CHECK ('pending','valid','warning','error','duplicate','excluded','imported') · detected_company_id uuid · detected_prefix text · detected_number bigint · detected_date date · delivery_note_id uuid NULL · reviewer_note text · created_at, updated_at |

### `import_errors`
| id bigint identity PK · batch_id uuid FK · file_id uuid NULL · record_id uuid NULL · severity text CHECK ('error','warning','info') · code text (`INVALID_DATE`, `MISSING_NUMBER`, `DUPLICATE_IN_BATCH`, `DUPLICATE_IN_DB`, `UNKNOWN_COMPANY`, `UNKNOWN_FORMAT`, `EMPTY_ITEMS`, `AMBIGUOUS_VALUE`, ...) · field text · message text · raw_value text · created_at |

### `import_mapping_profiles`
| id uuid PK · name text UNIQUE · mode text · definition jsonb (reglas de ubicación por etiqueta/celda o columnas) · created_by, timestamps |

## 9. Funciones SQL previstas (API de negocio)

Públicas (llamadas por `supabase.rpc`, `SECURITY DEFINER`, `set search_path = ''`, validan `auth.uid()` activo y permisos):

| Función | Descripción |
|---|---|
| `save_delivery_note_draft(p_id uuid NULL, p_expected_version int NULL, p_data jsonb, p_items jsonb) → (id, version)` | Crea o actualiza borrador + reemplaza ítems, en una transacción |
| `issue_delivery_note(p_note_id uuid, p_expected_version int) → (number_display, issued_at)` | Emisión atómica (ARCHITECTURE §5) |
| `dispatch_delivery_note(p_note_id, p_dispatched_by_name, p_dispatched_at)` | issued → dispatched |
| `receive_delivery_note(p_note_id, p_received_by_name, p_id_doc, p_date, p_time, p_notes)` | issued/dispatched → received |
| `void_delivery_note(p_note_id, p_reason)` | → voided |
| `duplicate_delivery_note(p_note_id) → uuid` | nuevo borrador |
| `discard_delivery_note_draft(p_note_id, p_expected_version)` | borra borrador (auditoría con contenido) |
| `configure_sequence(p_company_id, p_prefix, p_separator, p_min_digits)` | configura formato (sin tocar el contador) |
| `set_sequence_next_number(p_sequence_id, p_next_number, p_reason)` | confirma/cambia próximo número (activa la secuencia) |
| `sequence_suggestion(p_company_id) → (max_found, suggested_next, conflicts)` | máximo existente por prefijo |
| `dashboard_stats(p_company_ids uuid[] NULL) → jsonb` | contadores del dashboard |
| `commit_import_batch(p_batch_id) → jsonb` | inserta registros válidos confirmados; todo o nada |

Internas (`app.*`): `current_profile()`, `is_admin()`, `has_permission(perm, company_id)`, `can_access_company(company_id)`,
`accessible_company_ids()`, `write_audit(...)`, `format_note_number(prefix, sep, value, digits)`, `normalize_text(t)`,
`request_context() → jsonb`, `assert_transition(from, to)`.

## 10. Registro de migraciones

| # | Archivo | Fecha | Descripción | Aplicada en |
|---|---|---|---|---|
| — | (ninguna todavía) | | Se crearán en la Fase 1 | |

Orden previsto para Fase 1–2:
1. `..._extensions_and_app_schema.sql` — extensiones, esquema `app`, `normalize_text`, `format_note_number`.
2. `..._identity_roles_permissions.sql` — roles, permissions, role_permissions, profiles, user_companies + trigger de alta de perfil.
3. `..._companies_settings.sql` — companies, system_settings.
4. `..._audit.sql` — audit_logs + `write_audit` + protecciones.
5. `..._catalogs.sql` — units, commercial_points, products.
6. `..._delivery_notes.sql` — sequences, delivery_notes, items, status_history, triggers, índices.
7. `..._delivery_note_functions.sql` — funciones de negocio.
8. `..._rls_policies.sql` — políticas RLS.
9. (Fase 6) `..._imports.sql` — tablas y funciones de importación.

## 11. Pruebas de BD

`tests/db/` usa PostgreSQL real (`TEST_DATABASE_URL`). Un script aplica un *shim* mínimo del esquema `auth`
(`auth.users`, `auth.uid()` leyendo `request.jwt.claim.sub`, roles `authenticated`/`anon`/`service_role`) y luego
todas las migraciones, para probar RLS y funciones sin necesitar Docker/Supabase. También funciona contra
`supabase start` local.
