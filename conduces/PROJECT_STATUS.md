# PROJECT STATUS

**Última actualización:** 2026-09-30

**FASE ACTUAL:** Fase 0 — Documentación base y arquitectura (**terminada**, esperando aprobación del plan)

**ESTADO GENERAL:** ~5 % del proyecto total. Diseño completo; 0 % de código de aplicación. No existen todavía
`package.json`, código fuente ni migraciones para este proyecto.

**UBICACIÓN:** carpeta `conduces/` del repositorio `kelvinjose14/CS-SHOP`, rama de trabajo
`claude/modest-noether-izh1p9`. (La raíz del repo contiene otro sistema, CAPS Shop, que no se toca.)

## TERMINADO
- Análisis de requisitos (56 secciones del pedido original) y del repositorio existente.
- Stack definitivo: Next.js + TypeScript + Tailwind + Supabase (PostgreSQL/Auth/Storage) + @react-pdf/renderer + SheetJS (`docs/DECISIONS.md`).
- Arquitectura, flujo de escritura, numeración atómica y concurrencia (`docs/ARCHITECTURE.md`).
- Esquema de BD completo: tablas, constraints, índices, triggers, funciones previstas (`docs/DATABASE.md`).
- Reglas de negocio RN-01 a RN-20 (`docs/BUSINESS_RULES.md`).
- Roles, matriz de permisos, RLS (`docs/SECURITY.md`).
- Estrategia de importación de 700+ Excel (`docs/IMPORT_HISTORY.md`).
- Estrategia de respaldo (`docs/BACKUP_AND_RECOVERY.md`).
- Documentos de continuidad: `CLAUDE.md`, este archivo, `docs/HANDOFF.md` (con prompt para nueva cuenta), `docs/ROADMAP.md`.
- `.env.example` y `.gitignore` del proyecto.

## EN PROGRESO
- Nada. Esperando aprobación del plan y respuestas del cliente.

## PENDIENTE
- Respuestas a `docs/OPEN_QUESTIONS.md` (Q1 repositorio y Q2 hosting son las primeras).
- Fases 1 a 7 (`docs/ROADMAP.md`).

## ÚLTIMO CAMBIO REALIZADO
- Creada toda la documentación base de la Fase 0 y un `CLAUDE.md` en la raíz de CS-SHOP que redirige a `conduces/`.

## ARCHIVOS IMPORTANTES MODIFICADOS
- `conduces/` (todo nuevo): `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`, `.env.example`, `.gitignore`, `docs/*.md`.
- `/CLAUDE.md` (raíz del repo, nuevo): índice que separa CAPS Shop y Conduces.

## MIGRACIONES EJECUTADAS
- Ninguna. (Orden previsto en `docs/DATABASE.md` §10.)

## DECISIONES IMPORTANTES
- Borradores no consumen número; el número se asigna solo al emitir (RN-01).
- Numeración por empresa con contador en tabla + bloqueo de fila en PostgreSQL; `UNIQUE (company_id, number_prefix, number_value)` (ADR-005).
- Lógica crítica en funciones SQL transaccionales (ADR-004).
- PDF único (react-pdf) para vista previa, impresión y descarga (ADR-006).
- Secuencias nacen `pending_confirmation`: no se emite hasta confirmar el próximo número (RN-14).
- Snapshot de empresa/punto al emitir (RN-11, propuesta).
- Proyecto en `conduces/` de forma autocontenida; se recomienda repo propio (ADR-001, propuesta).

## PROBLEMAS CONOCIDOS
- Convive con otro proyecto en el mismo repositorio; el CI existente es de CAPS Shop y no prueba este proyecto.
- Faltan muestras del conduce impreso y de los Excel históricos.

## PRÓXIMO PASO RECOMENDADO
1. Que el cliente revise el plan y responda `docs/OPEN_QUESTIONS.md` (mínimo Q1 y Q2; idealmente Q3–Q5).
2. Si Q1 = repo propio: moverlo (`docs/HANDOFF.md` §17) antes de empezar.
3. Iniciar **Fase 1** siguiendo `docs/ROADMAP.md` en este orden: scaffold Next.js → `supabase init` → migraciones
   1–4 + seed → infraestructura de pruebas de BD con PostgreSQL local → auth/middleware → layout → empresas → usuarios → `create-admin`.

## INSTRUCCIONES PARA CONTINUAR
- Leer `docs/HANDOFF.md` sección "CONTINUAR DESDE OTRA CUENTA" y usar el prompt incluido.
- No implementar funciones de negocio fuera de las funciones SQL descritas en `docs/DATABASE.md` §9.
- Al terminar cada bloque: pruebas, actualizar este archivo, `docs/CHANGELOG.md` y los documentos afectados.
