# Registro de decisiones (ADR)

Formato: contexto → decisión → consecuencias. Estado: **Aceptada**, **Propuesta** (pendiente del cliente),
**Reemplazada por ADR-X**. No borrar decisiones: si cambian, se agrega una nueva que reemplaza a la anterior.

---

## ADR-001 Ubicación del proyecto: carpeta `conduces/` dentro de `kelvinjose14/CS-SHOP` — Propuesta (2026-09-30)
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

## ADR-003 PostgreSQL gestionado por Supabase — Aceptada (hosting: Propuesta)
**Contexto:** se necesita BD relacional, auth segura, almacenamiento de archivos y backups, con poco mantenimiento.
**Decisión:** Supabase (PostgreSQL + Auth + Storage). Toda la lógica crítica en SQL estándar (migraciones SQL puras),
por lo que la BD es portable a cualquier PostgreSQL.
**Consecuencias:** dependencia de Supabase para Auth/Storage (sustituible). Plan Free no es apto para producción
(se pausa y sin backups gestionados) → recomendado plan Pro. Pruebas de BD corren en PostgreSQL local con un shim de `auth`.

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
