# Changelog

Cambios funcionales y de arquitectura relevantes (no cambios insignificantes). Más reciente arriba.

## 2026-09-30 (2)
- Decisión del cliente: programa totalmente nuevo e independiente de CAPS Shop, solo herramientas gratuitas, uso interno.
- Stack rediseñado: PostgreSQL 16 autogestionado (sin Supabase), autenticación propia con argon2id y sesiones en BD,
  archivos (logos, Excel) dentro de PostgreSQL, migraciones SQL con ejecutor propio, despliegue con Docker Compose + Caddy.
- Decidido repositorio propio `sistema-conduces` (pendiente de creación por el cliente).

## 2026-09-30 (1)
- Fase 0: definida la arquitectura inicial (Next.js + Supabase/PostgreSQL) y el stack definitivo.
- Diseñado el esquema multiempresa: empresas, usuarios, roles/permisos, catálogos, conduces, ítems, secuencias,
  historial de estados, auditoría e importación.
- Diseñada la numeración atómica por empresa (contador transaccional con bloqueo de fila + UNIQUE).
- Documentadas las reglas de negocio (borradores no consumen número, anulación, duplicado, snapshot al emitir).
- Diseñada la estrategia de importación de 700+ conduces históricos y de respaldo.
- Creada la documentación de continuidad entre cuentas (CLAUDE.md, PROJECT_STATUS.md, HANDOFF.md).
