// =============================================================================
// Edge Function: delete-account  (derecho de supresión · Ley 25.326 / GDPR /
// requisito de borrado de datos de Meta, TikTok y Google)
// POST { confirm: "ELIMINAR" } con el JWT del usuario.
// Borra sus archivos del bucket y su usuario; el resto cae por ON DELETE CASCADE.
// =============================================================================
import { adminClient, BUCKET, userClient } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);

  const { data: auth } = await userClient(req.headers.get("Authorization") ?? "").auth.getUser();
  if (!auth?.user) return json({ error: "Iniciá sesión" }, 401, cors);
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "ELIMINAR") {
    return json({ error: 'Enviá {"confirm":"ELIMINAR"} para confirmar' }, 400, cors);
  }

  const admin = adminClient();
  const uid = auth.user.id;
  try {
    // 1) Archivos: se listan por carpeta (recursivo) y se borran en lotes.
    const paths: string[] = [];
    const walk = async (prefix: string) => {
      for (let offset = 0;; offset += 1000) {
        const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
        if (error) throw error;
        for (const item of data ?? []) {
          const full = `${prefix}/${item.name}`;
          if (item.id) paths.push(full);
          else await walk(full); // carpeta
        }
        if (!data || data.length < 1000) break;
      }
    };
    await walk(uid);
    for (let i = 0; i < paths.length; i += 500) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 500));
      if (error) throw error;
    }

    // 2) Usuario (cascada: perfil, cuentas, tokens, posts, métricas, logs…).
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw error;

    return json({ deleted: true, files: paths.length }, 200, cors);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "delete-account", error: String((e as Error)?.message ?? e) }));
    await admin.from("error_reports").insert({
      source: "edge",
      context: "delete-account",
      message: String((e as Error)?.message ?? e).slice(0, 1000),
    });
    return json({ error: "No se pudo eliminar la cuenta. Escribinos y lo hacemos a mano." }, 500, cors);
  }
});
