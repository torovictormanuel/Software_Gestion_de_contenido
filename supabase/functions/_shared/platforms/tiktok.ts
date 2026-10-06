// TikTok Content Posting API (Direct Post, FILE_UPLOAD por partes).
// Importante: hasta que TikTok audite la app, solo se puede publicar en
// privado (SELF_ONLY). Ajustá TIKTOK_PRIVACY_LEVEL tras la auditoría.
import { fetchJson, PlatformError } from "../http.ts";
import { deferred, type PublishCtx, type PublishOutcome } from "./types.ts";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

type TTResponse<T> = { data: T; error?: { code: string; message: string; log_id?: string } };

function checkTT<T>(r: TTResponse<T>): T {
  if (r.error && r.error.code && r.error.code !== "ok") {
    throw new PlatformError(`TikTok: ${r.error.message || r.error.code}`, {
      retryable: r.error.code === "rate_limit_exceeded" || r.error.code === "internal_error",
      authExpired: r.error.code === "access_token_invalid",
      payload: r.error,
    });
  }
  return r.data;
}

/** Partes de 10 MB; la última absorbe el resto (TikTok: 5–64 MB por parte, la última hasta 128 MB). */
function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export async function publishTikTok(ctx: PublishCtx): Promise<PublishOutcome> {
  const { post } = ctx;
  const m = post.media_urls?.[0];
  if (!m || m.type !== "video") {
    throw new PlatformError("TikTok: el publicador sube videos (las fotos requieren un dominio verificado en TikTok)");
  }
  const auth = { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json; charset=UTF-8" };
  const st: {
    publish_id?: string;
    upload_url?: string;
    size?: number;
    chunk_size?: number;
    count?: number;
    next_chunk?: number;
  } = { ...(ctx.state.tt ?? {}) };

  if (!st.publish_id) {
    const size = await ctx.mediaSize(m.path);
    if (size > 4 * 1024 * MB) throw new PlatformError("TikTok admite videos de hasta 4 GB");
    const { chunkSize, count } = chunkPlan(size);
    const { data } = await fetchJson<TTResponse<{ publish_id: string; upload_url: string }>>(
      `${API}/post/publish/video/init/`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          post_info: {
            title: (post.caption ?? post.title ?? "").slice(0, 2200),
            privacy_level: Deno.env.get("TIKTOK_PRIVACY_LEVEL") ?? "SELF_ONLY",
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
          source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
        }),
      },
    );
    const init = checkTT(data);
    Object.assign(st, {
      publish_id: init.publish_id,
      upload_url: init.upload_url,
      size,
      chunk_size: chunkSize,
      count,
      next_chunk: 0,
    });
    await ctx.saveState({ tt: st });
  }

  // Subida por partes (se puede retomar en otra ejecución).
  while ((st.next_chunk ?? 0) < st.count!) {
    if (Date.now() > ctx.deadline - 25_000) return deferred("Subiendo video a TikTok");
    const i = st.next_chunk!;
    const start = i * st.chunk_size!;
    const end = i === st.count! - 1 ? st.size! - 1 : start + st.chunk_size! - 1;
    const bytes = await ctx.readRange(m.path, start, end);
    let res: Response;
    try {
      res = await fetch(st.upload_url!, {
        method: "PUT",
        headers: { "Content-Type": m.mime ?? "video/mp4", "Content-Range": `bytes ${start}-${end}/${st.size}` },
        body: bytes,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      throw new PlatformError(`TikTok: fallo de red subiendo el video (${(e as Error).message})`, { retryable: true });
    }
    await res.body?.cancel();
    if (!res.ok) {
      throw new PlatformError(`TikTok rechazó la parte ${i + 1}/${st.count} (HTTP ${res.status})`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    st.next_chunk = i + 1;
    await ctx.saveState({ tt: st });
  }

  const { data } = await fetchJson<
    TTResponse<{ status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>
  >(`${API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ publish_id: st.publish_id }),
  });
  const s = checkTT(data);

  if (s.status === "PUBLISH_COMPLETE" || s.status === "SEND_TO_USER_INBOX") {
    const postId = s.publicaly_available_post_id?.[0];
    return {
      kind: "published",
      externalId: postId ? String(postId) : st.publish_id!,
      payload: { tiktok_status: s.status },
    };
  }
  if (s.status === "FAILED") {
    await ctx.saveState({ tt: {} });
    throw new PlatformError(`TikTok no publicó el video (${s.fail_reason ?? "sin detalle"})`);
  }
  return deferred(`TikTok procesando (${s.status})`);
}
