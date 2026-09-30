# Respaldo y recuperación

Última revisión: 2026-09-30 — **Estrategia (Fase 0). Scripts pendientes (Fase 7).**
Condición: solo herramientas gratuitas. Como la BD es autogestionada, **los respaldos son responsabilidad del grupo**
y deben quedar automatizados.

Los conduces (incluidos los 700+ históricos) no deben depender de un único equipo.

## 1. Capas de respaldo

| Capa | Qué | Frecuencia | Dónde | Estado |
|---|---|---|---|---|
| 1. Volcado automático | `pg_dump` formato custom de toda la BD (datos + logos + Excel originales, que viven en `stored_files`) | Diario (contenedor `backup`), conservando `BACKUP_RETENTION_DAYS` días + uno mensual | Disco del servidor | Pendiente (`deploy/backup.sh`) |
| 2. Copia fuera del equipo | El último volcado cifrado | Diario | Nube gratuita vía rclone (p. ej. Google Drive 15 GB gratis / OneDrive) y/o disco USB externo | Pendiente |
| 3. Copia offline | Volcado mensual cifrado | Mensual | Disco USB guardado en otro lugar | Procedimiento manual |
| 4. Exportación funcional | Todos los conduces + ítems + catálogos en **Excel y CSV**, legibles sin el sistema | Mensual o a demanda (botón en Configuración, solo admin) | Carpeta del grupo | Pendiente |
| 5. Archivos originales | Los Excel históricos originales, sin modificar | Una vez | Además de la BD, copia en la nube gratuita y USB | Pendiente (cliente) |
| 6. Código y esquema | Repositorio Git (código, migraciones, documentación) | Cada commit | GitHub | ✔ |

Volumen esperado: pocos MB de datos + decenas de MB de Excel → los respaldos caben de sobra en planes gratuitos.

## 2. Reglas

- Los volcados que salen del servidor se cifran (`gpg --symmetric` o 7-Zip AES-256). La clave **no** se guarda en el
  repositorio; se guarda en un lugar seguro del grupo (y en papel en la caja fuerte, por ejemplo).
- Nunca guardar volcados dentro del repositorio (`backups/` está en `.gitignore`).
- El contenedor `backup` registra cada ejecución; el dashboard de administrador mostrará la fecha del último respaldo
  correcto (mejora prevista en Fase 7) y avisará si tiene más de 48 horas.
- **Probar la restauración** al menos cada 3 meses en una BD vacía y anotar el resultado en §5.
- Antes de: importar históricos, aplicar migraciones en producción o cambiar secuencias → `npm run backup` manual.

## 3. Recuperación ante errores

| Situación | Acción |
|---|---|
| Conduce emitido por error | Anular con motivo (nunca borrar). |
| Importación incorrecta | `revert_import_batch` si no hubo cambios posteriores; si no, restaurar el volcado previo en una BD aparte y comparar. |
| Secuencia mal configurada | `set_sequence_next_number` con motivo (no puede bajar por debajo de lo existente). |
| Borrado/corrupción masiva | Restaurar el último volcado; reconstruir lo posterior desde la auditoría y los conduces en papel. |
| Falla del equipo servidor | Instalar Docker en otro equipo, `docker compose up -d db`, restaurar el último volcado, levantar el resto (ver HANDOFF). Objetivo: < 2 horas. |

## 4. Comandos previstos

```bash
# Volcado manual (usa DATABASE_OWNER_URL)
npm run backup
# equivalente:
pg_dump "$DATABASE_OWNER_URL" --format=custom --no-owner --file backups/conduces_$(date +%F).dump

# Restauración en una BD vacía (tras db/bootstrap.sql)
pg_restore --no-owner --role=conduces_owner --dbname "$DATABASE_OWNER_URL" backups/conduces_YYYY-MM-DD.dump
```

## 5. Registro de pruebas de restauración

| Fecha | Volcado | Destino | Resultado | Responsable |
|---|---|---|---|---|
| — | — | — | — | — |
