// Instagram API con login de Instagram (graph.instagram.com).
// Flujo: crear contenedor(es) → esperar status FINISHED → media_publish.
// Los ids de contenedor se guardan en publish_state para continuar en la
// siguiente ejecución si Instagram todavía está procesando el video.
import { fetchJson, PlatformError, sleep } from "../http.ts";
import { deferred, type PublishCtx, type PublishOutcome } from "./types.ts";

const VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";
const BASE = `https://graph.instagram.com/${VERSION}`;

type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";

async function igPost(ctx: PublishCtx, path: string, params: Record<string, string>) {
  const { data } = await fetchJson<{ id: string }>(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!data.id) throw new PlatformError("Instagram no devolvió un id", { retryable: true, payload: data });
  return data.id;
}

async function containerStatus(ctx: PublishCtx, id: string): Promise<{ code: ContainerStatus; detail?: string }> {
  const { data } = await fetchJson<{ status_code: ContainerStatus; status?: string }>(
    `${BASE}/${id}?fields=status_code,status`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
  );
  return { code: data.status_code, detail: data.status };
}

/** Espera hasta maxMs a que el contenedor esté listo (sin pasarse del deadline). */
async function waitFinished(ctx: PublishCtx, id: string, maxMs: number) {
  const until = Math.min(Date.now() + maxMs, ctx.deadline - 15_000);
  let st = await containerStatus(ctx, id);
  while (st.code === "IN_PROGRESS" && Date.now() < until) {
    await sleep(4_000);
    st = await containerStatus(ctx, id);
  }
  return st;
}

export async function publishInstagram(ctx: PublishCtx): Promise<PublishOutcome> {
  const { post } = ctx;
  const media = post.media_urls ?? [];
  if (!media.length) throw new PlatformError("Instagram requiere al menos una imagen o un video");

  const caption = (post.caption ?? "").slice(0, 2200);
  const igUser = ctx.externalAccountId;
  const kind = post.post_type === "story"
    ? "story"
    : post.post_type === "carousel" && media.length > 1
    ? "carousel"
    : media[0].type === "video"
    ? "reel"
    : "image";
  if (kind === "carousel" && media.length > 10) throw new PlatformError("Un carrusel admite hasta 10 archivos");

  const st: { children?: string[]; container?: string } = { ...(ctx.state.ig ?? {}) };

  if (!st.container) {
    if (kind === "carousel") {
      st.children ??= [];
      for (let i = st.children.length; i < media.length; i++) {
        const m = media[i];
        const url = await ctx.signedUrl(m.path, 7200);
        const id = await igPost(
          ctx,
          `/${igUser}/media`,
          m.type === "video"
            ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" }
            : { image_url: url, is_carousel_item: "true" },
        );
        st.children.push(id);
        await ctx.saveState({ ig: st });
      }
      const statuses = await Promise.all(st.children.map((id) => waitFinished(ctx, id, 20_000)));
      if (statuses.some((s) => s.code === "ERROR" || s.code === "EXPIRED")) {
        await ctx.saveState({ ig: {} });
        throw new PlatformError("Instagram rechazó uno de los archivos del carrusel", { payload: statuses });
      }
      if (statuses.some((s) => s.code !== "FINISHED")) return deferred("Instagram procesando el carrusel");
      st.container = await igPost(ctx, `/${igUser}/media`, {
        media_type: "CAROUSEL",
        children: st.children.join(","),
        caption,
      });
    } else {
      const m = media[0];
      const url = await ctx.signedUrl(m.path, 7200);
      const isVideo = m.type === "video";
      const params: Record<string, string> =
        kind === "story"
          ? isVideo ? { media_type: "STORIES", video_url: url } : { media_type: "STORIES", image_url: url }
          : kind === "reel"
          ? { media_type: "REELS", video_url: url, caption, share_to_feed: "true" }
          : { image_url: url, caption };
      st.container = await igPost(ctx, `/${igUser}/media`, params);
    }
    await ctx.saveState({ ig: st });
  }

  const status = await waitFinished(ctx, st.container, 45_000);
  if (status.code === "ERROR" || status.code === "EXPIRED") {
    await ctx.saveState({ ig: {} }); // el próximo intento crea un contenedor nuevo
    throw new PlatformError(`Instagram no pudo procesar el archivo (${status.detail ?? status.code})`, {
      retryable: status.code === "EXPIRED",
    });
  }
  if (status.code !== "FINISHED") return deferred("Instagram procesando el video");

  await ctx.markFinalCall();
  const mediaId = await igPost(ctx, `/${igUser}/media_publish`, { creation_id: st.container });

  let permalink: string | undefined;
  try {
    const { data } = await fetchJson<{ permalink?: string }>(`${BASE}/${mediaId}?fields=permalink`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    permalink = data.permalink;
  } catch {
    // el post ya está publicado; el permalink es opcional
  }
  return { kind: "published", externalId: mediaId, url: permalink };
}
