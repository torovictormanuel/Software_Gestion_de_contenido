// YouTube Data API v3 · subida reanudable (resumable upload) en partes de 8 MB.
// La sesión de subida se guarda en publish_state: si la función se corta,
// la siguiente ejecución pregunta a YouTube cuántos bytes recibió y sigue.
// Nota: los proyectos de Google Cloud sin verificar suben los videos como privados.
import { PlatformError } from "../http.ts";
import { deferred, type PublishCtx, type PublishOutcome } from "./types.ts";

const CHUNK = 8 * 1024 * 1024; // múltiplo de 256 KB, como exige la API

const clean = (s: string) => s.replace(/[<>]/g, "").trim();

async function ytError(res: Response, what: string): Promise<PlatformError> {
  let payload: any = {};
  try {
    payload = await res.json();
  } catch { /* sin cuerpo JSON */ }
  const msg = payload?.error?.message ?? `HTTP ${res.status}`;
  return new PlatformError(`YouTube (${what}): ${msg}`, {
    status: res.status,
    retryable: res.status >= 500 || res.status === 429,
    authExpired: res.status === 401,
    payload: payload?.error,
  });
}

function done(video: { id: string }, isShort: boolean): PublishOutcome {
  return {
    kind: "published",
    externalId: video.id,
    url: isShort ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`,
  };
}

export async function publishYouTube(ctx: PublishCtx): Promise<PublishOutcome> {
  const { post } = ctx;
  const m = post.media_urls?.[0];
  if (!m || m.type !== "video") throw new PlatformError("YouTube requiere un video");
  const isShort = post.post_type === "short" || post.post_type === "reel";
  const auth = { Authorization: `Bearer ${ctx.accessToken}` };
  const st: { upload_url?: string; size?: number; offset?: number } = { ...(ctx.state.yt ?? {}) };

  if (!st.upload_url) {
    const size = await ctx.mediaSize(m.path);
    const caption = post.caption ?? "";
    let title = clean(post.title || caption.split("\n")[0] || "Nuevo video").slice(0, 100);
    if (isShort && !/#shorts/i.test(`${title} ${caption}`)) title = `${title.slice(0, 91)} #Shorts`;

    const res = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(size),
          "X-Upload-Content-Type": m.mime ?? "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title,
            description: clean(caption).slice(0, 5000),
            categoryId: Deno.env.get("YOUTUBE_CATEGORY_ID") ?? "22",
          },
          status: {
            privacyStatus: Deno.env.get("YOUTUBE_PRIVACY_STATUS") ?? "public",
            selfDeclaredMadeForKids: false,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) throw await ytError(res, "iniciar subida");
    await res.body?.cancel();
    const location = res.headers.get("Location");
    if (!location) throw new PlatformError("YouTube no devolvió la URL de subida", { retryable: true });
    Object.assign(st, { upload_url: location, size, offset: 0 });
    await ctx.saveState({ yt: st });
  } else {
    // Retomar: consultar cuántos bytes tiene YouTube.
    const res = await fetch(st.upload_url, {
      method: "PUT",
      headers: { ...auth, "Content-Range": `bytes */${st.size}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return done(await res.json(), isShort);
    if (res.status === 404 || res.status === 410) {
      await ctx.saveState({ yt: {} }); // sesión vencida: empezar de nuevo
      throw new PlatformError("La sesión de subida de YouTube venció; se reintenta", { retryable: true });
    }
    if (res.status !== 308) throw await ytError(res, "retomar subida");
    await res.body?.cancel();
    const range = res.headers.get("Range"); // "bytes=0-12345"
    st.offset = range ? Number(range.split("-")[1]) + 1 : 0;
    await ctx.saveState({ yt: st });
  }

  while (st.offset! < st.size!) {
    if (Date.now() > ctx.deadline - 25_000) return deferred("Subiendo video a YouTube");
    const start = st.offset!;
    const end = Math.min(start + CHUNK, st.size!) - 1;
    const bytes = await ctx.readRange(m.path, start, end);
    let res: Response;
    try {
      res = await fetch(st.upload_url!, {
        method: "PUT",
        headers: { ...auth, "Content-Range": `bytes ${start}-${end}/${st.size}` },
        body: bytes,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      throw new PlatformError(`YouTube: fallo de red subiendo (${(e as Error).message})`, { retryable: true });
    }
    if (res.ok) return done(await res.json(), isShort);
    if (res.status !== 308) throw await ytError(res, "subir parte");
    await res.body?.cancel();
    const range = res.headers.get("Range");
    st.offset = range ? Number(range.split("-")[1]) + 1 : start;
    await ctx.saveState({ yt: st });
  }
  return deferred("YouTube procesando la subida");
}
