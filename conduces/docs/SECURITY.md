# Seguridad, roles y permisos

Última revisión: 2026-09-30

## 1. Autenticación

- Supabase Auth, email + contraseña. **Registro público desactivado** (`enable_signup = false`).
- Usuarios creados por un administrador (pantalla Usuarios → usa la Admin API con el service role, solo servidor)
  con contraseña temporal o enlace de invitación. Primer administrador: `npm run create-admin` (ver HANDOFF).
- Contraseñas: hash bcrypt gestionado por Supabase; nunca en texto plano ni en logs. Longitud mínima 10.
- Sesión: cookies httpOnly, Secure, SameSite=Lax gestionadas por `@supabase/ssr`; el middleware refresca el token.
  En el servidor se usa siempre `supabase.auth.getUser()` (valida el JWT contra Auth), nunca solo `getSession()`.
- Usuario desactivado (`profiles.is_active = false`): el middleware cierra su sesión y todas las funciones SQL lo rechazan.
- Recuperación de contraseña por correo (Supabase) o restablecimiento por un administrador.

## 2. Autorización en 3 capas

1. **UI**: oculta menús/botones sin permiso (solo comodidad).
2. **Servidor Next.js**: cada Server Action/Route Handler obtiene el usuario, valida entrada con Zod y verifica permiso.
3. **PostgreSQL**: RLS para lecturas; funciones `SECURITY DEFINER` con `app.has_permission()` para escrituras.
   Aunque alguien llame la API de Supabase directamente con su token, no puede saltarse reglas ni empresas.

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
- `delivery_notes`, `delivery_note_items`, `delivery_note_sequences`, `audit_logs`, `import_*`: **sin** políticas de
  INSERT/UPDATE/DELETE para `authenticated`; solo funciones `SECURITY DEFINER`.
- Catálogos y empresas: escritura con política que exige el permiso correspondiente (o también vía funciones).
- `profiles`: cada usuario lee el suyo; `users.manage` lee y edita todos.
- `audit_logs`: SELECT solo con `audit.view`. UPDATE/DELETE bloqueado por trigger para todos.

## 6. Datos sensibles y variables

- Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` llegan al navegador (la anon key es pública por
  diseño; la protección real es RLS).
- `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL`: solo en `src/server/**` con `import 'server-only'`. Nunca en logs.
- `.env*` en `.gitignore` (excepto `.env.example`). Revisar con `git diff --cached` antes de cada commit.

## 7. Entradas y archivos

- Zod en cada entrada del servidor: longitudes máximas, UUIDs, fechas, enums, números.
- React escapa HTML por defecto; prohibido `dangerouslySetInnerHTML` con datos de usuario.
- Importación: extensiones `.xls/.xlsx/.csv`, verificación de firma del archivo (magic bytes), tamaño máximo
  (`IMPORT_MAX_FILE_MB`), número máximo de filas/hojas, sin evaluar fórmulas ni macros (solo valores),
  bucket privado, SHA-256. Protección contra *CSV injection* al exportar (prefijar `'` a celdas que empiezan por `= + - @`).
- Logos: PNG/JPG/WebP, máximo 1 MB, bucket privado, servidos con URL firmada.

## 8. Cabeceras y otros

- Cabeceras de seguridad en `next.config` (CSP, `X-Frame-Options: SAMEORIGIN` para permitir el iframe del PDF propio,
  `Referrer-Policy`, `X-Content-Type-Options`).
- Server Actions de Next.js tienen protección CSRF por origen; Route Handlers que escriben verifican `Origin`.
- Límite de tasa de login: el de Supabase Auth.
