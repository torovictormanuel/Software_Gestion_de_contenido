export type MediaItem = { path: string; type: "image" | "video"; mime?: string };

export interface PostRow {
  id: string;
  user_id: string;
  social_account_id: string;
  title: string | null;
  caption: string | null;
  media_urls: MediaItem[];
  platform: "instagram" | "tiktok" | "youtube";
  post_type: "image" | "carousel" | "reel" | "story" | "short" | "video";
  attempts: number;
  publish_state: Record<string, any>;
  scheduled_at: string;
}

export interface PublishCtx {
  post: PostRow;
  accessToken: string;
  externalAccountId: string;
  /** Epoch ms a partir del cual hay que cortar y diferir (límite de la Edge Function). */
  deadline: number;
  /** Estado persistente entre ejecuciones (ids de contenedores, offsets de subida…). */
  state: Record<string, any>;
  saveState(patch: Record<string, unknown>): Promise<void>;
  /** Marca que empieza la llamada final irreversible (evita duplicados si la función muere). */
  markFinalCall(): Promise<void>;
  signedUrl(path: string, seconds?: number): Promise<string>;
  mediaSize(path: string): Promise<number>;
  readRange(path: string, start: number, endInclusive: number): Promise<Uint8Array<ArrayBuffer>>;
}

export type PublishOutcome =
  | { kind: "published"; externalId: string; url?: string; payload?: unknown }
  | { kind: "deferred"; reason: string; payload?: unknown };

export const deferred = (reason: string, payload?: unknown): PublishOutcome => ({ kind: "deferred", reason, payload });
