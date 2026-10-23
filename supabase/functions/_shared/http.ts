// Utilidades HTTP comunes a las Edge Functions.

/** Error de una plataforma externa con información para decidir si reintentar. */
export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly opts: { retryable?: boolean; status?: number; payload?: unknown; authExpired?: boolean } = {},
  ) {
    super(message);
    this.name = "PlatformError";
  }
  get retryable() {
    return this.opts.retryable ?? false;
  }
}

const SENSITIVE = /token|secret|authorization|password|upload_url|signature|code_verifier/i;

/** Copia profunda sin credenciales, apta para publishing_logs. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redactado]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * fetch con timeout que devuelve JSON y traduce los fallos a PlatformError:
 *  - 429 / 5xx / red → reintentable
 *  - 401 → authExpired (se intenta refrescar el token)
 *  - resto de 4xx → definitivo
 */
export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ data: T; res: Response }> {
  const { timeoutMs = 30_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new PlatformError(`Sin respuesta de ${new URL(url).host}: ${(e as Error).message}`, { retryable: true });
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = extractMessage(data) ?? `HTTP ${res.status}`;
    throw new PlatformError(msg, {
      status: res.status,
      payload: redact(data),
      retryable: res.status === 429 || res.status >= 500,
      authExpired: res.status === 401,
    });
  }
  return { data: data as T, res };
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, any>;
  return d.error?.message ?? d.error_message ?? d.error_description ?? d.error?.code ?? d.message ??
    (typeof d.error === "string" ? d.error : undefined);
}

/** Comparación en tiempo constante (para secretos compartidos). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** CORS restringido a ALLOWED_ORIGINS (o APP_URLS; por defecto solo el entorno local). */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("APP_URLS") ||
    "http://127.0.0.1:5173,http://localhost:5173")
    .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}
