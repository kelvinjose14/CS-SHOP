/**
 * Solo transmite quien inició sesión en el marcador con un correo permitido.
 * El navegador envía su token de sesión de Supabase; aquí se valida con el
 * propio Supabase (la clave pública basta para eso).
 */
export function createUserVerifier({ supabaseUrl, supabaseKey, allowedEmails }, fetchImpl = fetch) {
  return async function verifyUser(accessToken) {
    if (typeof accessToken !== "string" || accessToken.length < 20) return { ok: false, reason: "sin_sesion" };
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, reason: "supabase_inalcanzable" };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "sesion_invalida" };
    if (!response.ok) return { ok: false, reason: "supabase_inalcanzable" };
    const user = await response.json().catch(() => null);
    const email = typeof user?.email === "string" ? user.email.toLowerCase() : "";
    if (!user || user.is_anonymous || !email) return { ok: false, reason: "sesion_invalida" };
    if (!allowedEmails.includes(email)) return { ok: false, reason: "correo_no_permitido" };
    return { ok: true, email };
  };
}
