-- =============================================================================
-- Marcador: las sesiones anónimas de Supabase no pueden escribir.
--
-- Si el proyecto tiene activado "Anonymous sign-ins" (por ejemplo, para los
-- visitantes de otro sitio en el mismo proyecto), esas sesiones usan el rol
-- authenticated. Sin esta regla, cualquiera podría abrir una sesión anónima con
-- la clave pública y crear partidos propios o subir logos (no ver ni tocar los
-- ajenos). Aquí se exige una cuenta real para crear, modificar, borrar y subir.
-- =============================================================================

alter policy "marcador: el dueño crea partidos" on public.marcador_games
  with check (
    owner_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

alter policy "marcador: el dueño modifica sus partidos" on public.marcador_games
  using (
    owner_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  )
  with check (
    owner_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

alter policy "marcador: el dueño elimina sus partidos" on public.marcador_games
  using (
    owner_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

alter policy "marcador: el dueño sube logos a su carpeta" on storage.objects
  with check (
    bucket_id = 'marcador-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

alter policy "marcador: el dueño borra sus logos" on storage.objects
  using (
    bucket_id = 'marcador-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );
