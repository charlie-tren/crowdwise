/** The one market page built without a market: the Worker serves it for any id not built. */
export const FALLBACK_ID = "fallback-shell";

/** Market id from a /market/<id> path, or null. */
export function marketIdFromPath(pathname: string): string | null {
  const m = /^\/market\/([^/]+?)(?:\.html)?\/?$/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
