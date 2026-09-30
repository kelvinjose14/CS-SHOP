# Arquitectura

Última revisión: 2026-09-30 (Fase 0 — diseño; aún no hay código de aplicación)
Condición del cliente: **solo herramientas gratuitas, uso interno** (ADR-014).

## 1. Visión general

```
 Navegador (PCs autorizadas del grupo)
   │  HTTPS (Caddy en la red local, o Cloudflare Tunnel para sucursales) · cookie de sesión httpOnly
   ▼
 Next.js (App Router, Node runtime) ─────────────────────────────────────────────┐
   • Middleware: exige sesión en todas las rutas salvo /login                   │
   • Server Components: lecturas (listas, dashboard)                            │
   • Server Actions / Route Handlers: escrituras, PDF, exportaciones, import    │
   • Zod valida toda entrada; errores → mensajes en español                     │
   • src/server/*: solo servidor (conexión a BD, auth, permisos)                │
   • Cada petición: withUserTransaction(user) → BEGIN; set_config('app.user_id')│
   ▼                                                                            │
 PostgreSQL 16 (rol conduces_app, sin BYPASSRLS)                                │
   • Tablas + RLS + funciones SQL transaccionales (reglas críticas)             │
   • users / sessions (auth propia) · stored_files (logos y Excel)              │
   • audit_logs (solo inserción)                                                │
└───────────────────────────────────────────────────────────────────────────────┘
 Contenedor `backup`: pg_dump diario → disco externo / nube gratuita (rclone)
```

Principio central: **la base de datos es la última línea de defensa**. Numeración, transiciones de estado,
inmutabilidad, aislamiento multiempresa y auditoría se garantizan en PostgreSQL (constraints, triggers,
RLS, funciones). El servidor Next.js valida y orquesta; el navegador solo presenta.

## 2. Stack definitivo (todo gratuito / código abierto)

Ver tabla en `CLAUDE.md` §3 y justificaciones en `DECISIONS.md`. Dependencias previstas (mínimas):

| Paquete | Licencia | Motivo |
|---|---|---|
| `next`, `react`, `react-dom`, `typescript` | MIT / Apache-2.0 | Framework |
| `tailwindcss`, `@tailwindcss/postcss` | MIT | Estilos |
| `pg` | MIT | Cliente PostgreSQL |
| `@node-rs/argon2` | MIT | Hash de contraseñas argon2id |
| `zod` | MIT | Validación en servidor (y formularios) |
| `@react-pdf/renderer` | MIT | PDF idéntico para vista previa, impresión y descarga |
| `xlsx` (SheetJS CE, tarball oficial de cdn.sheetjs.com) | Apache-2.0 | Leer XLS/XLSX/CSV y exportar Excel |
| `lucide-react`, `sonner`, `@radix-ui/*` (vía shadcn/ui), `cmdk` | ISC / MIT | UI: íconos, toasts, dropdowns, modales, autocomplete |
| `react-hook-form` + `@hookform/resolvers` | MIT | Formulario dinámico de líneas (evaluar en Fase 2) |
| Dev: `vitest`, `@playwright/test`, `eslint`, `prettier` | MIT / Apache-2.0 | Calidad y pruebas |
| Infraestructura: PostgreSQL 16, Docker, Caddy, cloudflared (opcional), rclone (opcional) | Libres / gratuitos | Ejecución, HTTPS, acceso remoto, respaldos |

Versiones: última estable al iniciar la Fase 1 (a 2026-09-30: Next 16.x, Tailwind 4.x, Zod 4.x, pg 8.x,
@react-pdf/renderer 4.x, SheetJS 0.20.x). Node.js 22 LTS o superior.

## 3. Módulos y rutas

| Menú | Ruta | Módulo (`src/features/`) |
|---|---|---|
| Dashboard | `/dashboard` | `dashboard` |
| Conduces | `/conduces` (lista + buscador) · `/conduces/[id]` (detalle) | `delivery-notes` |
| Nuevo Conduce | `/conduces/nuevo` · `/conduces/[id]/editar` (solo borrador) | `delivery-notes` |
| Puntos Comerciales | `/puntos-comerciales` | `commercial-points` |
| Productos | `/productos` | `products` |
| Empresas | `/empresas` · `/empresas/[id]` (datos, impresión, secuencia) | `companies`, `sequences` |
| Importar | `/importar` · `/importar/[batchId]` (asistente por pasos) | `imports` |
| Reportes | `/reportes` | `reports` |
| Usuarios | `/usuarios` | `users` |
| Auditoría | `/auditoria` | `audit` |
| Configuración | `/configuracion` (unidades, ajustes generales) | `settings` |

API (Route Handlers, siempre autenticados):
- `GET /api/delivery-notes/[id]/pdf?disposition=inline|attachment` — PDF.
- `GET /api/delivery-notes/export?format=xlsx|csv&<filtros>` — exportación con los mismos filtros de la lista.
- `POST /api/imports/[batchId]/files` — subida de archivos de importación.
- `GET /api/files/[id]` — descarga de un archivo guardado (logos), con control de permisos.
- `GET /api/backup/export` — exportación completa (solo admin).

## 4. Flujo de escritura (ejemplo: Emitir)

```
[Botón Emitir] → deshabilitado + spinner (evita doble clic)
  → Server Action issueDeliveryNote({ id, version })
      1. getCurrentUser(): valida la cookie contra la tabla sessions (no confiar en el cliente)
      2. Zod valida { id: uuid, version: int }
      3. withUserTransaction(user, tx => tx.query('select * from issue_delivery_note($1, $2)', [id, version]))
         └─ PostgreSQL, UNA transacción:
            a. SELECT nota FOR UPDATE; verifica status='draft', version, empresa activa
            b. app.has_permission('delivery_notes.issue', company_id)
            c. valida campos obligatorios (RN-09)
            d. UPDATE delivery_note_sequences SET last_number = last_number + 1
               WHERE company_id = X AND is_default AND status = 'active'
               RETURNING last_number, prefix, separator, min_digits      ← bloqueo de fila
            e. formatea número; UPDATE nota: status='issued', number_*, snapshots, issued_at/by
            f. INSERT status_history + audit_logs
         COMMIT (o ROLLBACK total: el contador no avanza)
      4. traduce error si lo hay (NOTE_ALREADY_ISSUED, SEQUENCE_NOT_CONFIRMED, NUMBER_ALREADY_EXISTS, ...)
  → toast éxito "Conduce NS-743 emitido" + revalidatePath + botones PDF / Imprimir
```

## 5. Numeración atómica y concurrencia (caso crítico)

**Escenario:** PC A y PC B presionan *Emitir* casi al mismo tiempo en la misma empresa.

1. Ambas transacciones ejecutan `UPDATE delivery_note_sequences ... SET last_number = last_number + 1`.
2. PostgreSQL da el bloqueo de la fila de la secuencia a una (A). B **espera**.
3. A obtiene 743, termina y hace COMMIT → libera el bloqueo.
4. En READ COMMITTED, B re-evalúa la fila con la versión ya confirmada (742→743) y la incrementa a **744**.
5. Resultado garantizado: A → `NS-743`, B → `NS-744`. Nunca el mismo número.

Capas adicionales de protección:
- `UNIQUE (company_id, number_prefix, number_value)` — aunque hubiera un error de lógica, la BD rechaza el duplicado.
- `SELECT ... FOR UPDATE` sobre el conduce: el doble clic (dos llamadas para el **mismo** borrador) se serializa;
  la segunda ve `status='issued'` y recibe `NOTE_ALREADY_ISSUED` con el número ya asignado (la UI lo muestra, no es error grave).
- Trigger `BEFORE UPDATE` que impide modificar `number_*` una vez asignados.
- Por qué no `CREATE SEQUENCE`: `nextval()` no se revierte con ROLLBACK (deja huecos) y no admite fácilmente
  configuración por empresa ni confirmación del próximo número. El contador en tabla es transaccional: **sin huecos**.
- Rendimiento: el bloqueo dura milisegundos (una transacción corta por emisión). Suficiente para cientos de
  emisiones por minuto; el volumen esperado es mucho menor.

Pruebas obligatorias (`tests/db/numbering.*.test.ts`): N conexiones emitiendo en paralelo → N números
distintos y consecutivos; mismo borrador emitido dos veces en paralelo → un solo número; fallo a mitad de
emisión → contador intacto; empresas distintas → secuencias independientes; colisión con histórico → error
sin avanzar el contador.

## 6. Multiempresa

- `companies` es un catálogo; cada tabla de negocio tiene `company_id`.
- `user_companies (user_id, company_id)` define el acceso. El rol `admin` accede a todas.
- **RLS** en todas las tablas: `SELECT` permitido si `app.can_access_company(company_id)`.
- Escrituras de negocio solo vía funciones `SECURITY DEFINER` que llaman `app.has_permission(permiso, company_id)`.
- En la UI: selector de empresa al crear conduce (por defecto la última usada) y filtro de empresa en listas,
  dashboard y reportes (solo muestra las autorizadas).
- Pruebas: un usuario de la empresa A no puede leer, emitir, anular ni exportar conduces de B (ni por UI, ni por
  API, ni llamando directamente a las funciones SQL).

## 7. Permisos

Roles → permisos en tablas (`roles`, `permissions`, `role_permissions`) para permitir permisos personalizados
más adelante sin cambiar código. Matriz inicial y reglas en `SECURITY.md`. La UI oculta lo que el usuario no
puede hacer, pero **la autorización real** está en el servidor y en la BD.

## 8. PDF, vista previa e impresión

Decisión (ADR-006): **un único documento PDF** generado en el servidor con `@react-pdf/renderer` es la fuente
de la vista previa, la impresión y la descarga. Así lo impreso y el PDF son idénticos por construcción, y no se
depende de Chromium en el servidor (funciona en cualquier servidor Node o Docker).

- `src/features/delivery-notes/pdf/DeliveryNotePdf.tsx` — plantilla (tamaño Carta, márgenes, fuente embebida
  con soporte de acentos, p. ej. Inter/Roboto OFL en `public/fonts`).
- Vista previa: modal con el PDF en `<iframe>` (`disposition=inline`).
- Imprimir: se carga el PDF en un iframe oculto y se llama `print()`; alternativa: abrir en pestaña nueva.
- Generar PDF: descarga con nombre `CONDUCE_<NÚMERO>_<EMPRESA_SLUG>.pdf`.
- Marcas de agua: BORRADOR (borradores), ANULADO (anulados).
- Conduces emitidos usan el **snapshot** de empresa/punto (RN-11); borradores usan datos vigentes.
- Varias páginas: encabezado y pie repetidos, tabla continúa; "Página X de Y".

Estructura del documento (basada en el conduce actual; ajustar al recibir una muestra real):

```
┌─────────────────────────────────────────────────────────────┐
│ [LOGO]  NOMBRE COMERCIAL                                    │
│         Razón social · RNC · Dirección · Tel · Fax · Correo  │
│                                           Fecha: dd/mm/aaaa │
│ Punto Comercial: HERMANOS TORRES          Conduce: NS-710   │
│                ENTREGA DE PIEZA INDUSTRIAL (configurable)   │
│ Asunto: ...                                                 │
│ ┌──────────┬───────────┬──────────────────────────────────┐ │
│ │ CANTIDAD │ (UNIDAD)* │ DESCRIPCIÓN DE PRODUCTO          │ │
│ └──────────┴───────────┴──────────────────────────────────┘ │
│ Comentario: Por medio del presente conduce hacemos entrega… │
│ Despachado por: ________   Recibido por: ________           │
│ Fecha: ________            (Cédula / Firma opcionales)      │
│ *Favor devolver este conduce después de haber recibido y    │
│  firmado el mismo*                                          │
└─────────────────────────────────────────────────────────────┘
* Columna UNIDAD configurable por empresa (print_settings.show_unit_column).
```

## 9. Búsqueda y rendimiento

- Paginación y ordenamiento **en el servidor** (parámetros en la URL: `?q=&company=&status=&from=&to=&page=&sort=`).
- `delivery_notes.search_text`: texto normalizado (minúsculas, sin acentos) con número, punto comercial, asunto,
  descripciones de productos, despachado/recibido por; mantenido por trigger. Índice GIN `pg_trgm` → búsquedas
  `ILIKE '%texto%'` rápidas con decenas de miles de registros.
- Índices compuestos para filtros frecuentes: `(company_id, note_date DESC)`, `(company_id, status)`, `(created_by)`.
- Lista usa una vista con solo las columnas necesarias; conteo total con la misma consulta filtrada.
- Dashboard: una función SQL que devuelve todos los contadores en una llamada.
- Autocomplete (puntos, productos): consulta limitada (20 resultados) con debounce en el cliente.
- Skeletons con `loading.tsx` y Suspense; nunca cargar miles de filas en el navegador.

## 10. Importación de históricos

Asistente con estado persistente en BD (`import_batches`, `import_files`, `import_records`, `import_errors`):
SUBIR → ANALIZAR → MAPEAR → VALIDAR → ERRORES → VISTA PREVIA → CONFIRMAR → IMPORTAR → REPORTE.
Detalle completo en `IMPORT_HISTORY.md`. El commit final es una función SQL transaccional por lote.

## 11. Errores, carga y logs

- Funciones SQL lanzan códigos estables (`raise exception 'NOTE_ALREADY_ISSUED' using errcode = 'P0001'`).
- `src/server/errors.ts` mapea código → mensaje en español; errores desconocidos → "Ocurrió un error inesperado.
  Referencia: <requestId>" y se registra el detalle técnico en los logs del servidor (sin datos sensibles).
- Toda acción importante tiene estados loading / success / error; botones críticos se deshabilitan mientras
  la acción está en curso (y la BD protege igualmente).
- Contexto técnico para auditoría (IP, user agent, request id) lo fija `withUserTransaction` con
  `set_config('app.request_context', <json>, true)`; `app.request_context()` lo lee dentro de las funciones.

## 12. Despliegue gratuito (ADR-018, pendiente de confirmar el equipo)

Un solo `docker-compose.yml` con:

| Servicio | Imagen | Función |
|---|---|---|
| `db` | `postgres:16-alpine` | Base de datos; volumen persistente; no expuesto fuera del equipo |
| `app` | build del `Dockerfile` (Next.js `output: 'standalone'`) | Aplicación |
| `caddy` | `caddy:2` | HTTPS en la red local (certificado interno de Caddy, instalado una vez en cada PC) |
| `backup` | `postgres:16-alpine` + cron | `pg_dump` diario, rotación, copia a disco externo / nube gratuita con rclone |
| `cloudflared` (opcional) | `cloudflare/cloudflared` | Acceso seguro desde otras sucursales sin abrir puertos (Cloudflare Tunnel, gratis) |

Opciones de equipo:
1. **Recomendado:** mini PC / PC siempre encendida en la oficina principal, con UPS (Linux, o Windows con Docker Desktop).
2. VM gratuita en la nube ("Always Free", p. ej. Oracle Cloud) con el mismo compose; verificar condiciones de uso empresarial.

Sin servicios de pago. Sin correo saliente (el administrador restablece contraseñas).

## 13. Continuidad entre cuentas de Claude

- El repositorio es la fuente de verdad: `CLAUDE.md` (memoria), `PROJECT_STATUS.md` (estado y próximo paso),
  `docs/HANDOFF.md` (transferencia + prompt listo), `docs/DECISIONS.md` (por qué), `docs/ROADMAP.md` (qué falta).
- Reglas del cliente → `BUSINESS_RULES.md`; hallazgos de los Excel → `IMPORT_HISTORY.md`; esquema → `DATABASE.md`.
- Commits pequeños y descriptivos; la documentación se actualiza **en el mismo commit** o inmediatamente después.
