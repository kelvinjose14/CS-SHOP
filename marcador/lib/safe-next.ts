/** Solo permite volver a rutas internas (evita redirecciones a otros sitios). */
export function safeNext(value: string | string[] | null | undefined, fallback = "/control"): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
