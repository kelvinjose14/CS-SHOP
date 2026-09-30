# Respaldo y recuperación

Última revisión: 2026-09-30 — **Estrategia (Fase 0). Scripts pendientes (Fase 7).**

Los conduces (incluidos los 700+ históricos) no deben depender de un único equipo ni de un único proveedor.

## 1. Capas de respaldo

| Capa | Qué | Frecuencia | Dónde | Estado |
|---|---|---|---|---|
| 1. Backups gestionados | Base de datos completa | Diaria (retención 7 días en Supabase Pro); PITR opcional (recuperar a un minuto exacto) | Supabase | Depende del plan (Q2) |
| 2. Volcado lógico propio | `pg_dump` en formato custom (`.dump`) de toda la BD | Diaria/semanal (programado) | Almacenamiento externo del grupo (Drive/OneDrive/S3) + copia offline mensual | Pendiente: `scripts/backup-db` |
| 3. Exportación funcional | Todos los conduces + ítems + catálogos en **Excel y CSV** legibles sin el sistema | Mensual o a demanda (botón en Configuración, solo admin) | Carpeta del grupo | Pendiente |
| 4. Archivos originales | Los Excel históricos originales (sin modificar) + logos | Una vez + al cambiar | Bucket privado `imports` + copia externa | Pendiente |
| 5. Código y esquema | Repositorio Git (código, migraciones, documentación) | Cada commit | GitHub | ✔ |

## 2. Reglas

- Los volcados se cifran (p. ej. `gpg --symmetric` o 7-Zip AES-256) antes de salir del servidor. La clave **no** se
  guarda en el repositorio.
- Nunca guardar volcados dentro del repositorio.
- **Probar la restauración** al menos cada 3 meses en una BD vacía y anotar el resultado aquí (§5).
- Antes de: importar históricos, aplicar migraciones en producción o cambiar secuencias → volcado manual previo.

## 3. Recuperación ante errores

| Situación | Acción |
|---|---|
| Conduce emitido por error | Anular con motivo (nunca borrar). |
| Importación incorrecta | `revert_import_batch` si no hubo cambios posteriores; si no, restaurar desde volcado previo en una BD aparte y comparar. |
| Secuencia mal configurada | `set_sequence_next_number` con motivo (no puede bajar por debajo de lo existente). |
| Borrado/corrupción masiva | Restaurar PITR (Supabase) o el último volcado; reconstruir lo posterior desde la auditoría. |
| Caída del proveedor | Restaurar el volcado en otro PostgreSQL y apuntar `DATABASE_URL`/Supabase nuevo; ver HANDOFF. |

## 4. Comandos previstos

```bash
# Volcado (usa DATABASE_URL del .env; conexión directa, no pooler)
pg_dump "$DATABASE_URL" --format=custom --no-owner --file backups/conduces_$(date +%F).dump
# Restauración en una BD vacía
pg_restore --no-owner --dbname "$TARGET_DATABASE_URL" backups/conduces_YYYY-MM-DD.dump
```

## 5. Registro de pruebas de restauración

| Fecha | Volcado | Destino | Resultado | Responsable |
|---|---|---|---|---|
| — | — | — | — | — |
