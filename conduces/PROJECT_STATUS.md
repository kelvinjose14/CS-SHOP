# PROJECT STATUS

**Última actualización:** 2026-09-30

**FASE ACTUAL:** Fase 0 — Documentación base y arquitectura (**terminada**, adaptada a herramientas gratuitas;
esperando aprobación del plan)

**ESTADO GENERAL:** ~5 % del proyecto total. Diseño completo; 0 % de código de aplicación. No existen todavía
`package.json`, código fuente ni migraciones.

**UBICACIÓN (definitiva, ADR-019):** carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP` (**público**).
Trabajo actual en la rama `claude/modest-noether-izh1p9`, PR [kelvinjose14/CS-SHOP#22](https://github.com/kelvinjose14/CS-SHOP/pull/22)
hacia `main` (sin fusionar todavía). CAPS Shop (raíz de CS-SHOP) es otro programa sin relación y no se toca.

## TERMINADO
- Análisis de requisitos (56 secciones del pedido original).
- Stack definitivo **100 % gratuito**: Next.js + TypeScript + Tailwind + PostgreSQL 16 autogestionado + auth propia
  (argon2id + sesiones en BD) + @react-pdf/renderer + SheetJS + Docker Compose/Caddy (`docs/DECISIONS.md` ADR-014 a 018).
- Arquitectura, flujo de escritura, numeración atómica y concurrencia, despliegue (`docs/ARCHITECTURE.md`).
- Esquema de BD completo: tablas, constraints, índices, triggers, roles de BD, funciones previstas (`docs/DATABASE.md`).
- Reglas de negocio RN-01 a RN-20 (`docs/BUSINESS_RULES.md`).
- Autenticación, roles, matriz de permisos, RLS (`docs/SECURITY.md`).
- Estrategia de importación de 700+ Excel (`docs/IMPORT_HISTORY.md`) y de respaldo (`docs/BACKUP_AND_RECOVERY.md`).
- Documentos de continuidad: `CLAUDE.md`, este archivo, `docs/HANDOFF.md` (con prompt para nueva cuenta), `docs/ROADMAP.md`.
- `.env.example` y `.gitignore`.

## EN PROGRESO
- Nada. Esperando la aprobación del plan y que se fusione el PR #22 en `main`.

## PENDIENTE
- Fusionar el PR #22 en `main` (sin eso, una sesión nueva no encuentra esta documentación).
- Respuestas a `docs/OPEN_QUESTIONS.md` Q3–Q15.
- Fases 1 a 7 (`docs/ROADMAP.md`).

## ÚLTIMO CAMBIO REALIZADO
- 2026-09-30: el cliente indicó "programa totalmente nuevo, aparte de CAPS Shop; todo con instrumentos gratis; uso
  interno". Se reemplazó Supabase por PostgreSQL autogestionado + autenticación propia + archivos en BD + migraciones
  con ejecutor propio + despliegue Docker Compose.
- 2026-09-30: el cliente no quiere dar acceso a un repositorio nuevo → el proyecto se queda en `conduces/` de
  CS-SHOP como programa independiente (ADR-019). Como CS-SHOP es público, `.gitignore` bloquea Excel/CSV reales.

## ARCHIVOS IMPORTANTES MODIFICADOS
- `conduces/` (todo): `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`, `.env.example`, `.gitignore`, `docs/*.md`.
- `/CLAUDE.md` en la raíz de CS-SHOP: índice de los dos programas del repositorio (CAPS Shop y Conduces).

## MIGRACIONES EJECUTADAS
- Ninguna. (Orden previsto en `docs/DATABASE.md` §10.)

## DECISIONES IMPORTANTES
- Programa independiente de CAPS Shop, en la carpeta `conduces/` de CS-SHOP (ADR-019). Repositorio público: nunca datos reales ni secretos en Git.
- Solo herramientas gratuitas; PostgreSQL autogestionado; sin Supabase ni servicios de pago (ADR-014).
- Autenticación propia con argon2id y sesiones en PostgreSQL; sin correo saliente (ADR-015).
- Logos y Excel importados guardados en PostgreSQL → un único respaldo (ADR-016).
- Borradores no consumen número; el número se asigna solo al emitir (RN-01).
- Numeración por empresa con contador en tabla + bloqueo de fila; `UNIQUE (company_id, number_prefix, number_value)` (ADR-005).
- Lógica crítica en funciones SQL transaccionales; la app se conecta con un rol sin BYPASSRLS (ADR-004, SECURITY §2).
- PDF único (react-pdf) para vista previa, impresión y descarga (ADR-006).
- Secuencias nacen `pending_confirmation`: no se emite hasta confirmar el próximo número (RN-14).

## PROBLEMAS CONOCIDOS
- El CI de CAPS Shop corre en todos los PR (también en los de conduces) pero no prueba este proyecto; conduces tendrá
  su propio workflow en la Fase 1.
- CS-SHOP es público: el código y la documentación de conduces se ven en internet (OPEN_QUESTIONS Q16).
- Faltan muestras del conduce impreso y de los Excel históricos.

## PRÓXIMO PASO RECOMENDADO
1. Cliente: aprobar el plan y fusionar el PR [kelvinjose14/CS-SHOP#22](https://github.com/kelvinjose14/CS-SHOP/pull/22) en `main`.
2. Iniciar **Fase 1** (`docs/ROADMAP.md`): scaffold Next.js → `docker-compose.yml` (db) + `db/bootstrap.sql` →
   ejecutor de migraciones → migraciones 0001–0004 + semillas → infraestructura `test:db` → auth (login, sesiones,
   cambio de contraseña) → layout → empresas → usuarios → `create-admin` → CI propio `conduces.yml`.

## INSTRUCCIONES PARA CONTINUAR
- Leer `docs/HANDOFF.md` sección "CONTINUAR DESDE OTRA CUENTA" y usar el prompt incluido.
- No implementar reglas de negocio fuera de las funciones SQL descritas en `docs/DATABASE.md` §9.
- Al terminar cada bloque: pruebas, actualizar este archivo, `docs/CHANGELOG.md` y los documentos afectados.
