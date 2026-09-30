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

Sistema web **de uso interno** para **generar, administrar, consultar, imprimir y controlar conduces** (notas de
entrega) de varias empresas de un mismo Grupo Económico (República Dominicana). Incluye borradores,
emisión con numeración atómica, despacho, recepción, anulación, duplicado, búsqueda, PDF/impresión,
catálogos, usuarios/roles, auditoría e **importación de más de 700 conduces históricos desde Excel**.

Condiciones del cliente (2026-09-30):
- Es un **programa totalmente nuevo e independiente de CAPS Shop**.
- **Solo herramientas gratuitas** (software libre, sin servicios de pago). **Uso interno** del grupo.

## 2. Ubicación del proyecto

- Destino: **repositorio propio** (nombre propuesto `sistema-conduces`, ADR-013).
- Mientras ese repositorio no exista, el proyecto vive temporalmente en la carpeta `conduces/` del repositorio
  `kelvinjose14/CS-SHOP`, cuya raíz contiene **otro sistema sin relación** (CAPS Shop). En ese caso:
  trabaja **solo dentro de `conduces/`**, no modifiques CAPS Shop y **no fusiones `conduces/` en `main` de CS-SHOP**.
- Todas las rutas de esta documentación son relativas a la raíz del proyecto (`conduces/` mientras siga ahí).
- Cómo trasladarlo: `docs/HANDOFF.md` §17.

## 3. Stack (definitivo, 100 % gratuito — ver `docs/DECISIONS.md`)

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript estricto |
| Estilos / UI | Tailwind CSS v4, componentes estilo shadcn/ui (Radix), íconos lucide-react, toasts sonner |
| Base de datos | **PostgreSQL 16** autogestionado — lógica crítica en funciones SQL + RLS |
| Acceso a BD | `pg` (node-postgres), consultas parametrizadas, una transacción por petición con el usuario fijado |
| Autenticación | Propia: tabla `users` (argon2id vía `@node-rs/argon2`) + tabla `sessions` (cookie httpOnly) |
| Archivos | En PostgreSQL (`stored_files`, `bytea`): logos y Excel importados → un solo respaldo |
| Validación | Zod en el servidor + constraints, triggers y funciones en la BD |
| PDF / impresión | `@react-pdf/renderer`: **un solo PDF** para vista previa, impresión y descarga |
| Excel / CSV | SheetJS (`xlsx`, instalado desde cdn.sheetjs.com, **no** desde npm) |
| Migraciones | SQL versionado en `db/migrations/` + ejecutor propio `scripts/db-migrate.mjs` |
| Pruebas | Vitest (unitarias + BD contra PostgreSQL real) y Playwright (E2E) |
| Despliegue | Docker Compose: `db` + `app` + `caddy` (HTTPS) + `backup`; acceso remoto opcional con Cloudflare Tunnel |

**Prohibido** agregar servicios de pago o dependencias con licencia comercial. Toda dependencia nueva se justifica en `docs/DECISIONS.md`.

## 4. Estructura de carpetas (objetivo; ver estado real en `PROJECT_STATUS.md`)

```
CLAUDE.md  PROJECT_STATUS.md  README.md  .env.example  docker-compose.yml  Dockerfile
docs/                      documentación (fuente de verdad de reglas y decisiones)
db/
  migrations/              0001_*.sql, 0002_*.sql ... (NUNCA editar una migración ya aplicada)
  seed/                    datos base idempotentes (roles, permisos, unidades, ajustes) — sin usuarios ni empresas reales
  bootstrap.sql            crea los roles de BD (conduces_owner, conduces_app) — se ejecuta una vez
deploy/                    Caddyfile, script de respaldo, cloudflared (opcional)
src/
  app/                     rutas Next.js (URLs en español: /conduces, /empresas, ...)
    (auth)/login, (auth)/cambiar-contrasena
    (app)/dashboard, conduces, conduces/nuevo, conduces/[id], puntos-comerciales,
          productos, empresas, importar, reportes, usuarios, auditoria, configuracion
    api/                   route handlers (PDF, exportaciones, importación, archivos)
  components/              UI reutilizable (ui/ = primitivas)
  features/                lógica por módulo (delivery-notes, companies, imports, ...)
  lib/                     utilidades puras (formato de número, fechas, esquemas zod)
  server/                  solo-servidor (`import 'server-only'`): db, auth, permisos, errores
tests/
  unit/  db/  e2e/  fixtures/
scripts/                   db-migrate, create-admin, backup, test-db
```

## 5. Convenciones

- **Código, tablas y columnas en inglés; interfaz, mensajes y documentación en español.**
- TypeScript `strict`. Sin `any` salvo justificación en comentario.
- Toda escritura de negocio pasa por el servidor (Server Action o Route Handler) → valida con Zod →
  llama a una **función SQL** que vuelve a validar permisos y reglas. Nunca confiar en el frontend.
- Toda consulta a la BD pasa por `withUserTransaction(user, fn)` (`src/server/db.ts`), que abre una transacción y
  fija `app.user_id` y `app.request_context` con `set_config(..., true)`. Así RLS y auditoría saben quién actúa.
  **Nunca** consultar la BD fuera de ese helper (salvo login y scripts administrativos documentados).
- Solo consultas **parametrizadas** (`$1, $2`). Prohibido concatenar entrada del usuario en SQL.
- Operaciones críticas (emitir, anular, despachar, recibir, duplicar, guardar borrador, importar,
  cambiar secuencia) **solo** mediante funciones SQL transaccionales. No reimplementarlas en TypeScript.
- Errores de BD: `raise exception` con un **código estable** en `message` (p. ej. `NOTE_ALREADY_ISSUED`);
  el servidor lo traduce a un mensaje en español (`src/server/errors.ts`). Nunca mostrar stack traces.
- Fechas: `timestamptz` para instantes; `date` para la fecha comercial del conduce.
  Zona horaria del negocio: `America/Santo_Domingo` (configurable en `system_settings`).
- Cantidades: `numeric(14,3)`. Nunca `float`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), con alcance
  opcional (`feat(numbering): ...`).

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

- Sin registro público. Los usuarios los crea un administrador. Contraseñas solo como hash argon2id.
- Dos roles de PostgreSQL: `conduces_owner` (dueño del esquema; migraciones y respaldos) y `conduces_app` (la aplicación;
  sin `BYPASSRLS`, no es dueño de las tablas, sin acceso a la columna `password_hash`).
- `DATABASE_URL`, `DATABASE_OWNER_URL` y `SESSION_SECRET`: **solo en servidor**. Nunca con prefijo `NEXT_PUBLIC_`.
- RLS activado en **todas** las tablas. Funciones `SECURITY DEFINER` con `set search_path = ''` y chequeo de permisos al inicio.
- `audit_logs` es de solo inserción (trigger bloquea UPDATE/DELETE para todos).
- HTTPS siempre (Caddy en la red local o Cloudflare Tunnel): la cookie de sesión es `Secure`.
- Archivos de importación: validar extensión, firma (magic bytes), tamaño y contenido; hash SHA-256.
- Detalle: `docs/SECURITY.md`.

## 10. Cómo ejecutar (cuando exista el código — ver `README.md`)

```bash
npm install
cp .env.example .env.local                  # completar valores (ver docs/HANDOFF.md §6)
docker compose up -d db                     # PostgreSQL 16 local (o un PostgreSQL ya instalado)
npm run db:migrate                          # aplica db/migrations + db/seed
npm run create-admin -- --email admin@empresa.com --name "Nombre"
npm run dev                                 # http://localhost:3000
```

Migraciones:
- Nueva: crear `db/migrations/NNNN_descripcion.sql` (siguiente número) → `npm run db:migrate`.
- Estado: `npm run db:status`. El ejecutor falla si una migración aplicada fue modificada (checksum).
- Producción: respaldo previo (`npm run backup`) → `npm run db:migrate` con `DATABASE_OWNER_URL` de producción.
- Registrar cada migración en `docs/DATABASE.md` §10.

Pruebas:
- `npm test` (unitarias), `npm run test:db` (BD real, incluye concurrencia), `npm run test:e2e` (Playwright).
- `test:db` crea una base de datos temporal con `TEST_DATABASE_ADMIN_URL`, aplica migraciones, prueba y la borra.

## 11. NO modificar sin analizar consecuencias (y documentar)

- `issue_delivery_note` y todo lo de numeración / secuencias / constraints `UNIQUE` de números.
- Triggers de inmutabilidad (números, contenido emitido, auditoría).
- Políticas RLS, `app.has_permission`, `withUserTransaction` y los permisos de los roles de BD.
- Autenticación y sesiones (`src/server/auth/*`).
- Migraciones ya aplicadas (crear una nueva en su lugar).
- El documento PDF (formato oficial del conduce) — cambios visibles deben aprobarse.
- La lógica de commit de importación (`commit_import_batch`).

## 12. Documentos del proyecto

| Archivo | Para qué |
|---|---|
| `PROJECT_STATUS.md` | Estado actual, fase, próximo paso. **Actualizar tras cada tarea importante.** |
| `README.md` | Instalación desde cero |
| `docs/HANDOFF.md` | Transferencia a otra cuenta/PC/desarrollador + prompt para nueva sesión |
| `docs/ARCHITECTURE.md` | Arquitectura, numeración, PDF, multiempresa, despliegue |
| `docs/DATABASE.md` | Esquema, constraints, funciones, registro de migraciones |
| `docs/BUSINESS_RULES.md` | Reglas de negocio (toda decisión del cliente va aquí) |
| `docs/SECURITY.md` | Autenticación, roles, matriz de permisos, RLS |
| `docs/IMPORT_HISTORY.md` | Estrategia y hallazgos de la importación de históricos |
| `docs/BACKUP_AND_RECOVERY.md` | Respaldos, exportaciones, recuperación |
| `docs/DECISIONS.md` | Registro de decisiones de arquitectura (ADR) |
| `docs/ROADMAP.md` | Fases y tareas detalladas con casillas |
| `docs/OPEN_QUESTIONS.md` | Preguntas pendientes para el cliente |
| `docs/CHANGELOG.md` | Cambios funcionales relevantes |
