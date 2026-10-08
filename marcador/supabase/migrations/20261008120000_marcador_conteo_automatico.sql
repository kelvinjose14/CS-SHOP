-- =============================================================================
-- Marcador: el automatismo de conteo viene activado en los partidos nuevos.
--
-- Con él, la 4.ª bola es base por bolas (el bateador a primera, avanzan los
-- corredores forzados y con bases llenas entra la carrera) y el 3.er strike es
-- un out (si es el tercero, cambia la mitad del inning). Se puede apagar desde
-- el panel en "Automatismos". Los partidos que ya existen no cambian.
-- =============================================================================

alter table public.marcador_games alter column auto_new_batter set default true;
