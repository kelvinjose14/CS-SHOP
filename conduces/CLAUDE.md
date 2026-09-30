# CLAUDE.md — Sistema de Conduces del Grupo Económico

> Memoria permanente del proyecto para cualquier sesión de Claude Code (u otra IA / desarrollador).
> **El repositorio es la fuente de verdad. No dependas del historial de ningún chat.**
> No guardes aquí secretos, contraseñas, API keys ni credenciales.

## 0. Antes de tocar código (obligatorio)

1. Lee este archivo completo.
2. Lee `PROJECT_STATUS.md` (estado real, fase actual y **PRÓXIMO PASO**).
3. Lee `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/DATABASE.md`.
4. Revisa `git status` y `git log --oneline -15`.
5. **Comprueba si una funcionalidad ya existe antes de construirla.** No reconstruyas algo solo porque no recuerdas haberlo hecho.
6. Si documentación y código se contradicen, analiza ambos, decide, y documenta la resolución en `docs/DECISIONS.md`.

Después de cada bloque de trabajo importante: revisa el código, ejecuta pruebas, actualiza
`PROJECT_STATUS.md`, `docs/CHANGELOG.md` y los documentos afectados (ver §12).

## 1. Objetivo del sistema

Sistema web centralizado para **generar, administrar, consultar, imprimir y controlar conduces** (notas de
entrega) de varias empresas de un mismo Grupo Económico (República Dominicana). Incluye borradores,
emisión con numeración atómica, despacho, recepción, anulación, duplicado, búsqueda, PDF/impresión,
catálogos, usuarios/roles, auditoría e **importación de más de 700 conduces históricos desde Excel**.

## 2. Ubicación dentro del repositorio

Este proyecto vive en la carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP`, que también contiene
un proyecto **distinto e independiente** en la raíz (CAPS Shop, app Electron). Reglas:

- Trabaja **solo dentro de `conduces/`** cuando la tarea sea de conduces. No modifiques CAPS Shop.
- Todas las rutas de esta documentación son relativas a `conduces/` salvo que se diga lo contrario.
- La carpeta es autocontenida: puede moverse a su propio repositorio (ver `docs/HANDOFF.md` §Mover a repo propio).

## 3. Stack (definitivo, ver `docs/DECISIONS.md`)

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript estricto |
| Estilos / UI | Tailwind CSS v4, componentes estilo shadcn/ui (Radix), íconos lucide-react, toasts sonner |
| Base de datos | PostgreSQL (Supabase gestionado) — lógica crítica en funciones SQL |
| Auth | Supabase Auth (email + contraseña, sin registro público) vía `@supabase/ssr` (cookies httpOnly) |
| Archivos | Supabase Storage (buckets privados: logos, importaciones) |
| Validación | Zod en el servidor (Server Actions / Route Handlers) + constraints y funciones en la BD |
| PDF / impresión | `@react-pdf/renderer` en el servidor: **un solo documento PDF** para vista previa, impresión y descarga |
| Excel / CSV | SheetJS (`xlsx`, instalado desde cdn.sheetjs.com, **no** desde npm) |
| Migraciones | Supabase CLI — SQL versionado en `supabase/migrations/` |
| Pruebas | Vitest (unitarias + BD contra PostgreSQL real) y Playwright (E2E) |

## 4. Estructura de carpetas (objetivo; ver estado real en `PROJECT_STATUS.md`)

```
conduces/
  CLAUDE.md  PROJECT_STATUS.md  README.md  .env.example
  docs/                    documentación (fuente de verdad de reglas y decisiones)
  supabase/
    migrations/            SQL versionado (NUNCA editar una migración ya aplicada)
    seed.sql               datos base (roles, permisos, unidades) — sin usuarios ni empresas reales
  src/
    app/                   rutas Next.js (URLs en español: /conduces, /empresas, ...)
      (auth)/login
      (app)/dashboard, conduces, conduces/nuevo, conduces/[id], puntos-comerciales,
            productos, empresas, importar, reportes, usuarios, auditoria, configuracion
      api/                 route handlers (PDF, exportaciones, importación)
    components/            UI reutilizable (ui/ = primitivas)
    features/              lógica por módulo (delivery-notes, companies, imports, ...)
    lib/                   utilidades puras (formato de número, fechas, zod schemas)
    server/                código solo-servidor (`import 'server-only'`): supabase admin, permisos, errores
  tests/
    unit/  db/  e2e/
  scripts/                 create-admin, backup, apply-migrations-to-test-db
```

## 5. Convenciones

- **Código, tablas y columnas en inglés; interfaz, mensajes y documentación en español.**
- TypeScript `strict`. Sin `any` salvo justificación en comentario.
- Toda escritura de negocio pasa por el servidor (Server Action o Route Handler) → valida con Zod →
  llama a una **función SQL** (`rpc`) que vuelve a validar permisos y reglas. Nunca confiar en el frontend.
- Operaciones críticas (emitir, anular, despachar, recibir, duplicar, guardar borrador, importar,
  cambiar secuencia) **solo** mediante funciones SQL transaccionales. No reimplementarlas en TypeScript.
- Errores de BD: `raise exception` con un **código estable** en `message` (p. ej. `NOTE_ALREADY_ISSUED`);
  el servidor lo traduce a un mensaje en español (`src/server/errors.ts`). Nunca mostrar stack traces.
- Fechas: `timestamptz` para instantes; `date` para la fecha comercial del conduce.
  Zona horaria del negocio: `America/Santo_Domingo` (configurable en `system_settings`).
- Cantidades: `numeric(14,3)`. Nunca `float`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), con alcance
  opcional (`feat(numbering): ...`).
- No agregar dependencias sin justificarlo en `docs/DECISIONS.md`.

## 6. Reglas críticas de negocio (resumen — detalle en `docs/BUSINESS_RULES.md`)

1. **Los borradores NO consumen número.** El número se asigna **solo al EMITIR**.
2. Estados: `draft` (BORRADOR) → `issued` (EMITIDO) → `dispatched` (DESPACHADO) → `received` (RECIBIDO); `voided` (ANULADO) desde cualquier estado emitido.
3. Un conduce emitido **no se borra nunca**. Solo se anula (con motivo, usuario y fecha/hora).
4. Tras emitir, el contenido (empresa, punto, asunto, productos, comentario) queda **congelado**. Corregir = anular + duplicar.
5. Cada conduce tiene un **ID interno UUID inmutable**, independiente del número comercial visible.
6. Duplicar copia empresa, punto, asunto, productos y comentario; **no** número, fecha, firmas, estado ni auditoría. El duplicado nace BORRADOR.
7. Los datos de la empresa y del punto comercial se **copian (snapshot)** en el conduce al emitir: reimprimir un conduce viejo muestra los datos de ese momento.
8. Los conduces históricos importados **conservan su número original**; nunca se renumeran.

## 7. Reglas de numeración (NO modificar sin analizar consecuencias)

- Secuencia **por empresa** en `delivery_note_sequences` (prefijo, separador, dígitos mínimos, último número, estado).
- Formato: `prefijo + separador + lpad(número, dígitos_mínimos)` → `NS-710`, `NS-0710`, `JG-000710`, `710`.
- Asignación **atómica en PostgreSQL** dentro de la función `issue_delivery_note`:
  `UPDATE delivery_note_sequences SET last_number = last_number + 1 ... RETURNING` (bloqueo de fila) en la
  misma transacción que cambia el conduce a `issued`. Si algo falla, todo se revierte y el número no se pierde.
- **No usar `CREATE SEQUENCE`/`nextval`** para el número comercial (no es transaccional: deja huecos).
- `UNIQUE (company_id, number_prefix, number_value)`: `NS-710` y `NS-0710` son el mismo número → imposible duplicar.
- Trigger que impide cambiar `number_*` una vez asignado. Un número anulado nunca se reutiliza.
- Una secuencia nueva nace `pending_confirmation`: **no se puede emitir** hasta que un administrador confirme el próximo número (por los históricos). Cambiar el próximo número exige motivo, queda auditado y no puede ser ≤ al mayor número existente.
- `NS-710` es solo un ejemplo observado: **no asumir** que el próximo es `NS-711`.

## 8. Reglas multiempresa

- Empresas en la tabla `companies`. **Nada hardcodeado** (ni empresas, ni usuarios, ni textos de impresión, ni numeración).
- Todo dato de negocio lleva `company_id`. El acceso se limita a las empresas de `user_companies` (el rol `admin` ve todas).
- Aislamiento aplicado en **tres capas**: RLS de PostgreSQL, funciones SQL (`app.has_permission(permiso, empresa)`) y servidor Next.js.
- Puntos comerciales y productos pueden ser de una empresa o de todo el grupo (`company_id` NULL).

## 9. Reglas de seguridad

- Sin registro público. Los usuarios los crea un administrador.
- `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` **solo en servidor** (módulos con `import 'server-only'`). Nunca con prefijo `NEXT_PUBLIC_`.
- RLS activado en **todas** las tablas del esquema `public`. Funciones `SECURITY DEFINER` con `set search_path = ''` y chequeo de permisos al inicio.
- `audit_logs` es de solo inserción (trigger bloquea UPDATE/DELETE, incluso para el service role).
- Archivos de importación: validar extensión, tipo MIME, tamaño y contenido; guardarlos en bucket privado con hash SHA-256.
- Detalle: `docs/SECURITY.md`.

## 10. Cómo ejecutar (cuando exista el código — ver `README.md`)

```bash
cd conduces
npm install
cp .env.example .env.local        # completar valores (ver docs/HANDOFF.md)
npx supabase start                # BD local en Docker (opcional si se usa un proyecto remoto)
npx supabase db reset             # aplica migraciones + seed en local
npm run dev                       # http://localhost:3000
npm run create-admin -- --email admin@empresa.com --name "Nombre"
```

Migraciones:
- Nueva: `npx supabase migration new <nombre>` → editar el SQL → `npx supabase db reset` (local).
- Remoto: `npx supabase db push` (revisar antes con `npx supabase db diff`/`migration list`).
- Registrar cada migración en `docs/DATABASE.md` §Registro de migraciones.

Pruebas:
- `npm test` (unitarias), `npm run test:db` (BD real, incluye concurrencia), `npm run test:e2e` (Playwright).
- `test:db` usa `TEST_DATABASE_URL` (PostgreSQL local; aplica migraciones con un *shim* del esquema `auth`).

## 11. NO modificar sin analizar consecuencias (y documentar)

- `issue_delivery_note` y todo lo de numeración / secuencias / constraints `UNIQUE` de números.
- Triggers de inmutabilidad (números, contenido emitido, auditoría).
- Políticas RLS y `app.has_permission`.
- Migraciones ya aplicadas (crear una nueva en su lugar).
- El documento PDF (formato oficial del conduce) — cambios visibles deben aprobarse.
- La lógica de commit de importación (`commit_import_batch`).

## 12. Documentos del proyecto

| Archivo | Para qué |
|---|---|
| `PROJECT_STATUS.md` | Estado actual, fase, próximo paso. **Actualizar tras cada tarea importante.** |
| `README.md` | Instalación desde cero |
| `docs/HANDOFF.md` | Transferencia a otra cuenta/PC/desarrollador + prompt para nueva sesión |
| `docs/ARCHITECTURE.md` | Arquitectura, flujos, numeración, PDF, multiempresa |
| `docs/DATABASE.md` | Esquema, constraints, funciones, registro de migraciones |
| `docs/BUSINESS_RULES.md` | Reglas de negocio (toda decisión del cliente va aquí) |
| `docs/SECURITY.md` | Roles, matriz de permisos, RLS, sesiones |
| `docs/IMPORT_HISTORY.md` | Estrategia y hallazgos de la importación de históricos |
| `docs/BACKUP_AND_RECOVERY.md` | Respaldos, exportaciones, recuperación |
| `docs/DECISIONS.md` | Registro de decisiones de arquitectura (ADR) |
| `docs/ROADMAP.md` | Fases y tareas detalladas con casillas |
| `docs/OPEN_QUESTIONS.md` | Preguntas pendientes para el cliente |
| `docs/CHANGELOG.md` | Cambios funcionales relevantes |
