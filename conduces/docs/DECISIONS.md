# Registro de decisiones (ADR)

Formato: contexto → decisión → consecuencias. Estado: **Aceptada**, **Propuesta** (pendiente del cliente),
**Reemplazada por ADR-X**. No borrar decisiones: si cambian, se agrega una nueva que reemplaza a la anterior.

---

## ADR-001 Ubicación del proyecto: carpeta `conduces/` dentro de `kelvinjose14/CS-SHOP` — Reemplazada por ADR-013 (2026-09-30)
**Contexto:** la sesión de desarrollo se inició en el repositorio `CS-SHOP`, que ya contiene otro sistema en
producción (CAPS Shop, Electron) con su propio README, CHANGELOG, docs y CI. Crear los archivos pedidos en la raíz
habría mezclado o sobrescrito ese proyecto.
**Decisión:** el sistema de conduces vive en `conduces/`, 100 % autocontenido (su propio package.json, docs,
migraciones, .gitignore). Un `CLAUDE.md` en la raíz del repo redirige a `conduces/CLAUDE.md`.
**Consecuencias:** se recomienda moverlo a un repositorio propio antes o durante la Fase 1 (ver HANDOFF §Mover a repo
propio; `git subtree split` conserva el historial). El CI de CAPS Shop se ejecuta en cada PR; no se ve afectado.

## ADR-002 Next.js (App Router) + React + TypeScript + Tailwind — Aceptada
Preferencia explícita del cliente. App Router permite Server Components (lecturas rápidas sin API extra) y Server
Actions (escrituras con validación en servidor). TypeScript estricto.

## ADR-003 PostgreSQL gestionado por Supabase — Reemplazada por ADR-014 (2026-09-30)
**Contexto:** se necesita BD relacional, auth segura, almacenamiento de archivos y backups, con poco mantenimiento.
**Decisión:** Supabase (PostgreSQL + Auth + Storage). Toda la lógica crítica en SQL estándar (migraciones SQL puras),
por lo que la BD es portable a cualquier PostgreSQL.
**Consecuencias:** dependencia de Supabase para Auth/Storage (sustituible). Plan Free no es apto para producción
(se pausa y sin backups gestionados) → recomendado plan Pro. Pruebas de BD corren en PostgreSQL local con un shim de `auth`.
**Reemplazada:** el cliente pidió solo herramientas gratuitas (ver ADR-014).

## ADR-004 Lógica crítica en funciones SQL transaccionales — Aceptada
Emisión, estados, anulación, duplicado, borradores, secuencias e importación se implementan como funciones
`SECURITY DEFINER` en PostgreSQL. El servidor Next.js valida y llama. Motivo: atomicidad real, una sola fuente de
verdad y seguridad aunque se llame a la API directamente.

## ADR-005 Numeración con contador en tabla + bloqueo de fila, no `CREATE SEQUENCE` — Aceptada
`UPDATE ... SET last_number = last_number + 1 RETURNING` dentro de la transacción de emisión. Transaccional (sin
huecos por fallos), configurable por empresa, confirmable tras importar. `UNIQUE (company_id, number_prefix,
number_value)` como red de seguridad. Ver ARCHITECTURE §5.

## ADR-006 PDF único con `@react-pdf/renderer` para vista previa, impresión y descarga — Aceptada
**Alternativas:** (a) HTML + CSS de impresión y PDF con Chromium headless (Playwright/Puppeteer): fiel, pero requiere
Chromium en el servidor (pesado en serverless). (b) HTML para imprimir + react-pdf para PDF: dos plantillas que
divergen. **Decisión:** un solo PDF generado en servidor; "Imprimir" imprime ese PDF. Consistencia garantizada, sin
Chromium, funciona en cualquier host Node. **Consecuencia:** la vista previa se ve en el visor PDF del navegador.

## ADR-007 SheetJS desde el tarball oficial — Aceptada
El paquete `xlsx` de npm está desactualizado (0.18.x con vulnerabilidades conocidas). Se instala desde
`https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz` (versión exacta fijada en package.json). Es la única librería
madura que lee `.xls` (BIFF) además de `.xlsx` y `.csv`. ExcelJS no lee `.xls`.

## ADR-008 Validación con Zod en servidor + constraints en BD — Aceptada

## ADR-009 Roles y permisos en tablas — Aceptada
`roles`, `permissions`, `role_permissions`, `user_companies` (con `role_code` reservado por empresa). Permite roles
personalizados más adelante sin cambiar código.

## ADR-010 Snapshot de empresa y punto comercial al emitir — Propuesta
Reimpresiones fieles al momento de emisión aunque cambien los datos maestros (RN-11). Se guarda en `jsonb`
(configuración/snapshot, no datos de negocio consultables).

## ADR-011 UI: componentes estilo shadcn/ui (código copiado al repo) — Aceptada
Primitivas Radix accesibles (dropdown, dialog, popover), `cmdk` para autocomplete, `sonner` para toasts, `lucide-react`
para íconos. El código de los componentes queda en `src/components/ui` (sin dependencia de un "kit" cerrado).

## ADR-012 Zona horaria del negocio `America/Santo_Domingo` — Propuesta
Configurable en `system_settings`. Timestamps en UTC (`timestamptz`); fechas comerciales como `date`.

---

> **2026-09-30 — Decisiones del cliente:** "Es un programa totalmente nuevo, aparte de CAPS Shop. Todo con
> instrumentos gratis. Es uso interno." Las ADR-013 a ADR-018 aplican estas decisiones.

## ADR-013 Repositorio propio, separado de CAPS Shop — Aceptada (2026-09-30)
**Contexto:** el cliente confirmó que es un programa totalmente nuevo, independiente de CAPS Shop.
**Decisión:** el proyecto tendrá su propio repositorio (nombre propuesto: `sistema-conduces`, privado). Mientras ese
repositorio no exista, el trabajo se guarda en la carpeta `conduces/` de CS-SHOP, que ya es autocontenida, y se
trasladará con `git subtree split` conservando el historial (HANDOFF §17).
**Estado:** la sesión de Claude no tiene permiso para crear repositorios en GitHub; el cliente debe crear el repositorio
vacío y dar acceso a la app de Claude. Hasta el traslado, **no** se debe fusionar `conduces/` en la rama `main` de CS-SHOP.

## ADR-014 Solo software libre/gratuito; PostgreSQL autogestionado, sin Supabase — Aceptada (2026-09-30)
**Contexto:** uso interno y costo cero. Los planes gratuitos en la nube tienen límites (pausas por inactividad, sin
backups gestionados, condiciones que prohíben uso comercial en algunos hosts).
**Decisión:** PostgreSQL 16 (código abierto) + Next.js, sin servicios de pago ni dependencias de un proveedor. Todo corre
con Docker Compose en un equipo del grupo o en cualquier servidor. Se eliminan Supabase Auth y Supabase Storage
(ver ADR-015 y ADR-016). La lógica crítica sigue en funciones SQL y la seguridad por filas (RLS) sigue en PostgreSQL.
**Consecuencias:** el grupo opera el servidor (encendido, respaldos). Mitigado con respaldos automáticos
(BACKUP_AND_RECOVERY.md). La arquitectura es portable: si más adelante se quiere nube, se lleva el mismo `docker compose`.

## ADR-015 Autenticación propia con sesiones en PostgreSQL — Aceptada (2026-09-30)
**Decisión:** usuarios en la tabla `users` con contraseña en hash **argon2id** (`@node-rs/argon2`); sesiones en la tabla
`sessions` (token aleatorio de 256 bits en una cookie httpOnly; en la BD solo se guarda su SHA-256); expiración por
inactividad y absoluta; bloqueo temporal tras intentos fallidos; cambio de contraseña obligatorio en el primer acceso.
Sin registro público y sin correo: el administrador crea usuarios y restablece contraseñas.
**Alternativas descartadas:** Auth.js (el proveedor de credenciales está desaconsejado por el propio proyecto y usa JWT
por defecto) y Supabase Auth (ADR-014).

## ADR-016 Archivos (logos e importaciones) guardados en PostgreSQL — Aceptada (2026-09-30)
**Decisión:** tabla `stored_files` con el contenido en `bytea` (logos ≤ 1 MB; Excel ≤ `IMPORT_MAX_FILE_MB`). Volumen
esperado: decenas de MB. **Ventaja:** un solo `pg_dump` respalda todo (datos + logos + Excel originales).
**Revisar** si el volumen supera ~2 GB (pasar a disco o a un almacenamiento de objetos).

## ADR-017 Migraciones SQL con un ejecutor propio — Aceptada (2026-09-30)
**Decisión:** archivos `db/migrations/NNNN_descripcion.sql` aplicados en orden por `scripts/db-migrate.mjs`
(sin dependencias extra), que registra versión, nombre, checksum y fecha en `schema_migrations`, aplica cada archivo en
una transacción y **se niega a continuar** si una migración ya aplicada fue modificada.

## ADR-018 Despliegue gratuito: Docker Compose en un equipo del grupo — Propuesta (2026-09-30)
**Recomendado:** un equipo siempre encendido en la oficina principal (mini PC o PC con Linux, o Windows con Docker
Desktop), con UPS. Servicios: `db` (PostgreSQL 16), `app` (Next.js), `caddy` (HTTPS en la red local), `backup`
(respaldo diario). Acceso desde las PCs de la red por navegador. Acceso desde otras sucursales: **Cloudflare Tunnel**
(gratis, sin abrir puertos) o Tailscale.
**Alternativa gratuita en la nube:** una VM "Always Free" (p. ej. Oracle Cloud) con el mismo `docker compose`.
Revisar siempre las condiciones del proveedor para uso empresarial: algunos planes gratuitos (p. ej. Vercel Hobby) no
permiten uso comercial.
