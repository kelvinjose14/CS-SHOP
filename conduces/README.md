# Sistema de Conduces — Grupo Económico

Sistema web para generar, administrar, consultar, imprimir y controlar los **conduces** de las empresas del grupo:
multiempresa, numeración atómica por empresa, borradores, estados (emitido, despachado, recibido, anulado), PDF,
usuarios y roles, auditoría e importación de conduces históricos desde Excel.

> **Estado:** Fase 0 (diseño y documentación). Todavía no hay aplicación ejecutable.
> Ver [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Stack

Next.js · React · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage) · @react-pdf/renderer · SheetJS.
Detalle y motivos en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Instalación desde cero (a partir de la Fase 1)

Requisitos: Node.js 22 LTS o superior, npm, Git y Docker (para la base de datos local de Supabase).

```bash
git clone https://github.com/kelvinjose14/CS-SHOP.git
cd CS-SHOP/conduces
npm install

cp .env.example .env.local
# Completar .env.local:
#  - En local: `npx supabase start` imprime la URL y las claves.
#  - En la nube: panel de Supabase → Project Settings → API y Database.

npx supabase start        # levanta PostgreSQL/Auth/Storage locales (Docker)
npx supabase db reset     # aplica migraciones y datos base (roles, permisos, unidades)

npm run create-admin -- --email admin@empresa.com --name "Nombre Apellido"
npm run dev               # http://localhost:3000
```

Usando un proyecto de Supabase en la nube en lugar de Docker:

```bash
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push      # aplica las migraciones pendientes
```

## Scripts (previstos)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar / ejecutar en producción |
| `npm test` | Pruebas unitarias |
| `npm run test:db` | Pruebas de base de datos (numeración, concurrencia, permisos, RLS) contra `TEST_DATABASE_URL` |
| `npm run test:e2e` | Pruebas de extremo a extremo (Playwright) |
| `npm run lint` / `npm run typecheck` | Calidad de código |
| `npm run create-admin` | Crea el primer usuario administrador |

## Documentación

| Documento | Contenido |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Memoria del proyecto para Claude Code: convenciones y reglas críticas |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | Estado actual y próximo paso |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Cómo continuar desde otra cuenta, PC o desarrollador |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura, numeración, PDF, multiempresa |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Esquema y migraciones |
| [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) | Reglas de negocio |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Roles, permisos y seguridad |
| [`docs/IMPORT_HISTORY.md`](docs/IMPORT_HISTORY.md) | Importación de conduces históricos |
| [`docs/BACKUP_AND_RECOVERY.md`](docs/BACKUP_AND_RECOVERY.md) | Respaldos y recuperación |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Fases y tareas |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Preguntas pendientes |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Cambios relevantes |
