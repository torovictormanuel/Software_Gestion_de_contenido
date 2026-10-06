// Pruebas de RLS y permisos sobre schema.sql en Postgres embebido (PGlite).
// Uso: npm i -D @electric-sql/pglite@0.3 && node supabase/tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const prelude = `
create schema extensions; create schema auth; create schema storage; create schema vault;
grant usage on schema extensions to public;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public, auth, storage, vault to anon, authenticated, service_role;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table vault.secrets(id uuid default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text, d text default '') returns uuid language sql as $$
  insert into vault.secrets(name,secret,description) values(n,s,d) returning id $$;
`;
await db.exec(prelude);
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .replace('create extension if not exists supabase_vault;', '');
await db.exec(schema);
console.log('schema OK');

const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002';
let pass = 0, fail = 0;
async function as(role, uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  if (role) await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('assert'); pass++; console.log('OK  ', name); }
  catch (e) { fail++; console.log('FAIL', name, '->', e.message); }
}
async function denied(name, fn, re = /permission denied|violates|no se puede|solo pod|inválid|pasado|media_urls|carpeta|no es de/i) {
  try { await fn(); fail++; console.log('FAIL', name, '-> NO falló'); }
  catch (e) {
    if (re.test(e.message)) { pass++; console.log('OK  ', name, '(', e.message.slice(0, 70), ')'); }
    else { fail++; console.log('FAIL', name, '-> error inesperado', e.message); }
  }
}

await db.query(`insert into auth.users(id, raw_user_meta_data) values ($1, '{"full_name":"Ana","avatar_url":"http://x"}'), ($2, '{}')`, [A, B]);
await ok('perfil creado por trigger (avatar http descartado)', async () => {
  const r = await db.query('select * from profiles order by id');
  return r.rows.length === 2 && r.rows[0].full_name === 'Ana' && r.rows[0].avatar_url === null;
});

let acc;
await ok('service: upsert_social_account cifra tokens', async () => {
  acc = (await as('service_role', null, `select upsert_social_account($1,'instagram','@ana','1789','ACCESS-123','REFRESH-456', now()+interval '30 days', '{}') as id`, [A])).rows[0].id;
  const raw = (await db.query('select access_token_encrypted from social_accounts where id=$1', [acc])).rows[0].access_token_encrypted;
  return !Buffer.from(raw).toString('latin1').includes('ACCESS-123');
});
await ok('service: get_social_account_tokens descifra', async () =>
  (await as('service_role', null, 'select * from get_social_account_tokens($1)', [acc])).rows[0].access_token === 'ACCESS-123');
await denied('A no puede leer columnas cifradas', () => as('authenticated', A, 'select access_token_encrypted from social_accounts'));
await denied('A no puede select *', () => as('authenticated', A, 'select * from social_accounts'));
await ok('A ve su cuenta (columnas públicas)', async () => (await as('authenticated', A, 'select id, platform from social_accounts')).rows.length === 1);
await ok('B no ve la cuenta de A', async () => (await as('authenticated', B, 'select id from social_accounts')).rows.length === 0);
await ok('my_connections para A', async () => (await as('authenticated', A, 'select * from my_connections')).rows.length === 1);
await denied('A no puede ejecutar get_social_account_tokens', () => as('authenticated', A, 'select * from get_social_account_tokens($1)', [acc]));
await denied('A no puede ejecutar claim_due_posts', () => as('authenticated', A, 'select * from claim_due_posts(5)'));
await denied('A no puede insertar cuentas', () => as('authenticated', A, `insert into social_accounts(platform, account_handle) values ('tiktok','@x')`));
await denied('anon no lee posts', () => as('anon', null, 'select id from posts'));

let post;
await ok('A crea draft', async () => {
  post = (await as('authenticated', A, `insert into posts(title, platform) values ('hola','instagram') returning id`)).rows[0].id;
  return !!post;
});
await ok('A programa con media propia', async () =>
  (await as('authenticated', A, `update posts set status='scheduled', scheduled_at=now()+interval '1 hour', social_account_id=$1, media_urls=$2 where id=$3 returning id`,
    [acc, JSON.stringify([{ path: `${A}/img/a.jpg`, type: 'image' }]), post])).rows.length === 1);
await denied('A no puede usar media de B', () => as('authenticated', A, `update posts set media_urls=$1 where id=$2`, [JSON.stringify([{ path: `${B}/x.jpg`, type: 'image' }]), post]));
await denied('A no puede marcar published', () => as('authenticated', A, `update posts set status='published' where id=$1`, [post]));
await denied('A no puede escribir external_post_id', () => as('authenticated', A, `update posts set external_post_id='x' where id=$1`, [post]));
await denied('A no puede programar en el pasado', () => as('authenticated', A, `update posts set scheduled_at=now()-interval '1 day' where id=$1`, [post]));
await denied('A no puede spoofear user_id', () => as('authenticated', A, `insert into posts(user_id, platform) values ($1,'instagram')`, [B]));
await ok('B no ve ni edita el post de A', async () => (await as('authenticated', B, `update posts set title='hack' where id=$1 returning id`, [post])).rows.length === 0);
await denied('cuenta de otra plataforma rechazada', () => as('authenticated', A, `insert into posts(platform, social_account_id) values ('youtube',$1)`, [acc]));
await denied('B no puede usar la cuenta de A', () => as('authenticated', B, `insert into posts(platform, social_account_id) values ('instagram',$1)`, [acc]));

await db.query(`update posts set scheduled_at = now() - interval '1 minute' where id=$1`, [post]);
await ok('claim_due_posts toma el post', async () => {
  const r = await as('service_role', null, 'select id, status from claim_due_posts(5)');
  return r.rows.length === 1 && r.rows[0].status === 'publishing';
});
await ok('segunda llamada no lo vuelve a tomar', async () => (await as('service_role', null, 'select id from claim_due_posts(5)')).rows.length === 0);
await denied('A no edita mientras publica', () => as('authenticated', A, `update posts set title='x' where id=$1`, [post]));
await ok('A no puede borrar mientras publica', async () => (await as('authenticated', A, `delete from posts where id=$1 returning id`, [post])).rows.length === 0);

await db.query(`update posts set locked_at = now() - interval '20 minutes', publish_state='{"final_call_at":"x"}' where id=$1`, [post]);
await ok('rescate: colgado en paso final -> failed', async () => {
  await as('service_role', null, 'select claim_due_posts(5)');
  return (await db.query('select status from posts where id=$1', [post])).rows[0].status === 'failed';
});
await ok('A reprograma failed -> limpia estado interno', async () => {
  await as('authenticated', A, `update posts set status='scheduled', scheduled_at=now()+interval '2 hours' where id=$1`, [post]);
  const r = (await db.query('select publish_state, error_message from posts where id=$1', [post])).rows[0];
  return JSON.stringify(r.publish_state) === '{}' && r.error_message === null;
});

await ok('logs: user_id derivado del post', async () => {
  await as('service_role', null, `insert into publishing_logs(post_id, user_id, status) values ($1,$2,'success')`, [post, B]);
  return (await db.query('select user_id from publishing_logs')).rows[0].user_id === A;
});
await ok('A ve su log, B no', async () =>
  (await as('authenticated', A, 'select id from publishing_logs')).rows.length === 1 &&
  (await as('authenticated', B, 'select id from publishing_logs')).rows.length === 0);
await denied('A no inserta logs', () => as('authenticated', A, `insert into publishing_logs(post_id, status) values ($1,'success')`, [post]));
await ok('engagement_rate calculado', async () => {
  await as('service_role', null, `insert into post_analytics(post_id, reach, likes, comments, shares, saves) values ($1, 1000, 50, 10, 5, 15)`, [post]);
  return Number((await as('authenticated', A, 'select engagement_rate from post_analytics_latest')).rows[0].engagement_rate) === 8;
});

await denied('A no cambia su rol', () => as('authenticated', A, `update profiles set role='admin' where id=$1`, [A]));
await denied('zona horaria inválida', () => as('authenticated', A, `update profiles set timezone='Marte/Base' where id=$1`, [A]));
await ok('zona horaria válida', async () => (await as('authenticated', A, `update profiles set timezone='America/Argentina/Buenos_Aires' where id=$1 returning id`, [A])).rows.length === 1);

await ok('storage: A sube a su carpeta', async () => (await as('authenticated', A, `insert into storage.objects(bucket_id, name) values ('social-media-assets', $1) returning id`, [`${A}/img/a.jpg`])).rows.length === 1);
await denied('storage: A no sube a carpeta de B', () => as('authenticated', A, `insert into storage.objects(bucket_id, name) values ('social-media-assets', $1)`, [`${B}/img/a.jpg`]), /row-level security/i);
await ok('storage: B no ve archivos de A', async () => (await as('authenticated', B, `select id from storage.objects`)).rows.length === 0);
await denied('media_assets: ruta ajena rechazada', () => as('authenticated', A, `insert into media_assets(storage_path) values ($1)`, [`${B}/x.png`]));
await ok('media_assets: ruta propia', async () => (await as('authenticated', A, `insert into media_assets(storage_path, source) values ($1,'adobe') returning id`, [`${A}/adobe/x.png`])).rows.length === 1);

await ok('desconectar cuenta pasa programados a draft', async () => {
  await as('authenticated', A, 'delete from social_accounts where id=$1', [acc]);
  const r = (await db.query('select status, social_account_id, error_message from posts where id=$1', [post])).rows[0];
  return r.status === 'draft' && r.social_account_id === null && /desconect/.test(r.error_message);
});
await ok('ai_quota_ok', async () => (await as('service_role', null, 'select ai_quota_ok($1, 30) as ok', [A])).rows[0].ok === true);
await denied('A no puede ejecutar verify_cron_secret', () => as('authenticated', A, `select verify_cron_secret('x')`));
await ok('verify_cron_secret: correcto true / incorrecto false', async () => {
  const s = (await db.query(`select decrypted_secret from vault.decrypted_secrets where name='cron_secret'`)).rows[0].decrypted_secret;
  const good = (await as('service_role', null, 'select verify_cron_secret($1) as v', [s])).rows[0].v;
  const bad = (await as('service_role', null, 'select verify_cron_secret($1) as v', ['0'.repeat(64)])).rows[0].v;
  return good === true && bad === false;
});
await ok('A registra evento y error vía RPC', async () => {
  await as('authenticated', A, `select track_event('post_created', '{"platform":"instagram"}', '/calendario')`);
  await as('authenticated', A, `select report_client_error('boom', null, '/x', 'ua', 'editor')`);
  const r = await db.query(`select (select count(*) from app_events)::int e, (select count(*) from error_reports)::int r`);
  return r.rows[0].e === 1 && r.rows[0].r === 1;
});
await denied('A no lee app_events ni error_reports', () => as('authenticated', A, 'select * from app_events'));
await denied('evento con nombre inválido', () => as('authenticated', A, `select track_event('DROP TABLE', '{}')`), /violates/);
await denied('A no ejecuta health_snapshot', () => as('authenticated', A, 'select health_snapshot()'));
await ok('health_snapshot (service)', async () => (await as('service_role', null, 'select health_snapshot() as h')).rows[0].h.db === true);

await ok('re-ejecutar schema.sql (idempotente)', async () => { await db.exec(schema); return true; });

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
