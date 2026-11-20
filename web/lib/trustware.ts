import "server-only";

/** Trustware's routes API, called from Stoa's server only: the key (TRUSTWARE_API_KEY) never reaches the browser. */
const API = "https://api.trustware.io/api/v1";

export async function tw(path: string, init: RequestInit & { idem?: string } = {}): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const key = process.env.TRUSTWARE_API_KEY;
  if (!key) return { ok: false, status: 503, body: { error: "not configured" } };
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-API-Key": key, "X-API-Version": "2025-10-01", "X-SDK-Name": "stoadex.com" };
  if (init.idem) headers["Idempotency-Key"] = init.idem;
  try {
    const r = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 504, body: { error: "Trustware did not answer" } };
  }
}
