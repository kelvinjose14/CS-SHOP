# HANDOFF — Transferencia del proyecto

Para: otra cuenta de Claude, otra computadora, otro desarrollador u otra IA.
Última actualización: 2026-09-30 (fin de la Fase 0)

## ORDEN RECOMENDADO PARA UNA NUEVA SESIÓN

1. Leer `CLAUDE.md`
2. Leer `PROJECT_STATUS.md`
3. Leer `docs/HANDOFF.md` (este archivo)
4. Leer `docs/ARCHITECTURE.md`
5. Leer `docs/DATABASE.md`
6. Revisar `git status` y últimos commits (`git log --oneline -20`)
7. Revisar el código relevante
8. Ejecutar pruebas
9. Continuar desde "PRÓXIMO PASO" de `PROJECT_STATUS.md`

(Todas las rutas son relativas a la carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP`, salvo que el
proyecto ya se haya movido a su propio repositorio — ver §17.)

---

## 1. Qué es el proyecto

Sistema web para generar, administrar, consultar, imprimir y controlar **conduces** (notas de entrega) de las
empresas de un Grupo Económico en República Dominicana: multiempresa, numeración atómica por empresa, borradores,
estados, anulación, duplicado, PDF, usuarios/roles, auditoría e importación de 700+ conduces históricos en Excel.

## 2. Estado actual

**Fase 0 terminada**: documentación, arquitectura, esquema de BD y estrategias. **No hay código de aplicación,
migraciones ni `package.json` todavía.** El plan espera la aprobación del cliente y las respuestas de
`docs/OPEN_QUESTIONS.md` (Q1 y Q2 son las que afectan el arranque de la Fase 1).

## 3. Cómo instalarlo (a partir de la Fase 1)

Requisitos: Node.js 22 LTS+, npm, Git, Docker (solo para Supabase local) o una BD PostgreSQL 15+ para pruebas.

```bash
git clone https://github.com/kelvinjose14/CS-SHOP.git
cd CS-SHOP/conduces
npm install
cp .env.example .env.local   # completar (§6)
```

## 4. Cómo ejecutarlo (a partir de la Fase 1)

```bash
npx supabase start          # BD/Auth/Storage locales (Docker). Imprime URL y claves locales para .env.local
npx supabase db reset       # aplica migraciones + seed
npm run dev                 # http://localhost:3000
```

## 5. Servicios externos necesarios

| Servicio | Uso | Obligatorio |
|---|---|---|
| Supabase (proyecto en la nube o local) | PostgreSQL, Auth, Storage | Sí |
| Host Node.js (Vercel recomendado, o VPS/Docker) | Aplicación Next.js | Sí en producción |
| SMTP (el de Supabase o uno propio) | Invitaciones y recuperación de contraseña | Recomendado |
| Almacenamiento externo (Drive/OneDrive/S3) | Copias de respaldo | Recomendado |

## 6. Variables de entorno necesarias

Ver `.env.example` (documenta cada una). Resumen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (solo servidor), `DATABASE_URL` (migraciones/backups, solo servidor),
`NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE`, `IMPORT_MAX_FILE_MB`, `TEST_DATABASE_URL` (solo pruebas).
**Los valores reales nunca se guardan en el repositorio ni en la documentación.** Se obtienen del panel de Supabase
(Project Settings → API / Database) o de `npx supabase start` en local.

## 7. Base de datos utilizada

PostgreSQL 15+ en Supabase. Esquema en `docs/DATABASE.md`. Lógica crítica en funciones SQL (esquemas `public` y `app`).

## 8. Cómo aplicar migraciones

- Local: `npx supabase db reset` (borra y recrea la BD local con todas las migraciones + seed).
- Remoto: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`. Antes: volcado de respaldo
  (`BACKUP_AND_RECOVERY.md`) y `npx supabase migration list` para ver qué falta.
- Pruebas: `npm run test:db` aplica las migraciones sobre `TEST_DATABASE_URL`.
- Registrar cada migración aplicada en `docs/DATABASE.md` §10 y en `PROJECT_STATUS.md`.

## 9. Cómo crear un usuario administrador

(Disponible desde la Fase 1.)
```bash
npm run create-admin -- --email admin@empresa.com --name "Nombre Apellido"
```
El script usa `SUPABASE_SERVICE_ROLE_KEY` para crear el usuario en Auth, crea su perfil con rol `admin` y muestra una
contraseña temporal **una sola vez** en la consola (o envía invitación si hay SMTP). No se guarda en ningún archivo.

## 10. Funcionalidades terminadas

- Documentación y diseño completos (Fase 0).

## 11. Funcionalidades que faltan

Todas las de las Fases 1–7 (`docs/ROADMAP.md`).

## 12. Problemas conocidos

- El proyecto está dentro de un repositorio que contiene otro sistema (CAPS Shop). Ver Q1 / ADR-001.
- El CI de CAPS Shop (`.github/workflows/build-windows.yml` en la raíz) corre en todos los PR, incluidos los de conduces;
  no prueba este proyecto. Hará falta un workflow propio (o moverlo de repo).
- Sin muestras del conduce impreso ni de los Excel: la plantilla PDF y el importador se ajustarán al recibirlas.

## 13. Decisiones arquitectónicas importantes

Ver `docs/DECISIONS.md`. Las más críticas: ADR-004 (lógica en SQL), ADR-005 (numeración con bloqueo de fila),
ADR-006 (PDF único), ADR-003 (Supabase/PostgreSQL).

## 14. Próximo paso

Ver `PROJECT_STATUS.md` → PRÓXIMO PASO RECOMENDADO.

## 15. Archivos que el nuevo Claude debe leer primero

`CLAUDE.md` → `PROJECT_STATUS.md` → `docs/HANDOFF.md` → `docs/ARCHITECTURE.md` → `docs/DATABASE.md` →
`docs/BUSINESS_RULES.md` → `docs/SECURITY.md` → `docs/DECISIONS.md` → `docs/ROADMAP.md` → `docs/OPEN_QUESTIONS.md`.

## 16. Cómo trabajar (para no romper la continuidad)

- Antes de construir algo, **buscarlo** (`grep`, estructura de `src/`, migraciones). No duplicar.
- Toda decisión del cliente → `BUSINESS_RULES.md` o `DECISIONS.md` en el mismo commit.
- Tras cada bloque: pruebas → `PROJECT_STATUS.md` → `CHANGELOG.md` (si es funcional) → docs afectados.
- Commits Conventional Commits en inglés o español, claros (`feat: implement delivery note creation`).

## 17. Mover a repositorio propio (si se decide en Q1)

```bash
# Desde la raíz de CS-SHOP: extraer conduces/ con su historial a una rama
git subtree split --prefix=conduces -b conduces-standalone
# Crear el repo vacío en GitHub (p. ej. grupo-conduces) y publicar esa rama como main
git push https://github.com/<owner>/grupo-conduces.git conduces-standalone:main
```
Después: borrar `conduces/` y el `CLAUDE.md` de la raíz de CS-SHOP (en un PR), y en el nuevo repo quitar de la
documentación las menciones a "carpeta `conduces/`" (buscar `conduces/` y `CS-SHOP`). Registrar en DECISIONS (ADR nueva).

---

===========================
CONTINUAR DESDE OTRA CUENTA
===========================

Instrucciones exactas para el próximo Claude:

1. Abrir la carpeta del repositorio (clonarlo si hace falta). Si el proyecto sigue en CS-SHOP, trabajar dentro de `conduces/`.
2. Pegar el prompt de abajo como primer mensaje.
3. Seguir el ORDEN RECOMENDADO del inicio de este archivo.
4. Verificar el estado real: `git status`, `git log --oneline -20`, `ls`, `ls supabase/migrations`, `npm test` (si existe).
5. Comparar lo que dice `PROJECT_STATUS.md` con lo que existe en el código. Si difiere, documentar la diferencia en
   `PROJECT_STATUS.md` → PROBLEMAS CONOCIDOS antes de continuar.
6. Revisar `docs/OPEN_QUESTIONS.md`: no inventar respuestas del cliente; usar la propuesta por defecto solo si está
   marcada como tal y dejarlo documentado.
7. Continuar desde **PRÓXIMO PASO RECOMENDADO**.
8. Al terminar cada bloque: pruebas + actualizar documentación + commit + push.

### Prompt para la nueva cuenta (copiar tal cual)

```
Estás continuando un proyecto existente desarrollado previamente con Claude Code.

NO empieces desde cero.

NO reconstruyas el sistema.

El proyecto está en la carpeta conduces/ del repositorio kelvinjose14/CS-SHOP
(salvo que PROJECT_STATUS.md indique que se movió a un repositorio propio).
La raíz de CS-SHOP contiene OTRO sistema (CAPS Shop) que no debes modificar.

Primero lee:

CLAUDE.md
PROJECT_STATUS.md
docs/HANDOFF.md
docs/ARCHITECTURE.md
docs/DATABASE.md
docs/BUSINESS_RULES.md
docs/CHANGELOG.md

Después revisa:

git status
git log reciente
estructura del proyecto
migraciones
pruebas

Comprueba qué está implementado realmente antes de modificar código.

PROJECT_STATUS.md y el código existente son la fuente de verdad sobre el estado actual.

Continúa desde el PRÓXIMO PASO documentado.

Si encuentras una contradicción entre documentación y código, analiza ambos antes de modificar nada y documenta la resolución.
```
