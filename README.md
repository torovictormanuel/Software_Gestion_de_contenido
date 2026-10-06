# HIM Product Media

Plataforma para planificar, crear con IA, publicar y medir contenido en **Instagram, TikTok y YouTube**.

| Capa | Tecnología |
|---|---|
| Frontend | HTML + JS vanilla, Tailwind (CDN), Lucide, tema *dark & gold* (y tokens *Ivory & Gold* en `design/`) |
| Backend | Supabase: Postgres con RLS, Storage privado, Vault, Edge Functions (Deno), pg_cron + pg_net |
| IA | Anthropic Claude (captions, ganchos, hashtags) |

## Estructura

```
index.html, js/          App (panel, calendario, ideas, métricas, guiones IA, carruseles IA,
                         editor de video, competencia, conexiones, configuración)
legal/                   Privacidad, términos y cookies
design/                  Tokens CSS y Tailwind del tema claro Ivory & Gold
supabase/schema.sql      Esquema completo: tablas, ENUMs, índices, triggers, permisos, RLS, RPC, Storage
supabase/cron.sql        Publicador cada 2 min + limpieza diaria
supabase/functions/      publish-scheduled-posts · ai-generate · health · delete-account
supabase/tests/          50 pruebas de RLS y permisos (PGlite)
docs/BACKEND.md          Arquitectura, endpoints de integraciones y requisitos por plataforma
```

## Correr localmente

```bash
python -m http.server 5173 --bind 127.0.0.1
```

Abrí http://127.0.0.1:5173. Sin backend, los datos se guardan en el navegador.

## Backend

Pasos detallados en [docs/BACKEND.md](docs/BACKEND.md):

1. Ejecutar `supabase/schema.sql` y después `supabase/cron.sql` (reemplazando `<project-ref>`).
2. Desplegar las funciones (`publish-scheduled-posts` y `health` con `--no-verify-jwt`).
3. Cargar los secretos de `.env.example` con `supabase secrets set --env-file .env`.

Pruebas de seguridad:

```bash
npm i -D @electric-sql/pglite@0.3 && node supabase/tests/rls.test.mjs
```

## Seguridad

- RLS en todas las tablas y en Storage.
- Tokens OAuth cifrados con AES-256; la clave vive en Vault.
- Permisos por columna, rate limit en la IA y en la telemetría.
- Sin secretos en el repo: las claves van en los secretos de Supabase.
