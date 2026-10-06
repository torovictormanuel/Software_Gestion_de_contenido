# HIM Product Media · Backend (Supabase)

## Archivos

| Archivo | Qué es |
|---|---|
| `design/tokens-ivory.css` | Tokens CSS del tema claro *Ivory & Gold* (mismos nombres que el tema oscuro actual) |
| `design/tailwind.config.js` | Tailwind apuntando a esas variables |
| `supabase/schema.sql` | Extensiones, ENUMs, tablas, índices, triggers, permisos por columna, RLS, RPC y Storage |
| `supabase/cron.sql` | pg_cron + pg_net: publicador cada 2 min y limpieza diaria |
| `supabase/functions/publish-scheduled-posts/` | Edge Function que publica en Instagram, TikTok y YouTube |
| `supabase/functions/ai-generate/` | Edge Function de captions, hooks y hashtags con Claude |
| `supabase/functions/_shared/` | Cliente admin, tokens, HTTP y un módulo por red |
| `.env.example` | Variables de entorno (plantilla sin valores) |

## Puesta en marcha

1. **SQL**: Dashboard › SQL Editor → pegar y ejecutar `supabase/schema.sql`.
2. **Funciones**:
   ```bash
   supabase link --project-ref <project-ref>
   supabase secrets set --env-file .env
   supabase functions deploy publish-scheduled-posts --no-verify-jwt
   supabase functions deploy ai-generate
   ```
3. **Cron**: cargar `project_url` y `cron_secret` en Vault (instrucciones dentro de `cron.sql`), después ejecutar `supabase/cron.sql`.
4. **Storage**: en plan Free el máximo por archivo es 50 MB; para videos largos subirlo en Storage › Settings (Pro).

## Modelo de seguridad

- **RLS en las 10 tablas.** Cada política compara `(select auth.uid())` con `user_id`.
  `oauth_states` y `webhook_events` tienen RLS sin políticas: solo `service_role`.
- **Permisos por columna.** El navegador no puede leer `*_encrypted` ni escribir `status = published`,
  `external_post_id`, `attempts`, `publish_state`, el `role` del perfil, etc.
- **Tokens cifrados** con `pgp_sym_encrypt` (AES-256). La clave se genera dentro de la base y vive en
  Supabase Vault (`token_encryption_key`). Solo las RPC `get_*_tokens` la usan, y solo `service_role` puede ejecutarlas.
- **Altas de cuentas solo vía OAuth en el servidor** (`upsert_social_account` / `upsert_creative_connection`).
- **Storage privado.** Rutas `<user_id>/...`. Instagram y TikTok reciben URLs firmadas temporales. El publicador
  revalida que cada archivo sea del dueño del post.
- **Sin duplicados.** Si la función muere después de la llamada final a Instagram, el post pasa a `failed` con
  "verificá antes de reintentar" en vez de republicarse solo.

## Ciclo de un post

```
draft ──(usuario programa)──► scheduled ──(cron: claim_due_posts, SKIP LOCKED)──► publishing
   ▲                              ▲  │                                              │
   │                              │  └── deferred (la red procesa el video, +1 min) ◄┤
   └──(usuario reprograma)── failed ◄── retry ×3 con backoff 2/4/8 min ◄────────────┤
                                                                                     ▼
                                                                                 published
```

`publish_state` (jsonb, solo servidor) guarda ids de contenedor de Instagram, `publish_id` y la parte subida de TikTok,
y la sesión reanudable de YouTube. Así un video largo se sube a lo largo de varias ejecuciones.

## Integraciones creativas: endpoints

Todas usan el mismo patrón de OAuth:

| Endpoint (Edge Function) | Auth | Qué hace |
|---|---|---|
| `POST /oauth-start/:provider` | JWT usuario | Crea `oauth_states` (state + PKCE `code_verifier` cifrado, 10 min) y devuelve la URL de autorización |
| `GET /oauth-callback/:provider` | `state` | Valida y consume el state, canjea el `code` por tokens y llama `upsert_social_account` o `upsert_creative_connection` |
| `POST /connections/:id/disconnect` | JWT usuario | Revoca en el proveedor y borra la fila |

| Herramienta | Mecanismo | Endpoint propio | Destino |
|---|---|---|---|
| **Canva Connect API** | OAuth 2 + PKCE. `GET /v1/designs` y luego export asíncrono (`POST /v1/exports`, polling `GET /v1/exports/{id}`) | `POST /canva-sync` (JWT o cron cada 15 min) | Descarga el PNG/MP4 a `<uid>/canva/…`, crea `media_assets` (`source = canva`, `external_id = design_id`) y un `posts` en draft con `source_app = canva`. Los índices únicos evitan duplicados. |
| **Figma REST + Webhooks v2** | OAuth. `GET /v1/images/:file_key?ids=…&format=png&scale=2`. Webhook `FILE_UPDATE` con `passcode` | `POST /figma-webhook` (público; valida `passcode` contra `webhook_secret_encrypted`) + `POST /figma-export` (JWT) | Exporta frames a `<uid>/figma/…` y los registra en `media_assets`. `webhook_events` deduplica por `event_id`. |
| **Opus Clip / Descript / CapCut** | Webhook entrante firmado con HMAC-SHA256 (`X-HIM-Signature: t=…,v1=…`, ventana de 5 min). CapCut no tiene API pública: se conecta vía Zapier/Make o exportando a una carpeta | `POST /video-ingest/:connection_id` | Descarga el video a `<uid>/clips/…`, crea `media_assets` y un `posts` draft (`post_type` reel o short según el 9:16 y la duración) |
| **Adobe Express Embed SDK** | 100 % en el navegador con un client ID público restringido por dominio. No guarda tokens | — (el front sube el resultado a Storage) | Quitar fondo y recortes 4:5 o 9:16: se sube a `<uid>/adobe/…` y se inserta en `media_assets` (`source = adobe`) |
| **Anthropic Claude** | API key solo en secretos de la función, con rate limit por usuario (`ai_quota_ok`) | `POST /ai-generate` (implementada) | Devuelve `{caption, hooks[], hashtags[]}` y registra el uso en `ai_generations` |

> Implementadas en este entregable: `publish-scheduled-posts` y `ai-generate`. Las demás están especificadas
> (tablas, RPC y contratos listos) para la siguiente iteración.

## Requisitos de cada plataforma (fuera del código)

- **Instagram**: cuenta Business o Creator, app de Meta con `instagram_business_basic` e
  `instagram_business_content_publish` y App Review aprobado. Límite: 100 publicaciones por API cada 24 h.
- **TikTok**: Content Posting API con Direct Post. Hasta la auditoría solo publica en privado (`SELF_ONLY`).
  Sus guías exigen mostrar en la UI el nombre de la cuenta y las opciones de privacidad (`creator_info/query`)
  antes de programar. Las fotos requieren `PULL_FROM_URL` con dominio verificado (no incluido).
- **YouTube**: OAuth con el scope `youtube.upload`. Los proyectos sin verificar suben los videos como privados.
  Cuota por defecto: 10 000 unidades por día, y cada subida cuesta unas 1 600.
- **Límite de las Edge Functions**: unos 150 s en Free y 400 s en planes pagos. Por eso el publicador responde 202,
  trabaja en segundo plano con un presupuesto de 110 s y continúa la subida en la siguiente ejecución.

## Variables de entorno

Ver `.env.example`. Solo las `VITE_*` pueden llegar al navegador.
