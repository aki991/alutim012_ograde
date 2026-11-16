-- Ograde: svi podaci aplikacije u Supabase-u (projekti, kupci, materijali, podešavanja i modeli).
-- Pokrenuti jednom u Supabase SQL Editoru. Tabele imaju prefiks ograde_, pa se ne mešaju sa tabelama Stolarije (field_*).
-- Podaci su zajednički za sve prijavljene naloge firme; neprijavljeni nemaju pristup.

create table if not exists public.ograde_projects  (id text primary key, data jsonb not null, updated_at timestamptz not null default now(), updated_by uuid default auth.uid());
create table if not exists public.ograde_customers (id text primary key, data jsonb not null, updated_at timestamptz not null default now(), updated_by uuid default auth.uid());
create table if not exists public.ograde_materials (id text primary key, data jsonb not null, updated_at timestamptz not null default now(), updated_by uuid default auth.uid());
-- podešavanja: jedan red po ključu (npr. pricing) ili po stavci (customModels/<id>, slidingTemplates/<id>, stock/<id> ...)
create table if not exists public.ograde_settings  (id text primary key, data jsonb not null, updated_at timestamptz not null default now(), updated_by uuid default auth.uid());

create or replace function public.ograde_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ograde_projects', 'ograde_customers', 'ograde_materials', 'ograde_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.ograde_touch()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_all', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
