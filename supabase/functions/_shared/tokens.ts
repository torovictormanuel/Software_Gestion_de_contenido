// Lectura/refresco de tokens OAuth de las cuentas sociales.
// Los tokens se descifran en la base (RPC solo para service_role) y viven
// únicamente en memoria durante la ejecución.
import type { SupabaseClient } from "./admin.ts";
import { fetchJson, PlatformError, requireEnv } from "./http.ts";

export type Platform = "instagram" | "tiktok" | "youtube";

export interface AccountTokens {
  accessToken: string;
  externalAccountId: string;
  platform: Platform;
}

interface Refreshed {
  access: string;
  refresh?: string;
  expiresAt: Date;
}

// Cuánto antes del vencimiento refrescar.
const REFRESH_WINDOW_MS: Record<Platform, number> = {
  instagram: 7 * 24 * 3600_000, // tokens long-lived de 60 días
  tiktok: 10 * 60_000, // access token de 24 h
  youtube: 5 * 60_000, // access token de 1 h
};

export async function getAccountTokens(
  admin: SupabaseClient,
  accountId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<AccountTokens> {
  const { data, error } = await admin.rpc("get_social_account_tokens", { p_account_id: accountId }).single();
  if (error || !data) throw new PlatformError("Cuenta conectada no encontrada");
  const row = data as {
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: string | null;
    external_account_id: string | null;
    platform: Platform;
    is_active: boolean;
  };
  if (!row.is_active) throw new PlatformError("La cuenta está desactivada");
  if (!row.access_token || !row.external_account_id) {
    throw new PlatformError("La cuenta no tiene credenciales: volvé a conectarla");
  }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : Infinity;
  const needsRefresh = opts.forceRefresh || expiresAt - Date.now() < REFRESH_WINDOW_MS[row.platform];
  if (!needsRefresh) {
    return { accessToken: row.access_token, externalAccountId: row.external_account_id, platform: row.platform };
  }

  let fresh: Refreshed;
  try {
    fresh = await refresh(row.platform, row.access_token, row.refresh_token);
  } catch (e) {
    if (!(e instanceof PlatformError)) throw e; // p. ej. falta una variable de entorno
    const err = e;
    // Si el token todavía sirve y el fallo es transitorio, seguimos con el actual.
    if (!opts.forceRefresh && expiresAt > Date.now() + 60_000 && err.retryable) {
      return { accessToken: row.access_token, externalAccountId: row.external_account_id, platform: row.platform };
    }
    if (!err.retryable) {
      await admin.from("social_accounts")
        .update({ last_error: "No se pudo renovar el acceso: volvé a conectar la cuenta." })
        .eq("id", accountId);
      throw new PlatformError("Acceso vencido: volvé a conectar la cuenta", { payload: err.opts.payload });
    }
    throw err;
  }

  const { error: upErr } = await admin.rpc("update_social_account_tokens", {
    p_account_id: accountId,
    p_access_token: fresh.access,
    p_refresh_token: fresh.refresh ?? null,
    p_expires_at: fresh.expiresAt.toISOString(),
  });
  if (upErr) throw new PlatformError("No se pudo guardar el token renovado", { retryable: true });
  return { accessToken: fresh.access, externalAccountId: row.external_account_id, platform: row.platform };
}

async function refresh(platform: Platform, access: string, refreshToken: string | null): Promise<Refreshed> {
  const in_ = (sec: number) => new Date(Date.now() + sec * 1000);

  if (platform === "instagram") {
    // Instagram API con login de Instagram: el long-lived token se renueva a sí mismo.
    const u = new URL("https://graph.instagram.com/refresh_access_token");
    u.searchParams.set("grant_type", "ig_refresh_token");
    const { data } = await fetchJson<{ access_token: string; expires_in: number }>(u.toString(), {
      headers: { Authorization: `Bearer ${access}` },
    });
    return { access: data.access_token, expiresAt: in_(data.expires_in) };
  }

  if (!refreshToken) throw new PlatformError("Sin refresh token: volvé a conectar la cuenta");

  if (platform === "tiktok") {
    const { data } = await fetchJson<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: requireEnv("TIKTOK_CLIENT_KEY"),
        client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    return { access: data.access_token, refresh: data.refresh_token, expiresAt: in_(data.expires_in) };
  }

  // youtube (Google OAuth)
  const { data } = await fetchJson<{ access_token: string; expires_in: number; refresh_token?: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
  return { access: data.access_token, refresh: data.refresh_token, expiresAt: in_(data.expires_in) };
}
