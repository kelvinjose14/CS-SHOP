# Sistema de Conduces — Grupo Económico

Sistema web **de uso interno** para generar, administrar, consultar, imprimir y controlar los **conduces** de las
empresas del grupo: multiempresa, numeración atómica por empresa, borradores, estados (emitido, despachado,
recibido, anulado), PDF, usuarios y roles, auditoría e importación de conduces históricos desde Excel.

Programa **independiente** y construido **solo con herramientas gratuitas**. Vive en la carpeta `conduces/` del
repositorio CS-SHOP, cuya raíz es otro programa (CAPS Shop) sin relación con este.

> **Estado:** Fase 0 (diseño y documentación). Todavía no hay aplicación ejecutable.
> Ver [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Stack

Next.js · React · TypeScript · Tailwind CSS · PostgreSQL 16 · autenticación propia (argon2id) · @react-pdf/renderer ·
SheetJS · Docker Compose · Caddy. Todo gratuito / código abierto.
Detalle y motivos en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Instalación para desarrollo (a partir de la Fase 1)

Requisitos: Node.js 22 LTS o superior, npm, Git, y **Docker** o un **PostgreSQL 16** instalado.

```bash
git clone https://github.com/kelvinjose14/CS-SHOP.git
cd CS-SHOP/conduces          # todo el sistema de conduces está en esta carpeta
npm install

cp .env.example .env.local        # completar (explicación de cada variable dentro del archivo)

docker compose up -d db           # PostgreSQL 16 local (crea los roles con db/bootstrap.sql)
npm run db:migrate                # aplica db/migrations y db/seed

npm run create-admin -- --email admin@empresa.com --name "Nombre Apellido"
npm run dev                       # http://localhost:3000
```

Con un PostgreSQL ya instalado (sin Docker): ejecutar una vez `psql -U postgres -f db/bootstrap.sql` y seguir con
`npm run db:migrate`.

## Instalación en el servidor del grupo (a partir de la Fase 7)

```bash
cp .env.example .env              # completar con contraseñas fuertes
docker compose up -d --build      # db + app + caddy (HTTPS) + backup
docker compose exec app npm run create-admin -- --email ... --name "..."
```
Detalle (certificado HTTPS en cada PC, acceso remoto con Cloudflare Tunnel, respaldos): [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Scripts (previstos)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar / ejecutar en producción |
| `npm run db:migrate` / `npm run db:status` | Aplicar migraciones pendientes / ver estado |
| `npm run create-admin` | Crea un usuario administrador |
| `npm run backup` | Respaldo `pg_dump` en `BACKUP_DIR` |
| `npm test` | Pruebas unitarias |
| `npm run test:db` | Pruebas de base de datos (numeración, concurrencia, permisos, RLS) |
| `npm run test:e2e` | Pruebas de extremo a extremo (Playwright) |
| `npm run lint` / `npm run typecheck` | Calidad de código |

## Documentación

| Documento | Contenido |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Memoria del proyecto para Claude Code: convenciones y reglas críticas |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | Estado actual y próximo paso |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Cómo continuar desde otra cuenta, PC o desarrollador |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura, numeración, PDF, multiempresa, despliegue |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Esquema y migraciones |
| [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) | Reglas de negocio |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Autenticación, roles, permisos y seguridad |
| [`docs/IMPORT_HISTORY.md`](docs/IMPORT_HISTORY.md) | Importación de conduces históricos |
| [`docs/BACKUP_AND_RECOVERY.md`](docs/BACKUP_AND_RECOVERY.md) | Respaldos y recuperación |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisiones de arquitectura (ADR) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Fases y tareas |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Preguntas pendientes |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Cambios relevantes |
