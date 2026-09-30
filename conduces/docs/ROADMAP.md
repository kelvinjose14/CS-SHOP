# Hoja de ruta por fases

Marcar `[x]` al terminar cada tarea **y** reflejarlo en `PROJECT_STATUS.md`. No saltar fases sin documentarlo.

## FASE 0 — Documentación base y arquitectura ✅ (2026-09-30)
- [x] Analizar requisitos y estado del repositorio
- [x] Stack definitivo y arquitectura (`ARCHITECTURE.md`, `DECISIONS.md`)
- [x] Esquema de BD (`DATABASE.md`)
- [x] Estrategia de numeración atómica y concurrencia
- [x] Permisos y multiempresa (`SECURITY.md`)
- [x] Estrategia de importación (`IMPORT_HISTORY.md`)
- [x] Estrategia de impresión/PDF
- [x] Estrategia de continuidad (`CLAUDE.md`, `PROJECT_STATUS.md`, `HANDOFF.md`)
- [x] Respaldo (`BACKUP_AND_RECOVERY.md`) y preguntas abiertas (`OPEN_QUESTIONS.md`)
- [x] Rediseño a herramientas gratuitas y programa independiente (ADR-013 a ADR-018)
- [ ] **Aprobación del plan por el cliente**
- [ ] Repositorio propio `sistema-conduces` creado por el cliente y proyecto trasladado (HANDOFF §17)

## FASE 1 — Proyecto base, BD, autenticación, empresas, usuarios, roles
- [ ] Scaffold Next.js + TypeScript estricto + Tailwind + ESLint/Prettier
- [ ] `docker-compose.yml` (servicio `db`) + `db/bootstrap.sql` (roles `conduces_owner` / `conduces_app`)
- [ ] Ejecutor de migraciones `scripts/db-migrate.mjs` (`db:migrate`, `db:status`, checksum) + pruebas
- [ ] Migraciones 0001–0004 y 0008 (parcial): extensiones, esquema `app`, identidad (users, sessions, login_attempts),
      roles/permisos, companies, settings, stored_files, audit, RLS y GRANTs
- [ ] `db/seed/`: roles, permisos, role_permissions, unidades, settings (sin usuarios ni empresas reales)
- [ ] Infraestructura `test:db` (BD temporal, conexión como `conduces_app`) y Vitest
- [ ] `src/server/db.ts` (`withUserTransaction`), `src/server/auth/*` (argon2id, sesiones, cookie), middleware
- [ ] Login, logout, cambio de contraseña obligatorio, bloqueo por intentos, usuario inactivo
- [ ] Layout: sidebar, topbar, toasts, skeletons, páginas de error
- [ ] Empresas: CRUD, logo, configuración de impresión, comentario predeterminado
- [ ] Usuarios: crear con contraseña temporal, restablecer contraseña, rol, empresas autorizadas, activar/desactivar, último acceso
- [ ] Script `create-admin`
- [ ] Pruebas: permisos por rol, aislamiento entre empresas (RLS), auditoría inmutable

## FASE 2 — Generador de conduces, catálogos, borradores, numeración
- [ ] Migraciones 5–7: catálogos, conduces, secuencias, funciones
- [ ] Unidades, puntos comerciales, productos (CRUD + autocomplete)
- [ ] Secuencias por empresa: configurar formato, confirmar próximo número
- [ ] Pantalla NUEVO CONDUCE (líneas dinámicas, autocomplete, comentario precargado)
- [ ] Guardar borrador / editar borrador / descartar borrador (bloqueo optimista)
- [ ] Emitir con numeración atómica + protección doble clic
- [ ] **Pruebas de concurrencia** (N emisiones paralelas, doble emisión, rollback, empresas independientes, colisión)

## FASE 3 — Estados, buscador, historial, duplicar, anular
- [ ] Detalle del conduce con historial de estados
- [ ] Despachar, recibir (campos opcionales), anular (motivo)
- [ ] Duplicar
- [ ] Lista CONDUCES: paginación, orden, filtros, rangos de fecha (server-side, estado en URL)
- [ ] Buscador por todos los campos (trgm)
- [ ] Exportar lista (Excel/CSV)
- [ ] Pruebas de transiciones, anulación, duplicado, búsqueda

## FASE 4 — Impresión, vista previa, PDF
- [ ] Plantilla PDF Carta basada en el conduce real (necesita muestra del cliente)
- [ ] Vista previa (modal), Imprimir (iframe), Generar PDF (nombre `CONDUCE_<N>_<EMPRESA>.pdf`)
- [ ] Marcas de agua BORRADOR / ANULADO, multipágina
- [ ] Pruebas de generación de PDF

## FASE 5 — Dashboard, reportes, auditoría
- [ ] Dashboard (hoy, semana, mes, total, último, pendientes de recepción, anulados, últimos)
- [ ] Reportes (por empresa, período, punto comercial, estado; exportables)
- [ ] Pantalla de auditoría con filtros y detalle antes/después

## FASE 6 — Importador de históricos
- [ ] Recibir muestras y documentar hallazgos en `IMPORT_HISTORY.md` §8
- [ ] Migración de tablas de importación + `commit_import_batch`
- [ ] Asistente SUBIR→…→REPORTE, perfiles de mapeo, validaciones, reporte de análisis
- [ ] Sugerencia y confirmación del próximo número
- [ ] Pruebas con archivos de muestra (anonimizados) en `tests/fixtures/imports/`

## FASE 7 — Optimización, pruebas, seguridad, responsive, backups
- [ ] Pruebas de rendimiento con 50.000 conduces sintéticos
- [ ] Revisión de seguridad (RLS, cabeceras, dependencias)
- [ ] E2E Playwright de los flujos principales
- [ ] Responsive (tablet/móvil)
- [ ] `Dockerfile` (Next standalone) + `docker-compose.yml` completo (db, app, caddy, backup, cloudflared opcional)
- [ ] Script de backup + rclone + exportación completa + prueba de restauración documentada
- [ ] Instalación en el equipo del grupo documentada paso a paso (HTTPS en cada PC, acceso remoto)
