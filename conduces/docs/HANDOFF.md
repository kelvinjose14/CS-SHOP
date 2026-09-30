# HANDOFF — Transferencia del proyecto

Para: otra cuenta de Claude, otra computadora, otro desarrollador u otra IA.
Última actualización: 2026-09-30 (fin de la Fase 0, rediseño a herramientas gratuitas)

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

**Dónde está el proyecto (ADR-019):** carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP`, rama `main`.
Si hay trabajo reciente sin fusionar, está en un PR abierto o una rama `claude/*` (revisar ambos).
CAPS Shop (raíz de CS-SHOP) es **otro programa sin relación**: no se toca.
**El repositorio es público:** nunca subir datos reales ni secretos.

---

## 1. Qué es el proyecto

Sistema web **de uso interno** para generar, administrar, consultar, imprimir y controlar **conduces** (notas de
entrega) de las empresas de un Grupo Económico en República Dominicana: multiempresa, numeración atómica por empresa,
borradores, estados, anulación, duplicado, PDF, usuarios/roles, auditoría e importación de 700+ conduces históricos en
Excel. Programa **totalmente nuevo e independiente de CAPS Shop**. **Solo herramientas gratuitas.**

## 2. Estado actual

**Fase 0 terminada** (documentación, arquitectura, esquema de BD, estrategias), ya adaptada a herramientas gratuitas.
**No hay código de aplicación, migraciones ni `package.json` todavía.** Falta que el cliente apruebe el plan y que se
fusione en `main` el PR de la Fase 0 ([kelvinjose14/CS-SHOP#22](https://github.com/kelvinjose14/CS-SHOP/pull/22)).

## 3. Cómo instalarlo (a partir de la Fase 1)

Requisitos: Node.js 22 LTS+, npm, Git, y Docker **o** PostgreSQL 16 instalado.

```bash
git clone https://github.com/kelvinjose14/CS-SHOP.git && cd CS-SHOP/conduces
npm install
cp .env.example .env.local   # completar (§6)
```

## 4. Cómo ejecutarlo (a partir de la Fase 1)

```bash
docker compose up -d db      # PostgreSQL 16 (ejecuta db/bootstrap.sql al crearse)
npm run db:migrate           # migraciones + semillas
npm run create-admin -- --email admin@empresa.com --name "Nombre"
npm run dev                  # http://localhost:3000
```
Producción: `docker compose up -d --build` (db + app + caddy + backup). Ver ARCHITECTURE §12.

## 5. Servicios externos necesarios

**Ninguno de pago.** Todo corre en un equipo del grupo con Docker.

| Componente | Uso | Obligatorio |
|---|---|---|
| Equipo siempre encendido (mini PC/PC/servidor) con Docker, idealmente con UPS | Ejecutar BD + aplicación | Sí (producción) |
| Disco USB externo | Copias de respaldo offline | Recomendado |
| Nube gratuita vía rclone (Google Drive / OneDrive) | Copia de respaldo fuera del equipo | Recomendado |
| Cloudflare Tunnel (gratis) o Tailscale | Acceso desde sucursales fuera de la red local | Opcional |
| GitHub (repositorio `kelvinjose14/CS-SHOP`, público, gratuito) | Código y documentación | Sí |

## 6. Variables de entorno necesarias

Ver `.env.example` (explica cada una). Resumen: `DATABASE_URL` (rol `conduces_app`), `DATABASE_OWNER_URL`
(rol dueño, solo migraciones/respaldos/scripts), `POSTGRES_PASSWORD`, `CONDUCES_OWNER_PASSWORD`,
`CONDUCES_APP_PASSWORD` (docker compose), `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE`,
`IMPORT_MAX_FILE_MB`, `LOG_LEVEL`, `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `BACKUP_RCLONE_REMOTE`,
`TEST_DATABASE_ADMIN_URL` (solo pruebas).
**Los valores reales nunca se guardan en el repositorio ni en la documentación.** En producción viven solo en el
archivo `.env` del servidor (y una copia cifrada junto a la clave de respaldos).

## 7. Base de datos utilizada

PostgreSQL 16 autogestionado. Esquema en `docs/DATABASE.md`. Lógica crítica en funciones SQL (esquemas `public` y `app`).
Roles: `conduces_owner` (dueño) y `conduces_app` (aplicación, con RLS).

## 8. Cómo aplicar migraciones

- `npm run db:status` → ver aplicadas y pendientes.
- `npm run db:migrate` → aplica las pendientes (usa `DATABASE_OWNER_URL`), cada una en su transacción; falla si una
  migración ya aplicada fue modificada.
- Producción: `npm run backup` **antes**, luego `docker compose exec app npm run db:migrate`.
- Pruebas: `npm run test:db` crea una BD temporal y aplica todo.
- Registrar cada migración aplicada en `docs/DATABASE.md` §10 y en `PROJECT_STATUS.md`.

## 9. Cómo crear un usuario administrador

(Disponible desde la Fase 1.)
```bash
npm run create-admin -- --email admin@empresa.com --name "Nombre Apellido"
```
Usa `DATABASE_OWNER_URL`, crea el usuario con rol `admin`, genera una contraseña temporal aleatoria y la muestra
**una sola vez** en la consola. En el primer acceso el sistema obliga a cambiarla. No se guarda en ningún archivo.
Si se pierde el acceso de todos los administradores, volver a ejecutar el script con otro correo (queda auditado).

## 10. Funcionalidades terminadas

- Documentación y diseño completos (Fase 0).

## 11. Funcionalidades que faltan

Todas las de las Fases 1–7 (`docs/ROADMAP.md`).

## 12. Problemas conocidos

- El proyecto comparte repositorio con CAPS Shop (otro programa) y ese repositorio es **público** (ADR-019).
- El CI de CAPS Shop corre en todos los PR, también en los de conduces, pero no prueba este proyecto. Conduces tendrá
  su propio workflow limitado a `conduces/**` (Fase 1).
- Sin muestras del conduce impreso ni de los Excel: la plantilla PDF y el importador se ajustarán al recibirlas.

## 13. Decisiones arquitectónicas importantes

Ver `docs/DECISIONS.md`. Las más críticas: ADR-004 (lógica en SQL), ADR-005 (numeración con bloqueo de fila),
ADR-006 (PDF único), ADR-014 (solo gratuito, PostgreSQL autogestionado), ADR-015 (auth propia), ADR-019 (ubicación en CS-SHOP, repositorio público).

## 14. Próximo paso

Ver `PROJECT_STATUS.md` → PRÓXIMO PASO RECOMENDADO.

## 15. Archivos que el nuevo Claude debe leer primero

`CLAUDE.md` → `PROJECT_STATUS.md` → `docs/HANDOFF.md` → `docs/ARCHITECTURE.md` → `docs/DATABASE.md` →
`docs/BUSINESS_RULES.md` → `docs/SECURITY.md` → `docs/DECISIONS.md` → `docs/ROADMAP.md` → `docs/OPEN_QUESTIONS.md`.

## 16. Cómo trabajar (para no romper la continuidad)

- Antes de construir algo, **buscarlo** (`grep`, estructura de `src/`, `db/migrations`). No duplicar.
- Toda decisión del cliente → `BUSINESS_RULES.md` o `DECISIONS.md` en el mismo commit.
- Tras cada bloque: pruebas → `PROJECT_STATUS.md` → `CHANGELOG.md` (si es funcional) → docs afectados.
- Commits Conventional Commits, claros (`feat: implement delivery note creation`).
- Nada de servicios de pago ni dependencias con licencia comercial.

## 17. Trasladar a un repositorio propio (opcional, NO planificado)

Decisión vigente: el proyecto se queda en CS-SHOP (ADR-019). Esta sección solo aplica si el cliente cambia de opinión
(por ejemplo, para tener un repositorio privado).

**Paso del cliente (una vez):**
1. En GitHub: **New repository** → nombre `sistema-conduces` → **Private** → sin README, sin .gitignore, sin licencia (vacío).
2. Dar acceso a la app de Claude: https://github.com/apps/claude/installations/select_target → cuenta `kelvinjose14` →
   agregar `sistema-conduces` (o "All repositories").
3. Pedirle a Claude: *"Traslada el proyecto de conduces al repositorio sistema-conduces"*.

**Paso de Claude/desarrollador:**
```bash
# Desde un clon actualizado de CS-SHOP (rama main)
git checkout main && git pull
git subtree split --prefix=conduces -b conduces-standalone      # historial solo de conduces/
git push https://github.com/kelvinjose14/sistema-conduces.git conduces-standalone:main
```
Después, en el repositorio nuevo: quitar de la documentación las menciones a "carpeta `conduces/`" y a CS-SHOP
(`grep -rn "conduces/\|CS-SHOP" .`), actualizar `PROJECT_STATUS.md` (ubicación) y agregar una ADR con la fecha del traslado.
En CS-SHOP, cuando el traslado esté verificado: PR que borre `conduces/`, el workflow de conduces y la fila de conduces
del `CLAUDE.md` de la raíz.

---

===========================
CONTINUAR DESDE OTRA CUENTA
===========================

Instrucciones exactas para el próximo Claude:

1. Abrir el repositorio `kelvinjose14/CS-SHOP` (rama `main`) y trabajar en la carpeta `conduces/`. Revisar PRs abiertos
   y ramas `claude/*` por si hay trabajo sin fusionar.
2. Pegar el prompt de abajo como primer mensaje.
3. Seguir el ORDEN RECOMENDADO del inicio de este archivo.
4. Verificar el estado real: `git status`, `git log --oneline -20`, `ls`, `ls db/migrations`, `npm test` (si existe).
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

Es el "Sistema de Conduces" del Grupo Económico: un programa web interno, totalmente
independiente de CAPS Shop, construido solo con herramientas gratuitas.
Está en la carpeta conduces/ del repositorio kelvinjose14/CS-SHOP (rama main).
La raíz de ese repositorio es OTRO programa (CAPS Shop): trabaja solo dentro de conduces/
y no lo modifiques. El repositorio es público: nunca subas datos reales ni secretos.
Revisa también si hay PRs abiertos o ramas con trabajo sin fusionar.

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
