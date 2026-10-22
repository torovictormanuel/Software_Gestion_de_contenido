// Pruebas de _shared/oauth.ts con las APIs de cada red simuladas.
// Uso: deno test --allow-env supabase/functions/tests/oauth.test.ts
import {
  allowedReturnUrl,
  authorizeUrl,
  callbackUrl,
  challengeOf,
  exchange,
  isConfigured,
  newVerifier,
} from "../_shared/oauth.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://demo.supabase.co",
  INSTAGRAM_APP_ID: "ig-id", INSTAGRAM_APP_SECRET: "ig-secret",
  TIKTOK_CLIENT_KEY: "tt-key", TIKTOK_CLIENT_SECRET: "tt-secret",
  GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret",
  APP_URLS: "https://app.example.com,http://127.0.0.1:5173",
};
for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

type Route = (url: URL, init: RequestInit) => unknown;
function mockFetch(routes: Record<string, Route>) {
  const calls: { url: URL; body: string; headers: Headers }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push({ url, body: String(init.body ?? ""), headers: new Headers(init.headers) });
    const key = Object.keys(routes).find((k) => `${url.origin}${url.pathname}`.startsWith(k));
    if (!key) return new Response(JSON.stringify({ error: { message: "ruta no simulada " + url } }), { status: 404 });
    const out = routes[key](url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  return calls;
}

Deno.test("credenciales detectadas y redirect URI por red", () => {
  assert(isConfigured("instagram") && isConfigured("tiktok") && isConfigured("youtube"), "isConfigured");
  assert(callbackUrl("tiktok") === "https://demo.supabase.co/functions/v1/oauth-callback/tiktok", "callbackUrl");
});

Deno.test("URLs de autorización", async () => {
  const ig = new URL(await authorizeUrl("instagram", "s".repeat(43)));
  assert(ig.origin + ig.pathname === "https://www.instagram.com/oauth/authorize", "ig host");
  assert(ig.searchParams.get("scope")!.includes("instagram_business_content_publish"), "ig scope");
  assert(ig.searchParams.get("redirect_uri") === callbackUrl("instagram"), "ig redirect");

  const tt = new URL(await authorizeUrl("tiktok", "s".repeat(43)));
  assert(tt.href.startsWith("https://www.tiktok.com/v2/auth/authorize/"), "tt host");
  assert(tt.searchParams.get("client_key") === "tt-key" && !tt.searchParams.has("code_challenge"), "tt params");

  const v = newVerifier();
  const yt = new URL(await authorizeUrl("youtube", "s".repeat(43), v));
  assert(yt.searchParams.get("code_challenge") === await challengeOf(v), "pkce");
  assert(yt.searchParams.get("access_type") === "offline" && yt.searchParams.get("prompt") === "consent", "offline");
});

Deno.test("PKCE: verifier válido y challenge S256 conocido (RFC 7636)", async () => {
  const v = newVerifier();
  assert(/^[A-Za-z0-9_-]{43,128}$/.test(v), "verifier");
  assert(await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "rfc");
});

Deno.test("Instagram: código → token corto → largo → perfil profesional", async () => {
  const calls = mockFetch({
    "https://api.instagram.com/oauth/access_token": () => ({ data: [{ access_token: "SHORT", user_id: "111", permissions: "instagram_business_basic,instagram_business_content_publish" }] }),
    "https://graph.instagram.com/access_token": () => ({ access_token: "LONG", token_type: "bearer", expires_in: 5183944 }),
    "https://graph.instagram.com/v26.0/me": () => ({ user_id: "17841400000000000", username: "himproductmedia", name: "HIM", profile_picture_url: "https://cdn.example/p.jpg", account_type: "BUSINESS" }),
  });
  const a = await exchange("instagram", "CODE#_");
  assert(a.access === "LONG" && a.externalId === "17841400000000000" && a.handle === "@himproductmedia", "ig account");
  assert(a.expiresAt && a.expiresAt.getTime() > Date.now() + 59 * 864e5, "60 días");
  assert(new URLSearchParams(calls[0].body).get("code") === "CODE", "quita #_");
  assert(calls[2].headers.get("Authorization") === "Bearer LONG", "bearer");
  assert(!calls.some((c) => c.url.search.includes("LONG")), "el token largo no viaja en la URL");
});

Deno.test("Instagram: cuenta personal rechazada", async () => {
  mockFetch({
    "https://api.instagram.com/oauth/access_token": () => ({ access_token: "SHORT", user_id: "1" }),
    "https://graph.instagram.com/access_token": () => ({ access_token: "LONG", expires_in: 100 }),
    "https://graph.instagram.com/v26.0/me": () => ({ user_id: "1", username: "x", account_type: "PERSONAL" }),
  });
  let msg = "";
  try { await exchange("instagram", "C"); } catch (e) { msg = (e as Error).message; }
  assert(msg === "not_professional", "debería rechazar: " + msg);
});

Deno.test("TikTok: token + user info con username", async () => {
  const calls = mockFetch({
    "https://open.tiktokapis.com/v2/oauth/token/": () => ({ access_token: "TT", refresh_token: "RT", expires_in: 86400, open_id: "open-1", scope: "user.info.basic,user.info.profile,video.publish" }),
    "https://open.tiktokapis.com/v2/user/info/": () => ({ data: { user: { open_id: "open-1", display_name: "HIM", username: "him.media", avatar_url: "https://p16.tiktokcdn.com/a.jpg" } }, error: { code: "ok" } }),
  });
  const a = await exchange("tiktok", "abc%2A");
  assert(a.externalId === "open-1" && a.handle === "@him.media" && a.refresh === "RT", "tt account");
  assert(new URLSearchParams(calls[0].body).get("code") === "abc*", "code decodificado");
  assert(calls[1].url.searchParams.get("fields")!.includes("username"), "pide username");
});

Deno.test("YouTube: token con code_verifier + canal", async () => {
  const calls = mockFetch({
    "https://oauth2.googleapis.com/token": () => ({ access_token: "YA", refresh_token: "YR", expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload" }),
    "https://www.googleapis.com/youtube/v3/channels": () => ({ items: [{ id: "UC123", snippet: { title: "HIM Product Media", customUrl: "@himproductmedia", thumbnails: { default: { url: "https://yt3.ggpht.com/x" } } } }] }),
  });
  const a = await exchange("youtube", "G-CODE", "VERIFIER");
  assert(a.externalId === "UC123" && a.handle === "@himproductmedia" && a.refresh === "YR", "yt account");
  assert(new URLSearchParams(calls[0].body).get("code_verifier") === "VERIFIER", "verifier enviado");
});

Deno.test("YouTube: cuenta sin canal", async () => {
  mockFetch({
    "https://oauth2.googleapis.com/token": () => ({ access_token: "YA", expires_in: 3599 }),
    "https://www.googleapis.com/youtube/v3/channels": () => ({ items: [] }),
  });
  let msg = "";
  try { await exchange("youtube", "C", "V"); } catch (e) { msg = (e as Error).message; }
  assert(msg === "no_channel", msg);
});

Deno.test("URL de retorno: solo orígenes permitidos, sin query ni hash", () => {
  assert(allowedReturnUrl("https://app.example.com/app/?x=1#panel") === "https://app.example.com/app/", "permitida");
  assert(allowedReturnUrl("http://127.0.0.1:5173/") === "http://127.0.0.1:5173/", "local");
  assert(allowedReturnUrl("https://evil.example.com/") === null, "otro origen");
  assert(allowedReturnUrl("javascript:alert(1)") === null, "esquema");
  assert(allowedReturnUrl(123) === null, "tipo");
});
