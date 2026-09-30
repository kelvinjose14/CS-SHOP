# PROJECT STATUS

**Última actualización:** 2026-09-30

**FASE ACTUAL:** Fase 0 — Documentación base y arquitectura (**terminada**, adaptada a herramientas gratuitas;
esperando aprobación del plan y creación del repositorio propio)

**ESTADO GENERAL:** ~5 % del proyecto total. Diseño completo; 0 % de código de aplicación. No existen todavía
`package.json`, código fuente ni migraciones.

**UBICACIÓN ACTUAL (provisional):** carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP`, rama
`claude/modest-noether-izh1p9`. **Destino:** repositorio propio `sistema-conduces` (ADR-013; pasos en `docs/HANDOFF.md` §17).
CAPS Shop (raíz de CS-SHOP) es otro programa sin relación y no se toca.

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
- Nada. Esperando: (1) repositorio `sistema-conduces` creado por el cliente con acceso para Claude, (2) aprobación del plan.

## PENDIENTE
- Trasladar el proyecto al repositorio propio (`docs/HANDOFF.md` §17).
- Respuestas a `docs/OPEN_QUESTIONS.md` Q3–Q15.
- Fases 1 a 7 (`docs/ROADMAP.md`).

## ÚLTIMO CAMBIO REALIZADO
- 2026-09-30: el cliente indicó "programa totalmente nuevo, aparte de CAPS Shop; todo con instrumentos gratis; uso
  interno". Se reemplazó Supabase por PostgreSQL autogestionado + autenticación propia + archivos en BD + migraciones
  con ejecutor propio + despliegue Docker Compose; se decidió repositorio propio.

## ARCHIVOS IMPORTANTES MODIFICADOS
- `conduces/` (todo): `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`, `.env.example`, `.gitignore`, `docs/*.md`.
- `/CLAUDE.md` en la raíz de CS-SHOP (solo en esta rama): aviso de que `conduces/` es otro programa, provisional.

## MIGRACIONES EJECUTADAS
- Ninguna. (Orden previsto en `docs/DATABASE.md` §10.)

## DECISIONES IMPORTANTES
- Programa independiente de CAPS Shop, en repositorio propio (ADR-013).
- Solo herramientas gratuitas; PostgreSQL autogestionado; sin Supabase ni servicios de pago (ADR-014).
- Autenticación propia con argon2id y sesiones en PostgreSQL; sin correo saliente (ADR-015).
- Logos y Excel importados guardados en PostgreSQL → un único respaldo (ADR-016).
- Borradores no consumen número; el número se asigna solo al emitir (RN-01).
- Numeración por empresa con contador en tabla + bloqueo de fila; `UNIQUE (company_id, number_prefix, number_value)` (ADR-005).
- Lógica crítica en funciones SQL transaccionales; la app se conecta con un rol sin BYPASSRLS (ADR-004, SECURITY §2).
- PDF único (react-pdf) para vista previa, impresión y descarga (ADR-006).
- Secuencias nacen `pending_confirmation`: no se emite hasta confirmar el próximo número (RN-14).

## PROBLEMAS CONOCIDOS
- La sesión de Claude no puede crear repositorios en GitHub (403); el cliente debe crear `sistema-conduces`.
- Mientras siga en CS-SHOP, el CI de ese repo corre en los PR pero no prueba este proyecto. No fusionar ese PR.
- Faltan muestras del conduce impreso y de los Excel históricos.

## PRÓXIMO PASO RECOMENDADO
1. Cliente: crear el repositorio vacío `sistema-conduces` (privado) y dar acceso a la app de Claude (HANDOFF §17).
2. Claude: trasladar con `git subtree split`, limpiar referencias a CS-SHOP, cerrar el PR de CS-SHOP sin fusionar.
3. Iniciar **Fase 1** (`docs/ROADMAP.md`): scaffold Next.js → `docker-compose.yml` (db) + `db/bootstrap.sql` →
   ejecutor de migraciones → migraciones 0001–0004 + semillas → infraestructura `test:db` → auth (login, sesiones,
   cambio de contraseña) → layout → empresas → usuarios → `create-admin`.
   (Si el cliente prefiere empezar antes del traslado, puede hacerse dentro de `conduces/` y trasladarse después.)

## INSTRUCCIONES PARA CONTINUAR
- Leer `docs/HANDOFF.md` sección "CONTINUAR DESDE OTRA CUENTA" y usar el prompt incluido.
- No implementar reglas de negocio fuera de las funciones SQL descritas en `docs/DATABASE.md` §9.
- Al terminar cada bloque: pruebas, actualizar este archivo, `docs/CHANGELOG.md` y los documentos afectados.
