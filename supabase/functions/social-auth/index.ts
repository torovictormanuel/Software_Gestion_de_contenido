// =============================================================================
// Edge Function: social-auth  (requiere sesión: verify_jwt = true)
// POST { action: "providers" }                         → qué redes están listas
// POST { action: "start", provider, redirect_to }      → { url } para autorizar
// POST { action: "disconnect", account_id }            → revoca y borra la cuenta
// Los tokens nunca llegan al navegador: el canje ocurre en oauth-callback.
// =============================================================================
import { adminClient, userClient } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  allowedReturnUrl,
  authorizeUrl,
  isConfigured,
  newVerifier,
  type Provider,
  PROVIDERS,
  revoke,
  usesPkce,
} from "../_shared/oauth.ts";

Deno.serve(async (req) => {
  const cors = { ...corsHeaders(req), "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: auth } = await userClient(authHeader).auth.getUser();
  if (!auth?.user) return json({ error: "Iniciá sesión" }, 401, cors);
  const uid = auth.user.id;
  const body = await req.json().catch(() => ({}));

  try {
    if (body?.action === "providers") {
      return json({ providers: Object.fromEntries(PROVIDERS.map((p) => [p, isConfigured(p)])) }, 200, cors);
    }

    if (body?.action === "start") {
      const provider = body.provider as Provider;
      if (!PROVIDERS.includes(provider)) return json({ error: "Red no soportada" }, 400, cors);
      if (!isConfigured(provider)) {
        return json({ error: "not_configured", message: "Esta red todavía no tiene la app configurada." }, 503, cors);
      }
      const returnTo = allowedReturnUrl(body.redirect_to);
      if (!returnTo) return json({ error: "URL de retorno no permitida" }, 400, cors);

      const verifier = usesPkce(provider) ? newVerifier() : null;
      const { data: state, error } = await adminClient().rpc("create_oauth_state", {
        p_user_id: uid,
        p_provider: provider,
        p_code_verifier: verifier,
        p_redirect_to: returnTo,
      });
      if (error) {
        if (/rate_limited/.test(error.message)) {
          return json({ error: "rate_limited", message: "Demasiados intentos. Probá en unos minutos." }, 429, cors);
        }
        throw new Error(error.message);
      }
      return json({ url: await authorizeUrl(provider, state as string, verifier ?? undefined) }, 200, cors);
    }

    if (body?.action === "disconnect") {
      const accountId = typeof body.account_id === "string" ? body.account_id : "";
      // Verifica la propiedad con el JWT del usuario (RLS).
      const { data: own } = await userClient(authHeader).from("social_accounts")
        .select("id, platform").eq("id", accountId).maybeSingle();
      if (!own) return json({ error: "Cuenta no encontrada" }, 404, cors);

      const admin = adminClient();
      const { data: tok } = await admin.rpc("get_social_account_tokens", { p_account_id: own.id }).maybeSingle();
      const t = tok as { access_token?: string; refresh_token?: string } | null;
      await revoke(own.platform as Provider, t?.access_token, t?.refresh_token);
      const { error } = await admin.from("social_accounts").delete().eq("id", own.id).eq("user_id", uid);
      if (error) {
        const busy = /publicaciones en curso/.test(error.message);
        return json({ error: busy ? "busy" : "No se pudo desconectar", message: error.message }, busy ? 409 : 500, cors);
      }
      return json({ disconnected: true }, 200, cors);
    }

    return json({ error: "Acción inválida" }, 400, cors);
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 1000);
    console.error(JSON.stringify({ level: "error", fn: "social-auth", error: message }));
    await adminClient().from("error_reports").insert({ source: "edge", context: "social-auth", message, user_id: uid })
      .then(() => {}, () => {});
    return json({ error: "No se pudo completar la acción. Probá de nuevo." }, 500, cors);
  }
});
