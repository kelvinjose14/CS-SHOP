#!/usr/bin/env bash
# Prueba de seguridad con la clave PÚBLICA y sin sesión, directo contra la API de Supabase.
# Todas las escrituras deben ser rechazadas; el overlay solo responde con el slug exacto.
#
# Uso:
#   ./scripts/probar-seguridad.sh                 # lee .env.local
#   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_KEY=sb_publishable_... SLUG=<slug> ./scripts/probar-seguridad.sh
set -uo pipefail

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi
URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:?Falta NEXT_PUBLIC_SUPABASE_URL}}"
KEY="${SUPABASE_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:?Falta la clave pública}}}"
SLUG="${SLUG:-slug-que-no-existe-0000}"
FAKE_ID="00000000-0000-4000-8000-000000000000"
fail=0

call() { # nombre, método, ruta, cuerpo, esperado (regex de código HTTP)
  local name="$1" method="$2" path="$3" body="$4" expected="$5"
  local out code
  out=$(curl -sS -X "$method" "$URL$path" -H "apikey: $KEY" -H "Content-Type: application/json" \
        -H "Prefer: return=representation" ${body:+-d "$body"} -w $'\n%{http_code}')
  code="${out##*$'\n'}"; out="${out%$'\n'*}"
  if [[ "$code" =~ $expected ]]; then echo "OK   [$code] $name"; else echo "FALLA[$code] $name"; fail=1; fi
  echo "     $(echo "$out" | head -c 220)"
}

echo "Proyecto: $URL"
echo "Clave:    ${KEY:0:18}… (pública)"
echo
call "Leer la tabla de partidos"            GET    "/rest/v1/marcador_games?select=*"                ""                                    '^(401|403)$'
call "Crear un partido"                     POST   "/rest/v1/marcador_games"                          '{"title":"intruso"}'                 '^(401|403)$'
call "Modificar carreras"                   PATCH  "/rest/v1/marcador_games?id=eq.$FAKE_ID"           '{"home_runs":99,"version":2}'        '^(401|403)$'
call "Borrar partidos"                      DELETE "/rest/v1/marcador_games?id=eq.$FAKE_ID"           ""                                    '^(401|403)$'
call "Leer el historial"                    GET    "/rest/v1/marcador_history?select=*"              ""                                    '^(401|403)$'
call "Deshacer (RPC)"                       POST   "/rest/v1/rpc/marcador_undo_last"                 "{\"p_game_id\":\"$FAKE_ID\",\"p_expected_version\":1}" '^(401|403)$'
call "Overlay con el slug indicado"         POST   "/rest/v1/rpc/marcador_get_overlay"               "{\"p_slug\":\"$SLUG\"}"              '^200$'
echo
if [[ $fail -eq 0 ]]; then echo "Resultado: todas las escrituras sin sesión fueron rechazadas."; else echo "Resultado: HAY FALLAS."; fi
exit $fail
