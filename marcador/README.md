# Marcador en vivo

Marcador para transmisiones de **softball y béisbol**. Se controla desde el celular y se muestra en OBS como un overlay transparente que se actualiza solo, en menos de un segundo.

![Overlay sobre un cuadro de video](docs/capturas/overlay-sobre-video.png)

| Panel de control (375 px) | Overlay sobre fondo de cuadros (transparencia) |
|---|---|
| <img src="docs/capturas/panel-375.png" width="260"> | <img src="docs/capturas/overlay-sobre-cuadros.png" width="520"> |

- **Panel** (`/control/<id>`): requiere iniciar sesión.
  - Carreras, inning, conteo, outs y bases, con estado del partido.
  - Mostrar u ocultar el marcador en el overlay.
  - Deshacer (persistente) y reinicio con confirmación.
  - Logos de equipos y de la transmisión, colores y vista previa en vivo.
- **Overlay** (`/overlay/<slug>`): público y de solo lectura.
  - Fondo transparente para OBS.
  - Escalable con `?scale=` y posicionable con `?pos=`.

**Tecnología:** Next.js 16 (App Router) + TypeScript, y Supabase (Postgres, Auth, Realtime y Storage). Se despliega en Vercel.

---

## 1. Ejecutar el proyecto localmente

Necesitas **Node.js 20.9 o superior** (recomendado 22).

```bash
cd marcador
npm install
cp .env.example .env.local     # y completa los dos valores (paso 2)
npm run dev
```

Abre <http://localhost:3000>: te lleva al inicio de sesión.

> Abre la app con `localhost`, no con `127.0.0.1`. En modo desarrollo, Next.js 16 bloquea sus scripts si la abres desde otro origen.

### Opción sin cuenta: Supabase local (Docker)

Si tienes Docker, puedes levantar todo Supabase en tu computadora. La migración y los datos de ejemplo se aplican solos.

```bash
npx supabase start          # la primera vez descarga las imágenes (varios minutos)
npx supabase status         # muestra API URL y Publishable key
```

1. Copia `API URL` en `NEXT_PUBLIC_SUPABASE_URL` y `Publishable key` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dentro de `.env.local`.
2. Usuario de ejemplo: **demo@marcador.local** / **demo-marcador-2026**.
3. Ya tiene creado el partido de ejemplo: El Parque contra Simón Bolívar, softball a 6 innings.

Para volver a empezar desde cero: `npx supabase db reset`.

### Pruebas

| Comando | Qué verifica | Necesita |
|---|---|---|
| `npm test` | Reglas del juego, validación, escalado del overlay, contraste y rechazo de claves secretas | Nada |
| `npm run test:db` | RLS, CHECK, versión, deshacer, aislamiento por slug, Realtime y Storage, usando solo la clave pública | Supabase **local** (`supabase start`) |
| `npm run test:e2e` | Los 9 criterios de aceptación en un navegador real; guarda capturas en `tests/e2e/salida/` | Supabase local y la app corriendo (`npm run build && npm start`) |
| `./scripts/probar-seguridad.sh` | Con `curl` y la clave pública: toda escritura sin sesión es rechazada | Cualquier proyecto (local o nube) |
| `npm run lint` / `npm run typecheck` | Calidad del código | Nada |

---

## 2. Supabase: qué crear y qué copiar

1. **Crea la cuenta y el proyecto.**
   - Entra a <https://supabase.com> → *Start your project* → crea una organización.
   - Luego *New project*.
   - Guarda la contraseña de la base de datos (no la necesita la app).
   - Si ya tienes un proyecto, puedes usarlo: todo lleva el prefijo `marcador_` y no toca tus tablas (por ejemplo, una tabla `games` existente).
2. **Aplica las migraciones**, que crean tablas, CHECK, RLS, RPC, triggers, Realtime y el bucket de logos. Elige una de dos formas:
   - **Desde el panel de Supabase:** *SQL Editor* → *Create a new snippet* (no una consulta de *Logs*). Pega y ejecuta con *Run*, en este orden:
     1. [`supabase/migrations/20261006120000_marcador.sql`](supabase/migrations/20261006120000_marcador.sql)
     2. [`supabase/migrations/20261006180000_marcador_sin_anonimos.sql`](supabase/migrations/20261006180000_marcador_sin_anonimos.sql)
     3. [`supabase/migrations/20261008120000_marcador_conteo_automatico.sql`](supabase/migrations/20261008120000_marcador_conteo_automatico.sql)
   - **Con la CLI:** `npx supabase login`, luego `npx supabase link --project-ref TU_REF` y después `npx supabase db push`.
3. **Copia las dos variables.** En el panel del proyecto, el botón **Connect** (arriba) → *App Frameworks* → *Next.js* las muestra con estos nombres exactos:

   | Variable | Dónde está | Ejemplo |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | *Project Settings → Data API → Project URL* | `https://abcd1234.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *Project Settings → API Keys → Publishable key* | `sb_publishable_…` |

   - También sirve la clave **anon** antigua (empieza con `eyJ…`), en `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - **Nunca** copies la *secret key* (`sb_secret_…`) ni la *service_role*: esta app no las usa en ningún lado. Si alguna llega a una variable `NEXT_PUBLIC_*`, la app se niega a arrancar.
4. **Crea tu usuario.** Ve a *Authentication → Users → Add user → Create new user*, escribe correo y contraseña, y marca **Auto Confirm User**.
   - Así no dependes del correo de confirmación: el servidor de correo incluido en Supabase tiene un límite bajo de envíos.
   - Si nadie más debe crear cuentas, desactiva *Authentication → Sign In / Providers → Allow new users to sign up*.
5. **(Opcional) URL de la app para los correos.** Solo hace falta si las cuentas se crean desde el botón *Crear cuenta* del panel, que envía un correo de confirmación. En *Authentication → URL Configuration* agrega `https://TU-APP.vercel.app/**` en *Redirect URLs*.
   - **No cambies *Site URL* si el proyecto lo comparte otra app** (por ejemplo, la web de una liga): sus correos dejarían de llevar a su sitio. Con usuario y contraseña creados en el panel de Supabase no hace falta nada de esto.

---

## 3. Publicar en Vercel (para controlar desde el celular)

1. Entra a <https://vercel.com> con tu cuenta de GitHub → **Add New… → Project** → importa el repositorio `CS-SHOP`.
2. En **Root Directory** elige **`marcador`**. *Framework Preset* debe decir *Next.js*.
3. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, con los valores del paso 2.
4. **Deploy.** Al terminar tendrás una URL como `https://marcador-tuyo.vercel.app`.
5. Si usas el botón *Crear cuenta*, vuelve a Supabase y agrega esa URL en *Redirect URLs* (punto 5 del paso 2).
6. Cada vez que hagas *push* a la rama principal, Vercel publica la nueva versión.

En el celular, abre `https://marcador-tuyo.vercel.app/control`, inicia sesión y toca **Crear partido de ejemplo**. Para tenerlo a mano como una app: menú del navegador → *Agregar a la pantalla de inicio*.

---

## 4. URLs

| Para | URL | Ejemplo |
|---|---|---|
| Mis partidos | `/control` | `https://marcador-tuyo.vercel.app/control` |
| Panel de un partido | `/control/<id del partido>` | `https://marcador-tuyo.vercel.app/control/354aeaa1-30af-40d4-b9a1-402194c220c6` |
| Overlay para OBS | `/overlay/<slug>` | `https://marcador-tuyo.vercel.app/overlay/ASFx2HVHSMqH8UdhFipAOg` |

El panel muestra la URL del overlay con un botón **Copiar URL del overlay**. El *slug* es aleatorio (22 caracteres, 122 bits), así que nadie puede adivinarlo ni recorrer los partidos.

### Parámetros del overlay

| Parámetro | Valores | Por defecto |
|---|---|---|
| `scale` | Factor de tamaño respecto a un cuadro de 1920 × 1080 (0.1 a 3) | `1` (1600 × 220 px) |
| `pos` | `top-left`, `top-center`, `top-right`, `center`, `bottom-left`, `bottom-center`, `bottom-right` | `bottom-center` |
| `margin` | Distancia al borde, en px de un cuadro de 1080p | `40` |

Ejemplos:

- `…/overlay/ASFx2HVHSMqH8UdhFipAOg?scale=0.8&pos=top-left`
- `…/overlay/ASFx2HVHSMqH8UdhFipAOg?scale=0.6&pos=bottom-center&margin=24`

El marcador se dibuja sobre un lienzo fijo de 1600 × 220 y se escala con un solo factor. Nunca se deforma ni se sale del cuadro: si el tamaño pedido no cabe, se reduce.

---

## 5. Agregarlo en OBS

1. En la escena: **Fuentes → + → Navegador** (*Browser*). Ponle un nombre, por ejemplo "Marcador".
2. Configura la fuente:
   - **URL:** la URL del overlay (con `?scale=` o `?pos=` si quieres).
   - **Ancho:** `1920`. **Alto:** `1080`.
   - **CSS personalizado:** bórralo y déjalo **vacío**. La página ya trae su fondo transparente.
   - **Apagar la fuente cuando no sea visible:** desmarcado, para que siga conectada.
   - **Actualizar el navegador cuando la escena se active:** opcional.
3. Acepta. El marcador queda transparente encima del video y estira la fuente a todo el lienzo.
4. Para comerciales o repeticiones, usa **Ocultar marcador** en el panel. El overlay se desvanece y vuelve sin tocar OBS.

**Cuándo usar "Actualizar caché de la página actual"** (en las propiedades de la fuente):

- Después de publicar una **nueva versión de la app** en Vercel, para cargar el código nuevo.
- Si el overlay se ve viejo o con otro diseño tras un cambio de código.

**No hace falta** para cambios de marcador, equipos, colores o logos: llegan solos en tiempo real. Si OBS pierde internet, el overlay conserva el último marcador, muestra un aviso discreto "RECONECTANDO" en la franja inferior y se pone al día al volver la conexión.

---

## Cómo está hecho

### Estructura

```
marcador/
├─ app/(panel)/                 login, /control, /control/[gameId], /auth/callback (layout raíz del panel)
├─ app/(overlay)/overlay/[slug] overlay público (layout raíz propio: html y body transparentes)
├─ components/scoreboard/       marcador 1600 × 220 compartido por el overlay y la vista previa
├─ components/control/          piezas del panel (carreras, conteo, bases, formularios, logos…)
├─ lib/game/                    tipos, reglas puras y cola de acciones con control de versión
├─ lib/realtime/                suscripción con reconexión y relectura del estado
├─ lib/supabase/                clientes (navegador, servidor) y protección de la clave pública
├─ proxy.ts                     renueva la sesión y protege /control
├─ supabase/migrations/         esquema completo
├─ supabase/seed.sql            datos de ejemplo (solo local)
└─ tests/                       unit/, integration/, e2e/
```

### Modelo de datos (y cambios respecto al pedido)

- **`marcador_games`:** un partido por fila. Contiene:
  - Configuración: deporte, innings programados y automatismos.
  - Equipos local y visitante: nombre, abreviatura, color y logo.
  - Apariencia: nombre, subtítulo y logo de la transmisión, sede, color de acento y de fondo.
  - Estado del juego.
  - `slug`, `version`, `undo_count` y fechas.
- **`marcador_history`:** snapshot del estado del juego antes de cada acción (últimos 200), guardado por un trigger en el servidor.

Cambios respecto al pedido:

1. **Prefijo `marcador_`** en tablas, funciones, bucket y canales. Así el marcador puede vivir en un proyecto de Supabase que ya tenga, por ejemplo, una tabla `games` de una liga, sin chocar con ella.
2. **Equipos dentro de la fila del partido**, no en una tabla aparte. Cada partido tiene su propio par de equipos, un cambio es un solo evento de tiempo real, y una sola `version` protege todo.
3. **Bases en tres columnas** (`on_first`, `on_second`, `on_third`) en lugar de un arreglo, para validarlas y actualizarlas de forma simple.
4. **"Mostrar/ocultar" no entra en el historial de deshacer.** Ocultar el marcador para un comercial no es una jugada, y deshacer no debe volver a mostrarlo al aire por sorpresa.
5. **Topes técnicos:** carreras de 0 a 999 e inning de 1 a 99. Los extras no tienen límite práctico.
6. **Orden del overlay según la convención de las transmisiones:** visitante arriba y local abajo. Un ◀ marca al equipo al bate mientras el partido está *En juego*.

### Reglas y concurrencia

- **Reglas puras y doble validación.** Cada botón es una función pura (estado → cambios) en `lib/game/rules.ts`. Los mismos rangos están en la base como **CHECK**.
- **Versión obligatoria.** Toda escritura debe traer `version = actual + 1`; un trigger lo exige. El panel además filtra por la versión que leyó: si otro controlador escribió antes, se rechaza.
- **Conflictos visibles.** Ante un rechazo, el panel recarga el estado real y avisa: *"Otro controlador cambió el marcador al mismo tiempo…"*. Nadie sobrescribe a nadie en silencio.
- **Toques rápidos sin conflictos.** Las acciones se encolan y se envían una por una, y la pantalla muestra el resultado de inmediato.
- **Formularios.** Al guardar, se verifica que nadie haya cambiado esos mismos campos mientras editabas.
- **Automatismos** (cada uno con su interruptor en el panel):
  - **Conteo, activado por defecto:**
    - 4.ª bola → base por bolas: el bateador va a primera y avanzan solo los corredores forzados; con bases llenas entra una carrera del equipo al bate.
    - 3.er strike → out; si es el tercero, cambia la mitad del inning.
    - En ambos casos el conteo vuelve a 0-0.
  - **3.er out → cambiar mitad**, desactivado por defecto.
  - Fuera de eso no se deducen avances ni carreras: los hits, robos y carreras se marcan a mano.

### Seguridad

- **RLS en `marcador_games`:** solo el dueño autenticado lee y escribe. El rol `anon` no tiene ningún permiso sobre la tabla.
- **Sesiones anónimas:** si el proyecto tiene activado *Anonymous sign-ins* (por ejemplo, para los visitantes de otro sitio en el mismo proyecto), esas sesiones no pueden crear, modificar ni borrar partidos, ni subir logos. Hace falta una cuenta real.
- **`marcador_history`:** solo la lee el dueño. Solo la escribe el trigger y solo la consume `marcador_undo_last()`, que verifica dueño y versión.
- **Overlay:** lee con `marcador_get_overlay(slug)`, que exige el slug exacto y devuelve solo campos públicos. No expone `id`, `owner_id`, historial ni automatismos.
- **Realtime:** la base publica cada cambio con *Broadcast from Database* en dos canales **privados**:
  - `marcador-overlay:<slug>`: datos públicos.
  - `marcador-game:<id>`: fila completa, solo para el dueño.

  No hay política de INSERT en `realtime.messages`, así que **nadie puede inyectar un marcador falso** desde un navegador.
- **Storage:** bucket `marcador-logos` de lectura pública. Acepta PNG, SVG y WebP de hasta 2 MB. Cada usuario sube solo a su carpeta `<user_id>/`, y los SVG se limpian de scripts antes de subir.
- **Claves:** en el navegador solo se usa la clave pública. Ninguna parte del código usa la *service_role* o la *secret key*.
