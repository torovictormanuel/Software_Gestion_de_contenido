// OAuth de cada red: URL de autorización, canje del código, perfil y revocación.
// Fuentes (verificadas 2026-10-22):
//  - Instagram API con login de Instagram (Business Login for Instagram)
//  - TikTok Login Kit for Web + OAuth v2 (open.tiktokapis.com)
//  - Google OAuth 2.0 para apps web + YouTube Data API v3
import { fetchJson, PlatformError } from "./http.ts";

export type Provider = "instagram" | "tiktok" | "youtube";
export const PROVIDERS: Provider[] = ["instagram", "tiktok", "youtube"];

export interface ConnectedAccount {
  externalId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  access: string;
  refresh?: string;
  expiresAt?: Date;
  scopes: string[];
}

const env = (k: string) => Deno.env.get(k) ?? "";
const IG_VERSION = env("META_GRAPH_VERSION") || "v26.0";

const SCOPES: Record<Provider, string> = {
  instagram: env("INSTAGRAM_SCOPES") ||
    "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
  tiktok: env("TIKTOK_SCOPES") || "user.info.basic,user.info.profile,video.publish",
  youtube: env("YOUTUBE_SCOPES") ||
    "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
};

const CREDS: Record<Provider, [string, string]> = {
  instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  youtube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

/** ¿Están cargadas las credenciales de la app de esa red? */
export function isConfigured(p: Provider): boolean {
  return CREDS[p].every((k) => env(k).length > 0);
}
const id = (p: Provider) => env(CREDS[p][0]);
const secret = (p: Provider) => env(CREDS[p][1]);

/** Google usa PKCE; Instagram y TikTok (web) no lo documentan. */
export const usesPkce = (p: Provider) => p === "youtube";

export function callbackUrl(p: Provider): string {
  const base = env("OAUTH_REDIRECT_BASE") || `${env("SUPABASE_URL")}/functions/v1/oauth-callback`;
  return `${base.replace(/\/$/, "")}/${p}`;
}

// ---- PKCE ---------------------------------------------------------------
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(48)));
}
export async function challengeOf(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

// ---- URL de autorización ------------------------------------------------
export async function authorizeUrl(p: Provider, state: string, verifier?: string): Promise<string> {
  const redirect = callbackUrl(p);
  if (p === "instagram") {
    const u = new URL("https://www.instagram.com/oauth/authorize");
    u.search = new URLSearchParams({
      client_id: id(p),
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPES.instagram,
      state,
      enable_fb_login: "false",
    }).toString();
    return u.toString();
  }
  if (p === "tiktok") {
    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.search = new URLSearchParams({
      client_key: id(p),
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPES.tiktok,
      state,
      disable_auto_auth: "1",
    }).toString();
    return u.toString();
  }
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: id(p),
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.youtube,
    access_type: "offline",
    prompt: "consent", // garantiza refresh_token aunque ya haya autorizado antes
    include_granted_scopes: "true",
    state,
    code_challenge: await challengeOf(verifier!),
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

// ---- Canje del código + perfil -------------------------------------------
/** Etiqueta el paso que falló para que el log diga dónde (sin tokens). */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PlatformError) {
      throw new PlatformError(`${name}: ${e.message}`, { ...e.opts });
    }
    throw new Error(`${name}: ${(e as Error)?.message ?? e}`);
  }
}

const inSeconds = (s?: number) => (s ? new Date(Date.now() + s * 1000) : undefined);
const https = (u?: string | null) => (u && /^https:\/\//.test(u) ? u.slice(0, 2000) : undefined);

export async function exchange(p: Provider, code: string, verifier?: string | null): Promise<ConnectedAccount> {
  if (p === "instagram") return exchangeInstagram(code);
  if (p === "tiktok") return exchangeTikTok(code);
  return exchangeYouTube(code, verifier ?? undefined);
}

async function exchangeInstagram(rawCode: string): Promise<ConnectedAccount> {
  const code = rawCode.replace(/#_$/, "");
  // 1) Código → token corto (1 h). La respuesta viene como {data:[{…}]} o plana.
  //    Meta a veces guarda la Redirect URI con "/" final y exige esa forma exacta
  //    en el canje: si responde "redirect_uri ... identical", se reintenta una vez
  //    con la otra variante (el código no se consume en un intento rechazado).
  const codeFor = (redirect: string) =>
    fetchJson<any>("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id("instagram"),
        client_secret: secret("instagram"),
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code,
      }),
    });
  const base = callbackUrl("instagram");
  const { data: short } = await step("ig_code", async () => {
    try {
      return await codeFor(base);
    } catch (e) {
      if (!(e instanceof PlatformError) || !/redirect_uri/i.test(e.message)) throw e;
      const alt = base.endsWith("/") ? base.slice(0, -1) : `${base}/`;
      console.warn(JSON.stringify({ level: "warn", fn: "oauth", msg: "ig_redirect_retry", alt }));
      return await codeFor(alt);
    }
  });
  const s = Array.isArray(short?.data) ? short.data[0] : short;
  if (!s?.access_token) throw new PlatformError("Instagram no devolvió el token");

  // 2) Token corto → largo (60 días). Siempre del lado del servidor.
  const lu = new URL("https://graph.instagram.com/access_token");
  lu.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: secret("instagram"),
    access_token: s.access_token,
  }).toString();
  const { data: long } = await step("ig_long_token", () =>
    fetchJson<{ access_token: string; expires_in: number }>(lu.toString()));

  // 3) Perfil: user_id es el id de la cuenta profesional (<IG_ID>) que usa la publicación.
  const { data: me } = await step("ig_profile", () => fetchJson<any>(
    `https://graph.instagram.com/${IG_VERSION}/me?fields=user_id,username,name,profile_picture_url,account_type`,
    { headers: { Authorization: `Bearer ${long.access_token}` } },
  ));
  const accountType = String(me.account_type ?? "").toUpperCase();
  if (accountType && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(accountType)) {
    throw new PlatformError("not_professional");
  }
  return {
    externalId: String(me.user_id ?? s.user_id),
    handle: me.username ? `@${me.username}` : "Instagram",
    displayName: me.name || me.username,
    avatarUrl: https(me.profile_picture_url),
    access: long.access_token,
    expiresAt: inSeconds(long.expires_in),
    scopes: String(s.permissions ?? SCOPES.instagram).split(",").map((x: string) => x.trim()).filter(Boolean),
  };
}

async function exchangeTikTok(code: string): Promise<ConnectedAccount> {
  const { data: t } = await fetchJson<any>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: id("tiktok"),
      client_secret: secret("tiktok"),
      code: decodeURIComponent(code),
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("tiktok"),
    }),
  });
  if (!t?.access_token) throw new PlatformError(`TikTok: ${t?.error_description ?? t?.error ?? "sin token"}`);
  const scopes = String(t.scope ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
  const fields = ["open_id", "avatar_url", "display_name", ...(scopes.includes("user.info.profile") ? ["username"] : [])];
  const { data: info } = await fetchJson<any>(
    `https://open.tiktokapis.com/v2/user/info/?fields=${fields.join(",")}`,
    { headers: { Authorization: `Bearer ${t.access_token}` } },
  );
  const u = info?.data?.user ?? {};
  return {
    externalId: String(u.open_id ?? t.open_id),
    handle: u.username ? `@${u.username}` : u.display_name || "TikTok",
    displayName: u.display_name,
    avatarUrl: https(u.avatar_url),
    access: t.access_token,
    refresh: t.refresh_token,
    expiresAt: inSeconds(t.expires_in),
    scopes,
  };
}

async function exchangeYouTube(code: string, verifier?: string): Promise<ConnectedAccount> {
  const { data: t } = await fetchJson<any>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id("youtube"),
      client_secret: secret("youtube"),
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("youtube"),
      ...(verifier ? { code_verifier: verifier } : {}),
    }),
  });
  if (!t?.access_token) throw new PlatformError("Google no devolvió el token");
  const { data: ch } = await fetchJson<any>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${t.access_token}` } },
  );
  const c = ch?.items?.[0];
  if (!c) throw new PlatformError("no_channel");
  const sn = c.snippet ?? {};
  return {
    externalId: String(c.id),
    handle: sn.customUrl ? (String(sn.customUrl).startsWith("@") ? sn.customUrl : `@${sn.customUrl}`) : sn.title,
    displayName: sn.title,
    avatarUrl: https(sn.thumbnails?.default?.url ?? sn.thumbnails?.medium?.url),
    access: t.access_token,
    refresh: t.refresh_token,
    expiresAt: inSeconds(t.expires_in),
    scopes: String(t.scope ?? SCOPES.youtube).split(" ").filter(Boolean),
  };
}

// ---- Revocación (al desconectar; si falla, igual se borran los tokens) ----
export async function revoke(p: Provider, access?: string | null, refresh?: string | null): Promise<void> {
  try {
    if (p === "tiktok" && access) {
      await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: id(p), client_secret: secret(p), token: access }),
        signal: AbortSignal.timeout(10_000),
      });
    }
    if (p === "youtube" && (refresh || access)) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: (refresh || access)! }),
        signal: AbortSignal.timeout(10_000),
      });
    }
    // Instagram (login de Instagram) no expone un endpoint de revocación:
    // el usuario puede quitar la app desde Configuración → Apps y sitios web.
  } catch {
    /* la revocación es de mejor esfuerzo */
  }
}

// ---- URLs de retorno permitidas -----------------------------------------
/** Devuelve la URL de la app (origen + ruta, sin query ni hash) si está permitida. */
export function allowedReturnUrl(candidate: unknown): string | null {
  if (typeof candidate !== "string" || candidate.length > 500) return null;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  const allowed = (env("APP_URLS") || "http://127.0.0.1:5173,http://localhost:5173")
    .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  if (!allowed.includes(u.origin)) return null;
  if (u.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(u.hostname)) return null;
  return `${u.origin}${u.pathname}`;
}
