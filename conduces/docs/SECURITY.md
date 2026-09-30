# Seguridad, roles y permisos

Última revisión: 2026-09-30

## 1. Autenticación (propia, ADR-015)

- Usuario = correo + contraseña. **Sin registro público.** Los usuarios los crea un administrador (pantalla Usuarios)
  con una contraseña temporal; el primer administrador se crea con `npm run create-admin` (ver HANDOFF §9).
- Contraseñas: hash **argon2id** (`@node-rs/argon2`, parámetros OWASP: m=19 MiB, t=2, p=1). Nunca en texto plano,
  ni en logs, ni en auditoría. Mínimo 10 caracteres; se rechazan las iguales al correo.
- **Cambio obligatorio** en el primer acceso y tras un restablecimiento (`must_change_password`).
- Sesión: token aleatorio de 32 bytes (`crypto.randomBytes`) en la cookie `conduces_session` con `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/`. En la BD solo se guarda su SHA-256. Expira por inactividad (12 h) y en forma absoluta
  (7 días); configurable en `system_settings`.
- Cerrar sesión, cambiar contraseña o desactivar el usuario **revoca** sus sesiones.
- Intentos fallidos: tras 5 fallos seguidos, bloqueo del usuario 15 minutos; límite adicional por IP. Mensaje genérico
  "Correo o contraseña incorrectos" (no revela si el correo existe). Todo queda en `login_attempts`.
- Sin correo saliente (costo cero): "olvidé mi contraseña" = pedir al administrador que la restablezca (queda auditado).
- El middleware protege todas las rutas salvo `/login`; además cada Server Action/Route Handler valida la sesión
  (el middleware no es la única barrera).

## 2. Autorización en 3 capas

1. **UI**: oculta menús/botones sin permiso (solo comodidad).
2. **Servidor Next.js**: cada Server Action/Route Handler obtiene el usuario, valida entrada con Zod y verifica permiso.
3. **PostgreSQL**: la aplicación se conecta como `conduces_app` (sin `BYPASSRLS`, no es dueño de las tablas). Cada
   transacción fija `app.user_id`; RLS filtra lecturas y las funciones `SECURITY DEFINER` con `app.has_permission()`
   controlan escrituras. Un error en el código de la aplicación no basta para ver o modificar datos de otra empresa.

## 3. Roles iniciales

| Rol | Código | Alcance de empresas |
|---|---|---|
| ADMINISTRADOR | `admin` | Todas |
| OPERADOR / ALMACÉN | `operator` | Las asignadas en `user_companies` |
| CONSULTA | `viewer` | Las asignadas en `user_companies` |

## 4. Permisos y matriz inicial

✔ = concedido · ✘ = no · ? = propuesto, pendiente de confirmar (OPEN_QUESTIONS Q5)

| Permiso | Descripción | admin | operator | viewer |
|---|---|:-:|:-:|:-:|
| `delivery_notes.view` | Ver, buscar, listar | ✔ | ✔ | ✔ |
| `delivery_notes.print` | Vista previa, imprimir, PDF | ✔ | ✔ | ✔ |
| `delivery_notes.create` | Crear borrador | ✔ | ✔ | ✘ |
| `delivery_notes.edit_draft` | Editar borrador | ✔ | ✔ | ✘ |
| `delivery_notes.discard_draft` | Descartar borrador | ✔ | ✔ (solo propios) ? | ✘ |
| `delivery_notes.duplicate` | Duplicar | ✔ | ✔ | ✘ |
| `delivery_notes.issue` | Emitir (asigna número) | ✔ | ✔ | ✘ |
| `delivery_notes.dispatch` | Marcar despachado | ✔ | ✔ | ✘ |
| `delivery_notes.receive` | Marcar recibido | ✔ | ✔ ? | ✘ |
| `delivery_notes.void` | Anular | ✔ | ✘ ? | ✘ |
| `delivery_notes.export` | Exportar Excel/CSV | ✔ | ✘ ? | ✘ |
| `catalogs.manage` | Puntos comerciales, productos, unidades | ✔ | ✘ ? | ✘ |
| `companies.manage` | Empresas y configuración de impresión | ✔ | ✘ | ✘ |
| `sequences.manage` | Configurar/confirmar numeración | ✔ | ✘ | ✘ |
| `users.manage` | Usuarios, roles, empresas autorizadas | ✔ | ✘ | ✘ |
| `imports.run` | Importar históricos | ✔ | ✘ | ✘ |
| `reports.view` | Reportes | ✔ | ✘ ? | ✘ |
| `audit.view` | Ver auditoría | ✔ | ✘ | ✘ |
| `settings.manage` | Configuración general | ✔ | ✘ | ✘ |
| `backup.export` | Exportación completa | ✔ | ✘ | ✘ |

Los permisos viven en tablas (`permissions`, `role_permissions`): se podrán crear roles personalizados sin cambiar
código. `user_companies.role_code` está reservado para roles distintos por empresa.

## 5. RLS (resumen)

- Todas las tablas de `public` con `ENABLE ROW LEVEL SECURITY`.
- Lectura de datos de negocio: `USING (app.can_access_company(company_id))` (o `company_id IS NULL` para catálogos del grupo).
- Sin `app.user_id` válido (usuario activo) las políticas no devuelven filas.
- `delivery_notes`, `delivery_note_items`, `delivery_note_sequences`, `audit_logs`, `import_*`, `users`, `sessions`:
  `conduces_app` **no** tiene INSERT/UPDATE/DELETE directos; solo ejecuta funciones `SECURITY DEFINER`.
- Catálogos y empresas: escritura con política que exige el permiso correspondiente (o también vía funciones).
- `users`: cada usuario lee el suyo; `users.manage` lee todos. La columna `password_hash` no es legible por `conduces_app`.
- `audit_logs`: SELECT solo con `audit.view`. UPDATE/DELETE bloqueado por trigger para todos.

## 6. Datos sensibles y variables

- Ninguna variable secreta llega al navegador. Solo existe `NEXT_PUBLIC_APP_URL` como pública.
- `DATABASE_URL` (rol `conduces_app`), `DATABASE_OWNER_URL` (rol dueño, solo migraciones/respaldos/scripts) y
  `SESSION_SECRET`: solo en `src/server/**` con `import 'server-only'` y en scripts. Nunca en logs.
- `.env*` en `.gitignore` (excepto `.env.example`). Revisar con `git diff --cached` antes de cada commit.
- El puerto de PostgreSQL no se expone fuera del servidor (solo red interna de Docker).
- **El repositorio (CS-SHOP) es público** (ADR-019). La seguridad no depende de ocultar el código: contraseñas, claves y
  datos existen solo en el servidor (`.env` y base de datos). Prohibido subir datos reales, respaldos, exportaciones o
  Excel históricos; los archivos de prueba se inventan o se anonimizan. `.gitignore` bloquea `.xls/.xlsx/.csv` fuera de `tests/fixtures/`.

## 7. Entradas y archivos

- Zod en cada entrada del servidor: longitudes máximas, UUIDs, fechas, enums, números.
- React escapa HTML por defecto; prohibido `dangerouslySetInnerHTML` con datos de usuario.
- Importación: extensiones `.xls/.xlsx/.csv`, verificación de firma del archivo (magic bytes), tamaño máximo
  (`IMPORT_MAX_FILE_MB`), número máximo de filas/hojas, sin evaluar fórmulas ni macros (solo valores),
  guardado en `stored_files` (solo admin), SHA-256. Protección contra *CSV injection* al exportar (prefijar `'` a celdas que empiezan por `= + - @`).
- Logos: PNG/JPG/WebP, máximo 1 MB, guardados en `stored_files`, servidos por `GET /api/files/[id]` solo a usuarios con sesión.

## 8. Cabeceras y otros

- Cabeceras de seguridad en `next.config` (CSP, `X-Frame-Options: SAMEORIGIN` para permitir el iframe del PDF propio,
  `Referrer-Policy`, `X-Content-Type-Options`).
- Server Actions de Next.js tienen protección CSRF por origen; Route Handlers que escriben verifican `Origin`.
- HTTPS obligatorio: Caddy en la red local (certificado interno) o Cloudflare Tunnel para acceso remoto. Opcional:
  Cloudflare Access (gratis hasta 50 usuarios) como segunda barrera para el acceso desde fuera de la oficina.
- "PC autorizada": el acceso se limita a la red interna del grupo y al túnel; mejora futura opcional: lista de IPs o
  aprobación de dispositivos.
