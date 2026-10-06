// =============================================================================
// Edge Function: health  (para monitoreo de uptime: UptimeRobot, Better Stack…)
// GET → 200 {status:"ok"} si la base responde y la cola de publicación avanza;
//       503 {status:"degraded"} si no. No expone datos de usuarios.
// Desplegar con verify_jwt = false.
// =============================================================================
import { adminClient } from "../_shared/admin.ts";
import { json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Método no permitido" }, 405);
  const started = Date.now();
  try {
    const { data, error } = await adminClient().rpc("health_snapshot");
    if (error) throw new Error(error.message);
    const s = data as { posts_due_backlog: number; posts_stuck: number; errors_last_hour: number };
    const degraded = s.posts_due_backlog > 0 || s.posts_stuck > 0;
    return json(
      {
        status: degraded ? "degraded" : "ok",
        db: "ok",
        queue: { backlog: s.posts_due_backlog, stuck: s.posts_stuck },
        errors_last_hour: s.errors_last_hour,
        latency_ms: Date.now() - started,
      },
      degraded ? 503 : 200,
      { "Cache-Control": "no-store" },
    );
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "health", error: String((e as Error)?.message ?? e) }));
    return json({ status: "down", db: "error" }, 503, { "Cache-Control": "no-store" });
  }
});
