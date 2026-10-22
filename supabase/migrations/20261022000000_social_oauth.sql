-- =============================================================================
-- Vincular redes sociales desde la app (OAuth): estado anti-CSRF + PKCE y
-- datos visibles del perfil conectado. Incluido también en schema.sql (9d).
-- =============================================================================

-- Datos públicos del perfil para mostrar en Conexiones (nunca tokens).
alter table public.social_accounts add column if not exists display_name text
  check (char_length(display_name) <= 150);
alter table public.social_accounts add column if not exists avatar_url text
  check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2000));
grant select (display_name, avatar_url) on public.social_accounts to authenticated;

create or replace view public.my_connections
with (security_invoker = true) as
  select id, 'social'::text as kind, platform::text as provider, account_handle as label,
         is_active, token_expires_at, last_error, created_at, display_name, avatar_url
    from public.social_accounts
  union all
  select id, 'creative', app_name::text, coalesce(external_account_id, app_name::text),
         is_active, token_expires_at, null, created_at, null, null
    from public.creative_app_connections;
revoke all on public.my_connections from anon;
grant select on public.my_connections to authenticated;

-- Crea el "state" de un flujo OAuth (un solo uso, 10 minutos) con el
-- code_verifier PKCE cifrado. Máx. 10 intentos cada 10 minutos por usuario.
create or replace function public.create_oauth_state(
  p_user_id uuid, p_provider text, p_code_verifier text, p_redirect_to text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_state text := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
begin
  if (select count(*) from public.oauth_states
       where user_id = p_user_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  delete from public.oauth_states where expires_at < now();
  insert into public.oauth_states (state, user_id, provider, code_verifier_encrypted, redirect_to)
  values (v_state, p_user_id, p_provider, private.encrypt_token(p_code_verifier), p_redirect_to);
  return v_state;
end $$;

-- Consume (borra) el state y devuelve sus datos si no venció.
create or replace function public.consume_oauth_state(p_state text)
returns table (user_id uuid, provider text, code_verifier text, redirect_to text)
language sql security definer set search_path = '' as $$
  with d as (
    delete from public.oauth_states s
     where s.state = p_state and s.expires_at > now()
    returning s.user_id, s.provider, s.code_verifier_encrypted, s.redirect_to
  )
  select d.user_id, d.provider, private.decrypt_token(d.code_verifier_encrypted), d.redirect_to from d;
$$;

revoke all on function public.create_oauth_state(uuid, text, text, text),
                       public.consume_oauth_state(text)
  from public, anon, authenticated;
grant execute on function public.create_oauth_state(uuid, text, text, text),
                          public.consume_oauth_state(text)
  to service_role;
