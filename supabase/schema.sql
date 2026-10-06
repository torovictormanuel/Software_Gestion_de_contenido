-- =============================================================================
-- HIM Product Media · Backend Supabase · schema.sql
-- Ejecutar completo en: Supabase Dashboard › SQL Editor (o `supabase db push`).
-- Es idempotente: se puede volver a correr sin romper datos existentes.
--
-- Principios:
--   * RLS activado en TODAS las tablas. Cada usuario solo ve/toca lo suyo.
--   * Los tokens OAuth se guardan cifrados (pgcrypto, AES-256) con una clave
--     que vive en Supabase Vault. El cliente (anon/authenticated) NO puede
--     leer las columnas *_encrypted ni ejecutar las funciones de descifrado.
--   * Las columnas que solo debe escribir el servidor (estado de publicación,
--     ids externos, errores) se protegen con permisos por columna + triggers.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Extensiones y esquemas
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists supabase_vault;   -- viene activa en Supabase

-- Esquema privado: no está expuesto por la Data API (PostgREST).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Clave de cifrado de tokens: se genera DENTRO de la base y nunca sale de ella.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'token_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'token_encryption_key',
      'Clave AES-256 para tokens OAuth (social_accounts / creative_app_connections)'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. ENUMs
-- -----------------------------------------------------------------------------
do $$ begin create type public.social_platform as enum ('instagram', 'tiktok', 'youtube');
exception when duplicate_object then null; end $$;

do $$ begin create type public.creative_app as enum
  ('canva', 'figma', 'adobe', 'anthropic', 'openai', 'capcut', 'opus_clip', 'descript');
exception when duplicate_object then null; end $$;

do $$ begin create type public.post_status as enum
  ('draft', 'scheduled', 'publishing', 'published', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin create type public.post_type as enum
  ('image', 'carousel', 'reel', 'story', 'short', 'video');
exception when duplicate_object then null; end $$;

do $$ begin create type public.user_role as enum ('owner', 'admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin create type public.asset_source as enum
  ('upload', 'canva', 'figma', 'adobe', 'capcut', 'opus_clip', 'descript', 'ai');
exception when duplicate_object then null; end $$;

do $$ begin create type public.log_status as enum ('success', 'deferred', 'retry', 'failed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. Funciones utilitarias (privadas)
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.token_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'token_encryption_key' limit 1;
$$;

create or replace function private.encrypt_token(p_plain text)
returns bytea language plpgsql security definer set search_path = '' as $$
declare k text := private.token_key();
begin
  if p_plain is null or p_plain = '' then return null; end if;
  if k is null then raise exception 'Falta token_encryption_key en Vault'; end if;
  return extensions.pgp_sym_encrypt(p_plain, k, 'cipher-algo=aes256, compress-algo=0');
end $$;

create or replace function private.decrypt_token(p_cipher bytea)
returns text language plpgsql security definer set search_path = '' as $$
declare k text := private.token_key();
begin
  if p_cipher is null then return null; end if;
  return extensions.pgp_sym_decrypt(p_cipher, k);
end $$;

-- -----------------------------------------------------------------------------
-- 3. Tablas
-- -----------------------------------------------------------------------------

-- 3.1 profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  avatar_url  text check (avatar_url is null or avatar_url ~ '^https://'),
  role        public.user_role not null default 'owner',
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.2 social_accounts --------------------------------------------------------
create table if not exists public.social_accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform                 public.social_platform not null,
  account_handle           text not null check (char_length(account_handle) between 1 and 100),
  external_account_id      text check (char_length(external_account_id) <= 128),  -- IG user id / TikTok open_id / YT channel id
  scopes                   text[] not null default '{}',
  access_token_encrypted   bytea,
  refresh_token_encrypted  bytea,
  token_expires_at         timestamptz,
  is_active                boolean not null default true,
  last_error               text check (char_length(last_error) <= 1000),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint social_accounts_id_user_key unique (id, user_id),
  constraint social_accounts_external_key unique (user_id, platform, external_account_id)
);

-- 3.3 creative_app_connections -----------------------------------------------
create table if not exists public.creative_app_connections (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_name                  public.creative_app not null,
  external_account_id       text check (char_length(external_account_id) <= 128),
  scopes                    text[] not null default '{}',
  access_token_encrypted    bytea,
  refresh_token_encrypted   bytea,
  token_expires_at          timestamptz,
  webhook_secret_encrypted  bytea,              -- secreto HMAC / passcode de webhooks entrantes
  settings                  jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_active                 boolean not null default true,
  last_sync_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint creative_app_connections_user_app_key unique (user_id, app_name)
);

-- 3.4 posts ------------------------------------------------------------------
-- media_urls: array de objetos {"path": "<user_id>/...", "type": "image|video", "mime": "..."}
--   "path" es la ruta dentro del bucket privado social-media-assets (no una URL pública).
create table if not exists public.posts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  social_account_id  uuid,
  title              text check (char_length(title) <= 200),
  caption            text check (char_length(caption) <= 5000),
  media_urls         jsonb not null default '[]'::jsonb check (jsonb_typeof(media_urls) = 'array'),
  platform           public.social_platform not null,
  post_type          public.post_type not null default 'image',
  status             public.post_status not null default 'draft',
  scheduled_at       timestamptz,
  published_at       timestamptz,
  external_post_id   text,
  external_url       text,
  error_message      text check (char_length(error_message) <= 2000),
  -- Control interno del publicador (solo servidor):
  attempts           smallint not null default 0,
  next_attempt_at    timestamptz,
  locked_at          timestamptz,
  publish_state      jsonb not null default '{}'::jsonb,
  source_app         public.creative_app,          -- de dónde vino (canva, figma, opus_clip…)
  source_external_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- La cuenta debe pertenecer al MISMO usuario (FK compuesta).
  constraint posts_account_owner_fk foreign key (social_account_id, user_id)
    references public.social_accounts (id, user_id) on delete set null (social_account_id),
  constraint posts_scheduled_ck check (
    status not in ('scheduled', 'publishing') or (scheduled_at is not null and social_account_id is not null)),
  constraint posts_published_ck check (status <> 'published' or published_at is not null),
  constraint posts_media_max_ck check (jsonb_array_length(media_urls) <= 20)
);

-- 3.5 post_analytics (una fila por lectura → historial) ----------------------
create table if not exists public.post_analytics (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.posts (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,  -- lo completa un trigger
  impressions         bigint not null default 0 check (impressions >= 0),
  reach               bigint not null default 0 check (reach >= 0),
  likes               bigint not null default 0 check (likes >= 0),
  comments            bigint not null default 0 check (comments >= 0),
  shares              bigint not null default 0 check (shares >= 0),
  saves               bigint not null default 0 check (saves >= 0),
  video_views         bigint not null default 0 check (video_views >= 0),
  watch_time_seconds  bigint not null default 0 check (watch_time_seconds >= 0),
  engagement_rate     numeric(9, 4) generated always as (
    case when reach > 0
      then round(((likes + comments + shares + saves)::numeric * 100) / reach, 4)
      else 0 end) stored,                                    -- en %
  fetched_at          timestamptz not null default now()
);

-- 3.6 publishing_logs --------------------------------------------------------
create table if not exists public.publishing_logs (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,     -- lo completa un trigger
  status            public.log_status not null,
  attempt           smallint not null default 0,
  response_payload  jsonb not null default '{}'::jsonb,       -- saneado: nunca tokens
  executed_at       timestamptz not null default now()
);

-- 3.7 media_assets (biblioteca: subidas, exportaciones de Canva/Figma, Adobe, videos) --
create table if not exists public.media_assets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source            public.asset_source not null default 'upload',
  external_id       text check (char_length(external_id) <= 256),   -- design id de Canva, node id de Figma…
  storage_path      text not null check (char_length(storage_path) <= 512 and storage_path !~ '\.\.'),
  mime_type         text check (char_length(mime_type) <= 100),
  width             integer check (width > 0),
  height            integer check (height > 0),
  duration_seconds  numeric(10, 3) check (duration_seconds >= 0),
  title             text check (char_length(title) <= 200),
  metadata          jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at        timestamptz not null default now(),
  constraint media_assets_path_owner_ck check (split_part(storage_path, '/', 1) = user_id::text)
);
create unique index if not exists media_assets_external_uq
  on public.media_assets (user_id, source, external_id) where external_id is not null;

-- 3.8 oauth_states (PKCE / anti-CSRF del flujo OAuth; solo servidor) ---------
create table if not exists public.oauth_states (
  state                    text primary key check (char_length(state) between 32 and 128),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  provider                 text not null check (provider in
                             ('instagram','tiktok','youtube','canva','figma','adobe','opus_clip','descript')),
  code_verifier_encrypted  bytea,
  redirect_to              text check (char_length(redirect_to) <= 512),
  expires_at               timestamptz not null default now() + interval '10 minutes',
  created_at               timestamptz not null default now()
);

-- 3.9 webhook_events (idempotencia de webhooks entrantes; solo servidor) -----
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      public.creative_app not null,
  event_id      text not null check (char_length(event_id) <= 256),
  user_id       uuid references auth.users (id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  constraint webhook_events_provider_event_key unique (provider, event_id)
);

-- 3.10 ai_generations (uso de Claude: auditoría + rate limit) ----------------
create table if not exists public.ai_generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('caption', 'hooks', 'hashtags', 'all')),
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  post_id        uuid references public.posts (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Índices
-- -----------------------------------------------------------------------------
create index if not exists social_accounts_user_idx      on public.social_accounts (user_id);
create index if not exists creative_conn_user_idx        on public.creative_app_connections (user_id);
create index if not exists posts_user_sched_idx          on public.posts (user_id, scheduled_at desc);
create index if not exists posts_user_status_idx         on public.posts (user_id, status);
drop index if exists public.posts_account_idx;
create index if not exists posts_account_owner_idx       on public.posts (social_account_id, user_id);  -- cubre la FK compuesta
create index if not exists posts_due_idx                 on public.posts ((coalesce(next_attempt_at, scheduled_at)))
  where status = 'scheduled';
create index if not exists posts_publishing_idx          on public.posts (locked_at) where status = 'publishing';
create unique index if not exists posts_source_uq        on public.posts (user_id, source_app, source_external_id)
  where source_external_id is not null;
create index if not exists post_analytics_post_idx       on public.post_analytics (post_id, fetched_at desc);
create index if not exists post_analytics_user_idx       on public.post_analytics (user_id, fetched_at desc);
create index if not exists publishing_logs_post_idx      on public.publishing_logs (post_id, executed_at desc);
create index if not exists publishing_logs_user_idx      on public.publishing_logs (user_id, executed_at desc);
create index if not exists media_assets_user_idx         on public.media_assets (user_id, created_at desc);
create index if not exists oauth_states_expires_idx      on public.oauth_states (expires_at);
create index if not exists oauth_states_user_idx         on public.oauth_states (user_id);
create index if not exists webhook_events_received_idx   on public.webhook_events (received_at);
create index if not exists webhook_events_user_idx       on public.webhook_events (user_id);
create index if not exists ai_generations_user_idx       on public.ai_generations (user_id, created_at desc);
create index if not exists ai_generations_post_idx       on public.ai_generations (post_id);

-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------

-- 5.1 updated_at
do $$
declare t text;
begin
  foreach t in array array['profiles', 'social_accounts', 'creative_app_connections', 'posts'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- 5.2 Perfil automático al registrarse
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    case when v_avatar ~ '^https://' then left(v_avatar, 1000) end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 5.3 Validación de zona horaria
create or replace function private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria inválida: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before insert or update of timezone on public.profiles
  for each row execute function private.profiles_guard();

-- 5.4 Reglas de negocio de posts para el usuario final
create or replace function private.posts_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_item     jsonb;
  v_path     text;
  v_platform public.social_platform;
begin
  -- Todas las rutas de media deben estar dentro de la carpeta del dueño.
  for v_item in select * from jsonb_array_elements(new.media_urls) loop
    v_path := v_item ->> 'path';
    if jsonb_typeof(v_item) <> 'object' or v_path is null
       or split_part(v_path, '/', 1) <> new.user_id::text
       or v_path ~ '\.\.' or char_length(v_path) > 512 then
      raise exception 'media_urls: cada elemento necesita "path" dentro de la carpeta del usuario'
        using errcode = '22023';
    end if;
  end loop;

  -- La plataforma del post debe coincidir con la de la cuenta.
  if new.social_account_id is not null then
    select platform into v_platform from public.social_accounts where id = new.social_account_id;
    if v_platform is distinct from new.platform then
      raise exception 'La cuenta conectada no es de %', new.platform using errcode = '22023';
    end if;
  end if;

  -- Servidor (service_role, postgres, pg_cron): sin más restricciones.
  -- Usuario final vía Data API: current_user es authenticated/anon.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('publishing', 'published') then
    raise exception 'No se puede editar un post en estado %', old.status using errcode = '42501';
  end if;

  if new.status not in ('draft', 'scheduled') then
    raise exception 'Solo podés guardar como draft o scheduled' using errcode = '42501';
  end if;

  if new.status = 'scheduled'
     and (tg_op = 'INSERT' or old.status is distinct from 'scheduled' or old.scheduled_at is distinct from new.scheduled_at)
     and new.scheduled_at < now() - interval '5 minutes' then
    raise exception 'scheduled_at no puede estar en el pasado' using errcode = '22023';
  end if;

  -- (Re)programar desde draft/failed limpia el estado interno del publicador.
  if tg_op = 'INSERT' or old.status is distinct from new.status
     or old.scheduled_at is distinct from new.scheduled_at then
    new.attempts        := 0;
    new.next_attempt_at := null;
    new.locked_at       := null;
    new.publish_state   := '{}'::jsonb;
    new.error_message   := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_posts_guard on public.posts;
create trigger trg_posts_guard before insert or update on public.posts
  for each row execute function private.posts_guard();

-- 5.5 Desconectar una cuenta pasa sus posts programados a borrador
create or replace function private.social_account_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.posts where social_account_id = old.id and status = 'publishing') then
    raise exception 'Hay publicaciones en curso en esta cuenta; probá en unos minutos'
      using errcode = '55006';
  end if;
  update public.posts
     set status = 'draft', error_message = 'La cuenta se desconectó: volvé a programar.'
   where social_account_id = old.id and status = 'scheduled';
  return old;
end $$;

drop trigger if exists trg_social_accounts_before_delete on public.social_accounts;
create trigger trg_social_accounts_before_delete before delete on public.social_accounts
  for each row execute function private.social_account_before_delete();

-- 5.6 user_id derivado del post (analytics y logs)
create or replace function private.fill_user_from_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.user_id into new.user_id from public.posts p where p.id = new.post_id;
  if new.user_id is null then
    raise exception 'post % no existe', new.post_id using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists trg_post_analytics_user on public.post_analytics;
create trigger trg_post_analytics_user before insert on public.post_analytics
  for each row execute function private.fill_user_from_post();

drop trigger if exists trg_publishing_logs_user on public.publishing_logs;
create trigger trg_publishing_logs_user before insert on public.publishing_logs
  for each row execute function private.fill_user_from_post();

-- Las funciones privadas no se pueden invocar desde el cliente.
revoke all on all functions in schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Permisos (por tabla y por columna)
--    RLS decide QUÉ FILAS; los GRANT deciden QUÉ COLUMNAS y QUÉ OPERACIONES.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.social_accounts, public.creative_app_connections,
              public.posts, public.post_analytics, public.publishing_logs, public.media_assets,
              public.oauth_states, public.webhook_events, public.ai_generations
  from anon, authenticated;

grant all on public.profiles, public.social_accounts, public.creative_app_connections,
             public.posts, public.post_analytics, public.publishing_logs, public.media_assets,
             public.oauth_states, public.webhook_events, public.ai_generations
  to service_role;

-- profiles: el rol NO lo cambia el usuario.
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, timezone) on public.profiles to authenticated;

-- social_accounts: alta solo vía OAuth (servidor). Tokens nunca legibles.
grant select (id, user_id, platform, account_handle, external_account_id, scopes,
              token_expires_at, is_active, last_error, created_at, updated_at)
  on public.social_accounts to authenticated;
grant update (account_handle, is_active) on public.social_accounts to authenticated;
grant delete on public.social_accounts to authenticated;

-- creative_app_connections: igual criterio.
grant select (id, user_id, app_name, external_account_id, scopes, token_expires_at,
              settings, is_active, last_sync_at, created_at, updated_at)
  on public.creative_app_connections to authenticated;
grant update (settings, is_active) on public.creative_app_connections to authenticated;
grant delete on public.creative_app_connections to authenticated;

-- posts: el usuario edita contenido y programación; el resto es del publicador.
grant select on public.posts to authenticated;
grant insert (title, caption, media_urls, platform, post_type, status, scheduled_at, social_account_id)
  on public.posts to authenticated;
grant update (title, caption, media_urls, platform, post_type, status, scheduled_at, social_account_id)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;

-- Solo lectura para el cliente.
grant select on public.post_analytics, public.publishing_logs, public.ai_generations to authenticated;

-- media_assets: el cliente registra lo que sube (o retoca con Adobe Express).
grant select, delete on public.media_assets to authenticated;
grant insert (source, external_id, storage_path, mime_type, width, height, duration_seconds, title, metadata)
  on public.media_assets to authenticated;
grant update (title, metadata) on public.media_assets to authenticated;

-- oauth_states / webhook_events: sin acceso del cliente (solo service_role).

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.social_accounts          enable row level security;
alter table public.creative_app_connections enable row level security;
alter table public.posts                    enable row level security;
alter table public.post_analytics           enable row level security;
alter table public.publishing_logs          enable row level security;
alter table public.media_assets             enable row level security;
alter table public.oauth_states             enable row level security;
alter table public.webhook_events           enable row level security;
alter table public.ai_generations           enable row level security;

-- Nota: (select auth.uid()) se evalúa una vez por consulta (mejor rendimiento).

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Tablas con user_id y CRUD del dueño (las columnas permitidas las limitan los GRANT).
do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'creative_app_connections', 'media_assets'] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$I', t);
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists %1$s_insert_own on public.%1$I', t);
    execute format('create policy %1$s_insert_own on public.%1$I for insert to authenticated
                    with check ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists %1$s_update_own on public.%1$I', t);
    execute format('create policy %1$s_update_own on public.%1$I for update to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists %1$s_delete_own on public.%1$I', t);
    execute format('create policy %1$s_delete_own on public.%1$I for delete to authenticated
                    using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- posts
drop policy if exists posts_select_own on public.posts;
create policy posts_select_own on public.posts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts for delete to authenticated
  using ((select auth.uid()) = user_id and status <> 'publishing');

-- Solo lectura del dueño
do $$
declare t text;
begin
  foreach t in array array['post_analytics', 'publishing_logs', 'ai_generations'] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$I', t);
    execute format('create policy %1$s_select_own on public.%1$I for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- oauth_states y webhook_events: RLS activo y SIN políticas → nadie salvo service_role.

-- -----------------------------------------------------------------------------
-- 8. Vistas de conveniencia (respetan RLS del que consulta)
-- -----------------------------------------------------------------------------
create or replace view public.my_connections
with (security_invoker = true) as
  select id, 'social'::text as kind, platform::text as provider, account_handle as label,
         is_active, token_expires_at, last_error, created_at
    from public.social_accounts
  union all
  select id, 'creative', app_name::text, coalesce(external_account_id, app_name::text),
         is_active, token_expires_at, null, created_at
    from public.creative_app_connections;

create or replace view public.post_analytics_latest
with (security_invoker = true) as
  select distinct on (post_id) *
    from public.post_analytics
   order by post_id, fetched_at desc;

revoke all on public.my_connections, public.post_analytics_latest from anon;
grant select on public.my_connections, public.post_analytics_latest to authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPC de servidor (solo service_role): tokens cifrados y cola de publicación
-- -----------------------------------------------------------------------------

-- Alta / actualización de una cuenta social tras el callback OAuth.
create or replace function public.upsert_social_account(
  p_user_id uuid, p_platform public.social_platform, p_handle text, p_external_id text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_scopes text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.social_accounts as s
    (user_id, platform, account_handle, external_account_id, scopes,
     access_token_encrypted, refresh_token_encrypted, token_expires_at, is_active, last_error)
  values
    (p_user_id, p_platform, left(p_handle, 100), p_external_id, coalesce(p_scopes, '{}'),
     private.encrypt_token(p_access_token), private.encrypt_token(p_refresh_token), p_expires_at, true, null)
  on conflict (user_id, platform, external_account_id) do update set
    account_handle          = excluded.account_handle,
    scopes                  = excluded.scopes,
    access_token_encrypted  = excluded.access_token_encrypted,
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, s.refresh_token_encrypted),
    token_expires_at        = excluded.token_expires_at,
    is_active               = true,
    last_error              = null
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_social_account_tokens(p_account_id uuid)
returns table (access_token text, refresh_token text, token_expires_at timestamptz,
               external_account_id text, platform public.social_platform, is_active boolean)
language sql security definer set search_path = '' as $$
  select private.decrypt_token(s.access_token_encrypted),
         private.decrypt_token(s.refresh_token_encrypted),
         s.token_expires_at, s.external_account_id, s.platform, s.is_active
    from public.social_accounts s
   where s.id = p_account_id;
$$;

create or replace function public.update_social_account_tokens(
  p_account_id uuid, p_access_token text, p_refresh_token text, p_expires_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.social_accounts set
    access_token_encrypted  = private.encrypt_token(p_access_token),
    refresh_token_encrypted = coalesce(private.encrypt_token(p_refresh_token), refresh_token_encrypted),
    token_expires_at        = p_expires_at,
    last_error              = null
  where id = p_account_id;
$$;

-- Equivalentes para Canva / Figma / Adobe / Opus Clip / Descript…
create or replace function public.upsert_creative_connection(
  p_user_id uuid, p_app public.creative_app, p_external_id text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz,
  p_scopes text[] default '{}', p_webhook_secret text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.creative_app_connections as c
    (user_id, app_name, external_account_id, scopes, access_token_encrypted,
     refresh_token_encrypted, token_expires_at, webhook_secret_encrypted, is_active)
  values
    (p_user_id, p_app, p_external_id, coalesce(p_scopes, '{}'), private.encrypt_token(p_access_token),
     private.encrypt_token(p_refresh_token), p_expires_at, private.encrypt_token(p_webhook_secret), true)
  on conflict (user_id, app_name) do update set
    external_account_id      = excluded.external_account_id,
    scopes                   = excluded.scopes,
    access_token_encrypted   = excluded.access_token_encrypted,
    refresh_token_encrypted  = coalesce(excluded.refresh_token_encrypted, c.refresh_token_encrypted),
    token_expires_at         = excluded.token_expires_at,
    webhook_secret_encrypted = coalesce(excluded.webhook_secret_encrypted, c.webhook_secret_encrypted),
    is_active                = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_creative_connection_tokens(p_user_id uuid, p_app public.creative_app)
returns table (connection_id uuid, access_token text, refresh_token text,
               token_expires_at timestamptz, webhook_secret text, is_active boolean)
language sql security definer set search_path = '' as $$
  select c.id, private.decrypt_token(c.access_token_encrypted),
         private.decrypt_token(c.refresh_token_encrypted), c.token_expires_at,
         private.decrypt_token(c.webhook_secret_encrypted), c.is_active
    from public.creative_app_connections c
   where c.user_id = p_user_id and c.app_name = p_app;
$$;

-- Toma (con bloqueo) los posts vencidos para publicar. Seguro ante ejecuciones
-- simultáneas del cron gracias a FOR UPDATE SKIP LOCKED.
create or replace function public.claim_due_posts(p_limit integer default 5)
returns setof public.posts language plpgsql security definer set search_path = '' as $$
begin
  -- Rescate de posts colgados (la función murió a mitad de camino).
  -- Si llegó a la llamada final de publicación NO se reintenta (evita duplicados).
  update public.posts p set
    status        = case when p.publish_state ? 'final_call_at'
                         then 'failed'::public.post_status else 'scheduled'::public.post_status end,
    error_message = case when p.publish_state ? 'final_call_at'
                         then 'Interrumpido en el paso final: verificá en la red antes de reintentar.'
                         else p.error_message end,
    locked_at     = null
  where p.status = 'publishing' and p.locked_at < now() - interval '15 minutes';

  return query
  with due as (
    select p.id
      from public.posts p
     where p.status = 'scheduled'
       and coalesce(p.next_attempt_at, p.scheduled_at) <= now()
     order by coalesce(p.next_attempt_at, p.scheduled_at)
     limit least(greatest(coalesce(p_limit, 5), 1), 25)
     for update skip locked
  )
  update public.posts p
     set status = 'publishing', locked_at = now()
    from due
   where p.id = due.id
  returning p.*;
end $$;

-- Rate limit de IA: devuelve true si el usuario puede generar.
create or replace function public.ai_quota_ok(p_user_id uuid, p_per_hour integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < p_per_hour
    from public.ai_generations
   where user_id = p_user_id and created_at > now() - interval '1 hour';
$$;

-- Ninguna RPC de servidor es ejecutable desde el navegador.
revoke all on function
  public.upsert_social_account(uuid, public.social_platform, text, text, text, text, timestamptz, text[]),
  public.get_social_account_tokens(uuid),
  public.update_social_account_tokens(uuid, text, text, timestamptz),
  public.upsert_creative_connection(uuid, public.creative_app, text, text, text, timestamptz, text[], text),
  public.get_creative_connection_tokens(uuid, public.creative_app),
  public.claim_due_posts(integer),
  public.ai_quota_ok(uuid, integer)
  from public, anon, authenticated;

grant execute on function
  public.upsert_social_account(uuid, public.social_platform, text, text, text, text, timestamptz, text[]),
  public.get_social_account_tokens(uuid),
  public.update_social_account_tokens(uuid, text, text, timestamptz),
  public.upsert_creative_connection(uuid, public.creative_app, text, text, text, timestamptz, text[], text),
  public.get_creative_connection_tokens(uuid, public.creative_app),
  public.claim_due_posts(integer),
  public.ai_quota_ok(uuid, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 9b. Secreto del cron (vive solo en Vault; la función lo valida acá adentro)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret',
                                'Header x-cron-secret que pg_cron envía al publicador');
  end if;
end $$;

create or replace function public.verify_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_secret) >= 32 and p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1), false);
$$;
revoke all on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

-- -----------------------------------------------------------------------------
-- 9c. Monitoreo de errores y analytics propios (sin terceros, sin cookies)
-- -----------------------------------------------------------------------------
create table if not exists public.error_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  source      text not null check (source in ('client', 'edge', 'db')),
  context     text check (char_length(context) <= 100),       -- función / sección de la app
  message     text not null check (char_length(message) <= 1000),
  stack       text check (char_length(stack) <= 4000),
  url         text check (char_length(url) <= 500),
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists error_reports_created_idx on public.error_reports (created_at desc);
create index if not exists error_reports_user_idx    on public.error_reports (user_id);

create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null check (name ~ '^[a-z][a-z0-9_]{1,49}$'),
  props       jsonb not null default '{}'::jsonb
                check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048),
  path        text check (char_length(path) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_user_idx    on public.app_events (user_id, created_at desc);
create index if not exists app_events_name_idx    on public.app_events (name, created_at desc);

alter table public.error_reports enable row level security;
alter table public.app_events    enable row level security;
revoke all on public.error_reports, public.app_events from anon, authenticated;
grant all on public.error_reports, public.app_events to service_role;
-- Sin políticas: el cliente solo escribe a través de las RPC con límite de uso.

create or replace function public.report_client_error(
  p_message text, p_stack text default null, p_url text default null,
  p_user_agent text default null, p_context text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  -- máx. 30 reportes por hora por usuario (evita inundar la tabla)
  if (select count(*) from public.error_reports
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.error_reports (user_id, source, context, message, stack, url, user_agent)
  values (v_uid, 'client', left(p_context, 100), left(coalesce(p_message, '(sin mensaje)'), 1000),
          left(p_stack, 4000), left(p_url, 500), left(p_user_agent, 300));
end $$;

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb, p_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  -- máx. 120 eventos por minuto por usuario
  if (select count(*) from public.app_events
       where user_id = v_uid and created_at > now() - interval '1 minute') >= 120 then
    return;
  end if;
  insert into public.app_events (user_id, name, props, path)
  values (v_uid, p_name, coalesce(p_props, '{}'::jsonb), left(p_path, 200));
end $$;

-- Advisor 0029 (security definer ejecutable por authenticated): intencional.
-- Son RPC de solo escritura con límite de uso; el usuario no puede leer ni
-- insertar directo en las tablas, así que no hay forma de saltear el límite.
revoke all on function public.report_client_error(text, text, text, text, text),
                       public.track_event(text, jsonb, text)
  from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text),
                          public.track_event(text, jsonb, text)
  to authenticated, service_role;

-- Resumen de salud para el endpoint /health y para revisar a mano.
create or replace function public.health_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'db', true,
    'posts_due_backlog', (select count(*) from public.posts
                           where status = 'scheduled' and coalesce(next_attempt_at, scheduled_at) < now() - interval '10 minutes'),
    'posts_stuck', (select count(*) from public.posts
                     where status = 'publishing' and locked_at < now() - interval '15 minutes'),
    'errors_last_hour', (select count(*) from public.error_reports where created_at > now() - interval '1 hour'),
    'last_publish_log', (select max(executed_at) from public.publishing_logs)
  );
$$;
revoke all on function public.health_snapshot() from public, anon, authenticated;
grant execute on function public.health_snapshot() to service_role;

-- -----------------------------------------------------------------------------
-- 10. Storage: bucket privado social-media-assets
--     Estructura de rutas: <user_id>/<carpeta>/<archivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media-assets', 'social-media-assets', false,
  52428800,   -- 50 MB = máximo del plan Free. En Pro: subir a 524288000 (500 MB) acá y en Storage › Settings
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime', 'video/webm',
        'audio/mpeg', 'audio/mp4', 'audio/wav']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sma_select_own on storage.objects;
create policy sma_select_own on storage.objects for select to authenticated
  using (bucket_id = 'social-media-assets'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists sma_insert_own on storage.objects;
create policy sma_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media-assets'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists sma_update_own on storage.objects;
create policy sma_update_own on storage.objects for update to authenticated
  using (bucket_id = 'social-media-assets'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'social-media-assets'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists sma_delete_own on storage.objects;
create policy sma_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'social-media-assets'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
