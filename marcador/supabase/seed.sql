-- Datos de ejemplo SOLO para desarrollo local (`supabase db reset`).
-- En Supabase en la nube no se ejecuta: ahí el partido de ejemplo se crea
-- desde el panel con el botón "Crear partido de ejemplo".
--
-- Usuario local:  demo@marcador.local  /  demo-marcador-2026

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'demo@marcador.local',
  extensions.crypt('demo-marcador-2026', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@marcador.local","email_verified":true}',
  'email', now(), now(), now()
);

-- Partido de ejemplo: El Parque (local) contra Simón Bolívar (visitante), softball a 6 innings.
insert into public.marcador_games (
  owner_id, title, sport, scheduled_innings,
  home_name, home_abbr, home_color,
  away_name, away_abbr, away_color,
  brand_name, brand_subtitle, venue, accent_color, panel_color
) values (
  '11111111-1111-4111-8111-111111111111',
  'El Parque vs Simón Bolívar', 'softball', 6,
  'El Parque', 'PAR', '#14B8C4',
  'Simón Bolívar', 'SBO', '#1E3A8A',
  'MARCADOR', 'TRANSMISIÓN', 'Ciudad Deportiva', '#FACC15', '#0B0D12'
);
