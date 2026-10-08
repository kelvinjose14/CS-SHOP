/** Dirección del intermediario guardada en este navegador (no es secreta: la protege tu sesión). */
export const RELAY_STORAGE_KEY = "marcador.intermediario";

export function readStoredRelay(): string {
  try {
    return localStorage.getItem(RELAY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeRelay(url: string) {
  try {
    localStorage.setItem(RELAY_STORAGE_KEY, url);
  } catch {
    // almacenamiento bloqueado: hay que volver a escribirla
  }
}
