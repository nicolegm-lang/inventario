-- Inventario de Laboratorio + Supabase
-- Ejecuta este archivo en Supabase Dashboard > SQL Editor > New query > Run.
-- Después registra el primer usuario en la app y ejecuta 02_promote_first_admin.sql.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  role text not null default 'usuario' check (role in ('admin', 'usuario')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.allowed_accounts (
  email text primary key,
  name text,
  role text not null default 'usuario' check (role in ('admin', 'usuario')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  unit text not null default 'pieza',
  min_stock numeric(14,4) check (min_stock is null or min_stock >= 0),
  location text,
  lot text,
  expiration_date date,
  provider text,
  status text not null default 'disponible' check (status in ('disponible','agotado','en_revision','caducado','baja')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  type text not null check (type in ('entrada','salida','ajuste','baja')),
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  previous_quantity numeric(14,4) not null,
  new_quantity numeric(14,4) not null check (new_quantity >= 0),
  reason text not null,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists allowed_accounts_set_updated_at on public.allowed_accounts;
create trigger allowed_accounts_set_updated_at
before update on public.allowed_accounts
for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create or replace function public.is_active_user(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id and p.active = true
  );
$$;

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id and p.active = true and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed record;
begin
  select * into allowed
  from public.allowed_accounts
  where email = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(allowed.name, new.raw_user_meta_data->>'name', lower(new.email)),
    coalesce(allowed.role, 'usuario'),
    coalesce(allowed.active, false)
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    active = excluded.active;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.register_movement(
  p_item_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text,
  p_notes text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.items%rowtype;
  v_previous numeric(14,4);
  v_new numeric(14,4);
  v_movement public.movements%rowtype;
begin
  if not public.is_active_user(auth.uid()) then
    raise exception 'Usuario no autorizado';
  end if;

  if p_type not in ('entrada','salida','ajuste','baja') then
    raise exception 'Tipo de movimiento inválido';
  end if;

  if p_type <> 'baja' and (p_quantity is null or p_quantity < 0) then
    raise exception 'Cantidad inválida';
  end if;

  select * into current_item
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_previous := current_item.quantity;

  if p_type = 'entrada' then
    v_new := v_previous + p_quantity;
  elsif p_type = 'salida' then
    v_new := v_previous - p_quantity;
  elsif p_type = 'ajuste' then
    v_new := p_quantity;
  else
    v_new := 0;
    p_quantity := v_previous;
  end if;

  if v_new < 0 then
    raise exception 'La salida excede la cantidad disponible';
  end if;

  update public.items
  set quantity = v_new,
      status = case
        when p_type = 'baja' then 'baja'
        when v_new = 0 and status = 'disponible' then 'agotado'
        when v_new > 0 and status = 'agotado' then 'disponible'
        else status
      end,
      updated_by = auth.uid()
  where id = p_item_id;

  insert into public.movements (
    item_id, user_id, type, quantity, previous_quantity, new_quantity, reason, notes
  ) values (
    p_item_id, auth.uid(), p_type, coalesce(p_quantity, 0), v_previous, v_new, p_reason, p_notes
  ) returning * into v_movement;

  return v_movement;
end;
$$;

alter table public.profiles enable row level security;
alter table public.allowed_accounts enable row level security;
alter table public.items enable row level security;
alter table public.movements enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "allowed_accounts_admin_all" on public.allowed_accounts;
create policy "allowed_accounts_admin_all"
on public.allowed_accounts for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "items_select_active" on public.items;
create policy "items_select_active"
on public.items for select
to authenticated
using (public.is_active_user(auth.uid()));

drop policy if exists "items_insert_active" on public.items;
create policy "items_insert_active"
on public.items for insert
to authenticated
with check (public.is_active_user(auth.uid()));

drop policy if exists "items_update_active" on public.items;
create policy "items_update_active"
on public.items for update
to authenticated
using (public.is_active_user(auth.uid()))
with check (public.is_active_user(auth.uid()));

drop policy if exists "items_delete_admin" on public.items;
create policy "items_delete_admin"
on public.items for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "movements_select_active" on public.movements;
create policy "movements_select_active"
on public.movements for select
to authenticated
using (public.is_active_user(auth.uid()));

-- Los movimientos se insertan mediante la función register_movement para que cantidad e historial sean atómicos.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.allowed_accounts to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select on public.movements to authenticated;
grant execute on function public.register_movement(uuid, text, numeric, text, text) to authenticated;

-- Realtime: agrega las tablas a la publicación si aún no están agregadas.
-- En Supabase Dashboard también puedes activarlo desde Database > Replication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    execute 'alter publication supabase_realtime add table public.items';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movements'
  ) then
    execute 'alter publication supabase_realtime add table public.movements';
  end if;
end $$;
