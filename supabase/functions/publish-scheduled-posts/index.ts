// =============================================================================
// Edge Function: publish-scheduled-posts
// La invoca pg_cron (ver supabase/cron.sql) con el header x-cron-secret.
// Desplegar con:  supabase functions deploy publish-scheduled-posts --no-verify-jwt
//   (no usa JWT de usuario; se autentica con CRON_SECRET en tiempo constante)
//
// Ciclo por post:
//   claim_due_posts() → status 'publishing' (bloqueo SKIP LOCKED)
//   → token (descifrado en la base, refresco si vence) → API de la red
//   → published | deferred (sigue procesando la red) | retry (backoff) | failed
// =============================================================================
import { adminClient, BUCKET, type SupabaseClient } from "../_shared/admin.ts";
import { json, PlatformError, redact, timingSafeEqual } from "../_shared/http.ts";
import { getAccountTokens } from "../_shared/tokens.ts";
import { publishInstagram } from "../_shared/platforms/instagram.ts";
import { publishTikTok } from "../_shared/platforms/tiktok.ts";
import { publishYouTube } from "../_shared/platforms/youtube.ts";
import type { PostRow, PublishCtx, PublishOutcome } from "../_shared/platforms/types.ts";

// Provisto por el runtime de Supabase Edge Functions.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const PUBLISHERS: Record<PostRow["platform"], (ctx: PublishCtx) => Promise<PublishOutcome>> = {
  instagram: publishInstagram,
  tiktok: publishTikTok,
  youtube: publishYouTube,
};

const BUDGET_MS = Number(Deno.env.get("PUBLISH_BUDGET_MS") ?? 110_000); // < límite de la función
const MAX_ATTEMPTS = Number(Deno.env.get("PUBLISH_MAX_ATTEMPTS") ?? 3);
const MAX_PROCESSING_MS = 45 * 60_000; // tope para videos "en proceso" en la red
const POLL_DELAY_MS = 60_000;

const log = (level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) =>
  console[level === "info" ? "log" : level](JSON.stringify({ level, fn: "publish-scheduled-posts", msg, ...extra }));

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // El secreto vive en Vault (cron_secret). Si además se definió CRON_SECRET en
  // los secretos de la función, se compara localmente y se evita la consulta.
  const given = req.headers.get("x-cron-secret") ?? "";
  const local = Deno.env.get("CRON_SECRET");
  let authorized = false;
  if (given.length >= 32 && given.length <= 256) {
    if (local) {
      authorized = timingSafeEqual(given, local);
    } else {
      const { data } = await adminClient().rpc("verify_cron_secret", { p_secret: given });
      authorized = data === true;
    }
  }
  if (!authorized) return json({ error: "No autorizado" }, 401);

  let limit = 5;
  try {
    const body = await req.json();
    limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 25);
  } catch { /* body opcional */ }

  // Respondemos ya y seguimos en segundo plano (pg_net no espera la subida de videos).
  EdgeRuntime.waitUntil(
    runBatch(limit).catch(async (e) => {
      const message = String(e?.message ?? e).slice(0, 1000);
      log("error", "batch_failed", { error: message });
      await adminClient().from("error_reports")
        .insert({ source: "edge", context: "publish-scheduled-posts", message });
    }),
  );
  return json({ accepted: true }, 202);
});

async function runBatch(limit: number) {
  const admin = adminClient();
  const deadline = Date.now() + BUDGET_MS;

  const { data, error } = await admin.rpc("claim_due_posts", { p_limit: limit });
  if (error) throw new Error(`claim_due_posts: ${error.message}`);
  const posts = (data ?? []) as PostRow[];
  if (!posts.length) return;

  const summary: Record<string, number> = {};
  for (let i = 0; i < posts.length; i++) {
    if (Date.now() > deadline - 20_000) {
      // Sin tiempo: devolver a la cola los que no se tocaron.
      const rest = posts.slice(i).map((p) => p.id);
      await admin.from("posts").update({ status: "scheduled", locked_at: null }).in("id", rest);
      summary.released = rest.length;
      break;
    }
    const result = await processPost(admin, posts[i], deadline);
    summary[result] = (summary[result] ?? 0) + 1;
  }
  log("info", "batch_done", { claimed: posts.length, ...summary });
}

async function processPost(admin: SupabaseClient, post: PostRow, deadline: number): Promise<string> {
  const state: Record<string, any> = { ...(post.publish_state ?? {}) };
  if (!state.first_attempt_at) state.first_attempt_at = new Date().toISOString();

  const saveState = async (patch: Record<string, unknown>) => {
    Object.assign(state, patch);
    const { error } = await admin.from("posts").update({ publish_state: state }).eq("id", post.id);
    if (error) throw new PlatformError(`No se pudo guardar el progreso: ${error.message}`, { retryable: true });
  };

  // URLs firmadas del bucket privado (se cachean por ejecución).
  const urlCache = new Map<string, string>();
  const signedUrl = async (path: string, seconds = 3600) => {
    // Defensa extra: el service_role puede firmar cualquier archivo, así que se
    // verifica que la ruta sea del dueño del post (el trigger también lo valida).
    if (!path.startsWith(`${post.user_id}/`) || path.includes("..")) {
      throw new PlatformError("Ruta de archivo no válida");
    }
    const key = `${path}|${seconds}`;
    if (urlCache.has(key)) return urlCache.get(key)!;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, seconds);
    if (error || !data) throw new PlatformError(`Archivo no encontrado: ${path}`);
    urlCache.set(key, data.signedUrl);
    return data.signedUrl;
  };
  const readRange = async (path: string, start: number, end: number) => {
    const res = await fetch(await signedUrl(path), {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status !== 206 && !(res.status === 200 && start === 0)) {
      await res.body?.cancel();
      throw new PlatformError(`Storage devolvió HTTP ${res.status}`, { retryable: res.status >= 500 });
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const expected = end - start + 1;
    return buf.length > expected ? buf.subarray(0, expected) : buf;
  };
  const mediaSize = async (path: string) => {
    const res = await fetch(await signedUrl(path), {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(20_000),
    });
    await res.body?.cancel();
    const total = Number(res.headers.get("Content-Range")?.split("/")[1] ?? res.headers.get("Content-Length"));
    if (!Number.isFinite(total) || total <= 0) throw new PlatformError("No se pudo leer el tamaño del archivo");
    return total;
  };

  const ctx: PublishCtx = {
    post,
    accessToken: "",
    externalAccountId: "",
    deadline,
    state,
    saveState,
    markFinalCall: () => saveState({ final_call_at: new Date().toISOString() }),
    signedUrl,
    mediaSize,
    readRange,
  };

  try {
    if (!post.social_account_id) throw new PlatformError("El post no tiene una cuenta conectada");
    let tokens = await getAccountTokens(admin, post.social_account_id);
    if (tokens.platform !== post.platform) throw new PlatformError("La cuenta no corresponde a la red del post");
    ctx.accessToken = tokens.accessToken;
    ctx.externalAccountId = tokens.externalAccountId;
    await saveState({});

    let outcome: PublishOutcome;
    try {
      outcome = await PUBLISHERS[post.platform](ctx);
    } catch (e) {
      // 401: refrescar el token una vez y reintentar (si no estábamos en el paso final).
      if (e instanceof PlatformError && e.opts.authExpired && !state.final_call_at) {
        tokens = await getAccountTokens(admin, post.social_account_id, { forceRefresh: true });
        ctx.accessToken = tokens.accessToken;
        outcome = await PUBLISHERS[post.platform](ctx);
      } else {
        throw e;
      }
    }

    if (outcome.kind === "published") {
      await update(admin, post.id, {
        status: "published",
        published_at: new Date().toISOString(),
        external_post_id: outcome.externalId,
        external_url: outcome.url ?? null,
        error_message: null,
        locked_at: null,
        next_attempt_at: null,
        publish_state: { ...state, done_at: new Date().toISOString() },
      });
      await writeLog(admin, post, "success", { external_id: outcome.externalId, url: outcome.url, ...asObj(outcome.payload) });
      return "published";
    }

    // deferred: la red sigue procesando; volvemos en ~1 minuto.
    if (Date.now() - Date.parse(state.first_attempt_at) > MAX_PROCESSING_MS) {
      throw new PlatformError(`La red tardó demasiado en procesar el archivo (${outcome.reason})`);
    }
    await update(admin, post.id, {
      status: "scheduled",
      locked_at: null,
      next_attempt_at: new Date(Date.now() + POLL_DELAY_MS).toISOString(),
    });
    await writeLog(admin, post, "deferred", { reason: outcome.reason, ...asObj(outcome.payload) });
    return "deferred";
  } catch (e) {
    const err = e instanceof PlatformError
      ? e
      : new PlatformError(String((e as Error)?.message ?? e), { retryable: true });
    // Si falló la llamada final de forma ambigua, NO reintentamos: podría duplicar el post.
    const ambiguous = !!state.final_call_at && err.retryable;
    const attempts = (post.attempts ?? 0) + 1;

    if (err.retryable && !ambiguous && attempts < MAX_ATTEMPTS) {
      const backoffMs = 2 ** attempts * 60_000; // 2, 4, 8… minutos
      await update(admin, post.id, {
        status: "scheduled",
        attempts,
        locked_at: null,
        next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
        error_message: err.message.slice(0, 2000),
      });
      await writeLog(admin, post, "retry", { error: err.message, http_status: err.opts.status, detail: err.opts.payload }, attempts);
      log("warn", "post_retry", { post_id: post.id, platform: post.platform, attempts, error: err.message });
      return "retry";
    }

    const message = ambiguous
      ? `Error en el paso final; verificá en ${post.platform} antes de reintentar. (${err.message})`
      : err.message;
    await update(admin, post.id, {
      status: "failed",
      attempts,
      locked_at: null,
      next_attempt_at: null,
      error_message: message.slice(0, 2000),
    });
    await writeLog(admin, post, "failed", { error: message, http_status: err.opts.status, detail: err.opts.payload }, attempts);
    log("error", "post_failed", { post_id: post.id, platform: post.platform, attempts, error: err.message });
    return "failed";
  }
}

async function update(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("posts").update(patch).eq("id", id);
  if (error) log("error", "post_update_failed", { post_id: id, error: error.message });
}

async function writeLog(
  admin: SupabaseClient,
  post: PostRow,
  status: "success" | "deferred" | "retry" | "failed",
  payload: Record<string, unknown>,
  attempt = post.attempts ?? 0,
) {
  const { error } = await admin.from("publishing_logs").insert({
    post_id: post.id,
    user_id: post.user_id, // el trigger lo vuelve a derivar del post
    status,
    attempt,
    response_payload: redact({ platform: post.platform, ...payload }),
  });
  if (error) log("warn", "log_insert_failed", { post_id: post.id, error: error.message });
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : v === undefined ? {} : { detail: v };
