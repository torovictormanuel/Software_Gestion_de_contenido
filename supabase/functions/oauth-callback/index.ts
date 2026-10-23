// =============================================================================
// Edge Function: oauth-callback  (pública: verify_jwt = false)
// URL registrada en cada plataforma:
//   https://<project-ref>.supabase.co/functions/v1/oauth-callback/{instagram|tiktok|youtube}
// Valida el "state" (un solo uso, 10 min, atado al usuario y a la red), canjea el
// código por tokens del lado del servidor, los guarda cifrados y vuelve a la app
// con ?conn=ok|error — nunca con tokens ni mensajes arbitrarios en la URL.
// =============================================================================
import { adminClient } from "../_shared/admin.ts";
import { PlatformError } from "../_shared/http.ts";
import { callbackUrl, exchange, type Provider, PROVIDERS } from "../_shared/oauth.ts";

const FALLBACK = (Deno.env.get("APP_URLS") ?? "http://127.0.0.1:5173").split(",")[0].trim();

function back(appUrl: string, provider: string, result: "ok" | "error", reason?: string): Response {
  const u = new URL(appUrl);
  u.searchParams.set("conn", result);
  u.searchParams.set("provider", provider);
  if (reason) u.searchParams.set("reason", reason);
  u.hash = "conexiones";
  return new Response(null, {
    status: 302,
    headers: { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const provider = url.pathname.split("/").filter(Boolean).pop() as Provider;
  if (req.method !== "GET" || !PROVIDERS.includes(provider)) {
    return new Response("Not found", { status: 404 });
  }
  const q = url.searchParams;
  const state = q.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return back(FALLBACK, provider, "error", "invalid_state");

  const admin = adminClient();
  const { data: rows, error: stErr } = await admin.rpc("consume_oauth_state", { p_state: state });
  const st = (rows as { user_id: string; provider: string; code_verifier: string | null; redirect_to: string }[] | null)?.[0];
  if (stErr || !st) return back(FALLBACK, provider, "error", "expired_state");
  const appUrl = st.redirect_to || FALLBACK;
  if (st.provider !== provider) return back(appUrl, provider, "error", "invalid_state");

  // El usuario canceló o la red rechazó el permiso.
  if (q.get("error") || !q.get("code")) {
    const denied = /denied|access_denied|cancel/i.test(`${q.get("error")} ${q.get("error_reason") ?? ""}`);
    return back(appUrl, provider, "error", denied ? "denied" : "provider_error");
  }

  try {
    const acc = await exchange(provider, q.get("code")!, st.code_verifier);
    const { data: accountId, error } = await admin.rpc("upsert_social_account", {
      p_user_id: st.user_id,
      p_platform: provider,
      p_handle: acc.handle.slice(0, 100),
      p_external_id: acc.externalId,
      p_access_token: acc.access,
      p_refresh_token: acc.refresh ?? null,
      p_expires_at: acc.expiresAt?.toISOString() ?? null,
      p_scopes: acc.scopes,
    });
    if (error) throw new Error(`save: ${error.message}`);
    await admin.from("social_accounts")
      .update({ display_name: acc.displayName?.slice(0, 150) ?? null, avatar_url: acc.avatarUrl ?? null })
      .eq("id", accountId);
    await admin.from("app_events").insert({
      user_id: st.user_id,
      name: "social_connected",
      props: { provider },
    }).then(() => {}, () => {});
    return back(appUrl, provider, "ok");
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const reason = e instanceof PlatformError && ["not_professional", "no_channel"].includes(msg)
      ? msg
      : msg.startsWith("save:") ? "save_failed" : "exchange_failed";
    const detail = (e instanceof PlatformError && e.opts.payload ? ` | ${JSON.stringify(e.opts.payload).slice(0, 500)}` : "") +
      ` | redirect_uri=${callbackUrl(provider)} | ruta=${url.pathname}`;
    console.error(JSON.stringify({ level: "error", fn: "oauth-callback", provider, reason, error: msg.slice(0, 500), detail }));
    await admin.from("error_reports").insert({
      source: "edge",
      context: `oauth-callback/${provider}`,
      message: (msg + detail).slice(0, 1000),
      user_id: st.user_id,
    }).then(() => {}, () => {});
    return back(appUrl, provider, "error", reason);
  }
});
