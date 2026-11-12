-- =====================================================================
--  Rescate de recuerdos · configuración de Supabase
--  Pégalo completo en:  SQL Editor → New query → Run
--  ANTES de ejecutarlo: cambia los 2 correos por los que usarás
--  (deben ser EXACTAMENTE los mismos que pongas en config.js)
-- =====================================================================

-- 1) Quiénes son "los dos" (m = novio, f = novia)
create table if not exists public.members (
  email text primary key,
  role  text not null check (role in ('m','f'))
);
insert into public.members (email, role) values
  ('bryan@rescate.app', 'm'),
  ('nathy@rescate.app', 'f')
on conflict (email) do update set role = excluded.role;
alter table public.members enable row level security;   -- sin políticas: nadie la lee directamente

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = (auth.jwt() ->> 'email'))
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where email = (auth.jwt() ->> 'email')
$$;

-- 2) Tabla donde se guarda todo (nombres, tops, cápsula, libro, logros, fotos...)
create table if not exists public.kv (
  key        text primary key,
  value      jsonb not null,
  version    int not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists kv_updated_at_idx on public.kv (updated_at);
alter table public.kv enable row level security;
drop policy if exists kv_members on public.kv;
create policy kv_members on public.kv for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.kv to authenticated;

-- 3) Reglas automáticas: fecha de actualización y "solo quien subió una foto puede borrarla"
create or replace function public.kv_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE'
     and starts_with(old.key, 'ph:')
     and coalesce(current_setting('app.wipe', true), '') <> '1'
     and jsonb_exists(new.value, '__del') and not jsonb_exists(old.value, '__del') then
    if public.my_role() is distinct from (old.value ->> 'by') then
      raise exception 'Solo quien subió la foto puede borrarla';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists kv_touch_t on public.kv;
create trigger kv_touch_t before insert or update on public.kv
  for each row execute function public.kv_touch();

-- 4) "Reiniciar todo" del modo Administrador
create or replace function public.wipe_all() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'no autorizado'; end if;
  perform set_config('app.wipe', '1', true);
  update public.kv set value = '{"__del":1}'::jsonb, version = version + 1 where key is not null;
end $$;
revoke all on function public.wipe_all() from public, anon;
grant execute on function public.wipe_all() to authenticated;

-- 5) Almacén privado para las fotos
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;
drop policy if exists photos_members on storage.objects;
create policy photos_members on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.is_member())
  with check (bucket_id = 'photos' and public.is_member());
