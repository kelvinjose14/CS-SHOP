-- =============================================================================
-- Marcador en vivo para transmisiones de softball y béisbol
--
-- Contenido:
--   1. Slug público aleatorio
--   2. Tablas: marcador_games (partido completo) y marcador_history (deshacer)
--   3. Reglas: CHECK de rangos, versión obligatoria, campos inmutables
--   4. Historial en el servidor y deshacer (RPC marcador_undo_last)
--   5. Lectura pública del overlay por slug (RPC marcador_get_overlay)
--   6. Tiempo real: broadcast desde la base a canales privados
--   7. Seguridad: permisos, RLS de tablas y de los canales de Realtime
--   8. Storage: bucket de logos
--
-- Todo lleva el prefijo "marcador" para poder convivir con otras tablas en el
-- mismo proyecto de Supabase (por ejemplo, una tabla "games" ya existente).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Slug público: 16 bytes aleatorios (122 bits útiles) en base64 URL-safe
--    -> 22 caracteres, imposible de adivinar o recorrer.
-- -----------------------------------------------------------------------------
create or replace function public.marcador_new_slug()
returns text
language sql
volatile
set search_path = ''
as $$
  select rtrim(translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/', '-_'), '=')
$$;


-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

-- Un partido es una fila: configuración, equipos, apariencia y estado del juego.
-- Así cada cambio es un solo evento de tiempo real con una sola versión.
create table public.marcador_games (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique default public.marcador_new_slug(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null default 'Partido',

  -- Configuración
  sport             text not null default 'softball',
  scheduled_innings smallint not null default 6,
  auto_new_batter   boolean not null default false,  -- 4.ª bola o 3.er strike -> nuevo bateador
  auto_change_half  boolean not null default false,  -- 3.er out -> cambiar mitad de inning

  -- Equipo local
  home_name         text not null default 'Local',
  home_abbr         text not null default 'LOC',
  home_color        text not null default '#1D4ED8',
  home_logo_url     text,

  -- Equipo visitante
  away_name         text not null default 'Visitante',
  away_abbr         text not null default 'VIS',
  away_color        text not null default '#DC2626',
  away_logo_url     text,

  -- Apariencia de la transmisión
  brand_name        text not null default 'Marcador',
  brand_subtitle    text not null default '',
  brand_logo_url    text,
  venue             text not null default '',
  accent_color      text not null default '#FACC15',
  panel_color       text not null default '#0B0D12',

  -- Estado del juego
  home_runs         smallint not null default 0,
  away_runs         smallint not null default 0,
  inning            smallint not null default 1,
  half              text not null default 'alta',
  balls             smallint not null default 0,
  strikes           smallint not null default 0,
  outs              smallint not null default 0,
  on_first          boolean not null default false,
  on_second         boolean not null default false,
  on_third          boolean not null default false,
  status            text not null default 'previo',
  overlay_visible   boolean not null default true,

  -- Control
  undo_count        smallint not null default 0,     -- cuántos pasos se pueden deshacer (lo calcula el servidor)
  version           integer not null default 1,      -- control de concurrencia optimista
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Reglas: ningún valor negativo ni fuera de rango, aunque se salte la interfaz.
  constraint marcador_title_len        check (char_length(btrim(title)) between 1 and 80),
  constraint marcador_sport_valido     check (sport in ('softball', 'beisbol')),
  constraint marcador_innings_rango    check (scheduled_innings between 1 and 20),
  constraint marcador_home_name_len    check (char_length(btrim(home_name)) between 1 and 40),
  constraint marcador_away_name_len    check (char_length(btrim(away_name)) between 1 and 40),
  constraint marcador_home_abbr_len    check (char_length(btrim(home_abbr)) between 1 and 4 and char_length(home_abbr) <= 4),
  constraint marcador_away_abbr_len    check (char_length(btrim(away_abbr)) between 1 and 4 and char_length(away_abbr) <= 4),
  constraint marcador_home_color_hex   check (home_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marcador_away_color_hex   check (away_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marcador_accent_color_hex check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marcador_panel_color_hex  check (panel_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marcador_home_logo_url    check (home_logo_url is null or (char_length(home_logo_url) <= 1000 and home_logo_url ~* '^https?://\S+$')),
  constraint marcador_away_logo_url    check (away_logo_url is null or (char_length(away_logo_url) <= 1000 and away_logo_url ~* '^https?://\S+$')),
  constraint marcador_brand_logo_url   check (brand_logo_url is null or (char_length(brand_logo_url) <= 1000 and brand_logo_url ~* '^https?://\S+$')),
  constraint marcador_brand_name_len   check (char_length(btrim(brand_name)) between 1 and 30),
  constraint marcador_brand_sub_len    check (char_length(brand_subtitle) <= 40),
  constraint marcador_venue_len        check (char_length(venue) <= 60),
  constraint marcador_home_runs_rango  check (home_runs between 0 and 999),
  constraint marcador_away_runs_rango  check (away_runs between 0 and 999),
  constraint marcador_inning_rango     check (inning between 1 and 99),
  constraint marcador_half_valida      check (half in ('alta', 'baja')),
  constraint marcador_balls_rango      check (balls between 0 and 3),
  constraint marcador_strikes_rango    check (strikes between 0 and 2),
  constraint marcador_outs_rango       check (outs between 0 and 2),
  constraint marcador_status_valido    check (status in ('previo', 'en_juego', 'suspendido', 'finalizado')),
  constraint marcador_undo_count_rango check (undo_count between 0 and 200),
  constraint marcador_version_positiva check (version >= 1)
);

create index marcador_games_owner_idx on public.marcador_games (owner_id, updated_at desc);

comment on table public.marcador_games is
  'Marcador en vivo: un partido por fila (configuración, equipos, apariencia y estado).';
comment on column public.marcador_games.slug is
  'Identificador público del overlay (aleatorio, 122 bits). Lo genera el servidor.';
comment on column public.marcador_games.version is
  'Control de concurrencia: cada escritura debe enviar version = actual + 1.';

-- Snapshots del estado previo a cada acción, para deshacer (guardados en el servidor).
create table public.marcador_history (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.marcador_games (id) on delete cascade,
  version    integer not null,       -- versión del partido antes del cambio
  snapshot   jsonb not null,         -- estado del juego antes del cambio
  created_at timestamptz not null default now()
);

create index marcador_history_game_idx on public.marcador_history (game_id, id desc);

comment on table public.marcador_history is
  'Estado del juego antes de cada acción. Lo escribe un trigger; se consume con marcador_undo_last.';


-- -----------------------------------------------------------------------------
-- 3 y 4. Reglas de escritura e historial
-- -----------------------------------------------------------------------------

-- Campos del "estado del juego" que se guardan para deshacer.
-- overlay_visible no entra: ocultar o mostrar el marcador para un comercial no
-- es una jugada, y deshacer no debe volver a mostrarlo al aire por sorpresa.
create or replace function public.marcador_state_snapshot(g public.marcador_games)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'home_runs', g.home_runs,
    'away_runs', g.away_runs,
    'inning',    g.inning,
    'half',      g.half,
    'balls',     g.balls,
    'strikes',   g.strikes,
    'outs',      g.outs,
    'on_first',  g.on_first,
    'on_second', g.on_second,
    'on_third',  g.on_third,
    'status',    g.status
  )
$$;

-- Al crear: el servidor fija el slug, la versión y los contadores.
create or replace function public.marcador_games_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.slug       := public.marcador_new_slug();
  new.version    := 1;
  new.undo_count := 0;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Al modificar:
--   * id, owner_id, slug y created_at no cambian.
--   * La escritura debe traer version = actual + 1; si otro controlador escribió
--     antes, se rechaza (nadie sobrescribe en silencio a nadie).
--   * Si cambió el estado del juego, se guarda el estado anterior en el historial.
-- SECURITY DEFINER: escribe en marcador_history, que los clientes no pueden tocar.
create or replace function public.marcador_games_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  restoring boolean := coalesce(current_setting('marcador.restoring', true), '') = 'on';
begin
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.slug is distinct from old.slug
     or new.created_at is distinct from old.created_at then
    raise exception 'campo_inmutable'
      using errcode = '42501',
            hint = 'id, owner_id, slug y created_at no se pueden modificar.';
  end if;

  if new.version is distinct from old.version + 1 then
    raise exception 'conflicto_version'
      using errcode = '40001',
            detail = format('La versión actual es %s; la escritura debe enviar version = %s.',
                            old.version, old.version + 1);
  end if;

  new.updated_at := now();

  if not restoring
     and public.marcador_state_snapshot(new) is distinct from public.marcador_state_snapshot(old) then
    insert into public.marcador_history (game_id, version, snapshot)
    values (old.id, old.version, public.marcador_state_snapshot(old));

    -- Se conservan los 200 pasos más recientes.
    delete from public.marcador_history
     where game_id = old.id
       and id <= (select h.id from public.marcador_history h
                   where h.game_id = old.id
                   order by h.id desc offset 200 limit 1);
  end if;

  new.undo_count := (select count(*) from public.marcador_history h where h.game_id = old.id);
  return new;
end;
$$;

create trigger marcador_games_before_insert
  before insert on public.marcador_games
  for each row execute function public.marcador_games_before_insert();

create trigger marcador_games_before_update
  before update on public.marcador_games
  for each row execute function public.marcador_games_before_update();

-- Deshacer: restaura el último snapshot y lo quita del historial.
-- Verifica dueño y versión esperada; no genera un paso nuevo de historial.
create or replace function public.marcador_undo_last(p_game_id uuid, p_expected_version integer)
returns public.marcador_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.marcador_games;
  h public.marcador_history;
  s public.marcador_games;
begin
  select * into g
    from public.marcador_games
   where id = p_game_id and owner_id = (select auth.uid())
   for update;
  if not found then
    raise exception 'partido_no_encontrado' using errcode = 'P0002';
  end if;

  if g.version <> p_expected_version then
    raise exception 'conflicto_version'
      using errcode = '40001',
            detail = format('La versión actual es %s.', g.version);
  end if;

  select * into h
    from public.marcador_history
   where game_id = g.id
   order by id desc
   limit 1;
  if not found then
    raise exception 'nada_que_deshacer' using errcode = 'P0002';
  end if;

  s := jsonb_populate_record(null::public.marcador_games, h.snapshot);
  delete from public.marcador_history where id = h.id;

  perform set_config('marcador.restoring', 'on', true);
  update public.marcador_games
     set home_runs = s.home_runs,
         away_runs = s.away_runs,
         inning    = s.inning,
         half      = s.half,
         balls     = s.balls,
         strikes   = s.strikes,
         outs      = s.outs,
         on_first  = s.on_first,
         on_second = s.on_second,
         on_third  = s.on_third,
         status    = s.status,
         version   = g.version + 1
   where id = g.id
  returning * into g;
  perform set_config('marcador.restoring', 'off', true);

  return g;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Lectura pública del overlay
--    Solo los campos que se ven al aire. Sin id, owner_id, historial ni
--    automatismos. Exige el slug exacto: no hay forma de listar partidos.
-- -----------------------------------------------------------------------------
create or replace function public.marcador_overlay_payload(g public.marcador_games)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'slug',              g.slug,
    'version',           g.version,
    'updated_at',        g.updated_at,
    'sport',             g.sport,
    'scheduled_innings', g.scheduled_innings,
    'home_name',         g.home_name,
    'home_abbr',         g.home_abbr,
    'home_color',        g.home_color,
    'home_logo_url',     g.home_logo_url,
    'away_name',         g.away_name,
    'away_abbr',         g.away_abbr,
    'away_color',        g.away_color,
    'away_logo_url',     g.away_logo_url,
    'brand_name',        g.brand_name,
    'brand_subtitle',    g.brand_subtitle,
    'brand_logo_url',    g.brand_logo_url,
    'venue',             g.venue,
    'accent_color',      g.accent_color,
    'panel_color',       g.panel_color,
    'home_runs',         g.home_runs,
    'away_runs',         g.away_runs,
    'inning',            g.inning,
    'half',              g.half,
    'balls',             g.balls,
    'strikes',           g.strikes,
    'outs',              g.outs,
    'on_first',          g.on_first,
    'on_second',         g.on_second,
    'on_third',          g.on_third,
    'status',            g.status,
    'overlay_visible',   g.overlay_visible
  )
$$;

create or replace function public.marcador_get_overlay(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.marcador_overlay_payload(g)
    from public.marcador_games g
   where char_length(p_slug) between 16 and 64
     and g.slug = p_slug
$$;


-- -----------------------------------------------------------------------------
-- 6. Tiempo real: después de cada cambio, la base envía el estado por
--    Realtime Broadcast a dos canales privados:
--      marcador-overlay:<slug>  -> datos públicos (overlay, sin sesión)
--      marcador-game:<id>       -> fila completa (solo el dueño, panel)
--    Los clientes no pueden publicar en esos canales (no hay política INSERT),
--    así que nadie puede falsificar el marcador desde un navegador.
-- -----------------------------------------------------------------------------
create or replace function public.marcador_games_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(public.marcador_overlay_payload(new), 'estado', 'marcador-overlay:' || new.slug, true);
  perform realtime.send(to_jsonb(new), 'estado', 'marcador-game:' || new.id::text, true);
  return null;
end;
$$;

create trigger marcador_games_broadcast
  after insert or update on public.marcador_games
  for each row execute function public.marcador_games_broadcast();


-- -----------------------------------------------------------------------------
-- 7. Seguridad
-- -----------------------------------------------------------------------------

-- Permisos de tabla. anon (clave pública sin sesión) no tiene ninguno.
revoke all on table public.marcador_games   from anon, authenticated;
revoke all on table public.marcador_history from anon, authenticated;
grant select, insert, update, delete on table public.marcador_games to authenticated;
grant select on table public.marcador_history to authenticated;

-- Permisos de funciones: solo se exponen las dos RPC pensadas para clientes.
revoke all on function public.marcador_new_slug()                              from public, anon;
revoke all on function public.marcador_state_snapshot(public.marcador_games)   from public, anon, authenticated;
revoke all on function public.marcador_overlay_payload(public.marcador_games)  from public, anon, authenticated;
revoke all on function public.marcador_games_before_insert()                   from public, anon, authenticated;
revoke all on function public.marcador_games_before_update()                   from public, anon, authenticated;
revoke all on function public.marcador_games_broadcast()                       from public, anon, authenticated;
revoke all on function public.marcador_undo_last(uuid, integer)                from public, anon;
revoke all on function public.marcador_get_overlay(text)                       from public;
grant execute on function public.marcador_new_slug()                to authenticated;
grant execute on function public.marcador_undo_last(uuid, integer)  to authenticated;
grant execute on function public.marcador_get_overlay(text)         to anon, authenticated;

-- Row Level Security: cada usuario ve y modifica solo sus partidos.
alter table public.marcador_games   enable row level security;
alter table public.marcador_history enable row level security;

create policy "marcador: el dueño lee sus partidos"
  on public.marcador_games for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "marcador: el dueño crea partidos"
  on public.marcador_games for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "marcador: el dueño modifica sus partidos"
  on public.marcador_games for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "marcador: el dueño elimina sus partidos"
  on public.marcador_games for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "marcador: el dueño lee su historial"
  on public.marcador_history for select to authenticated
  using (exists (
    select 1 from public.marcador_games g
     where g.id = marcador_history.game_id
       and g.owner_id = (select auth.uid())
  ));

-- Canales privados de Realtime (tabla realtime.messages).
-- Solo lectura: no se crea ninguna política INSERT, así que ningún cliente
-- puede enviar mensajes a estos canales; solo la base de datos.
create policy "marcador: overlay recibe su canal"
  on realtime.messages for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'marcador-overlay:%'
  );

create policy "marcador: el dueño recibe el canal de su partido"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'marcador-game:%'
    and exists (
      select 1 from public.marcador_games g
       where 'marcador-game:' || g.id::text = (select realtime.topic())
         and g.owner_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 8. Storage: logos (PNG, SVG, WebP; máximo 2 MB)
--    Lectura pública (se ven al aire). Cada usuario sube solo a su carpeta
--    <user_id>/..., y solo él puede borrar lo suyo.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcador-logos', 'marcador-logos', true, 2097152,
        array['image/png', 'image/svg+xml', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "marcador: el dueño ve sus logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'marcador-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "marcador: el dueño sube logos a su carpeta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'marcador-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "marcador: el dueño borra sus logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'marcador-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
