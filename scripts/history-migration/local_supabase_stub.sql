-- Stub mínimo de Supabase para ensayar las migraciones en un Postgres local desechable.
-- Reproduce lo que las migraciones usan: roles anon/authenticated/service_role, auth.users,
-- auth.uid() y los privilegios por defecto observados en lacanchita (2026-10-29):
-- tablas nuevas de postgres → anon/authenticated/service_role solo con TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.
-- NUNCA ejecutar contra un proyecto Supabase real.
do $$ begin
  if current_setting('cluster_name', true) is distinct from 'lacanchita-local-test' then
    raise exception 'stub_solo_local: cluster_name debe ser lacanchita-local-test';
  end if;
end $$;
-- Los roles son del clúster: se crean solo si no existen (varias bases de prueba en el mismo clúster).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Como en Supabase: pgcrypto en el esquema extensions.
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role;
alter default privileges revoke execute on functions from public;

-- Storage mínimo para probar políticas de buckets (solo lo que usan las migraciones).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
