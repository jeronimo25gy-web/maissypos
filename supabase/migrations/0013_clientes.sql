-- Clientes B2B con precio propio por producto. Antes Ventas solo tenia
-- campos de texto libre para el cliente (nombre/documento/telefono/
-- direccion), sin conexion a nada -- cada venta era un cliente nuevo sin
-- historial ni forma de pactar un precio distinto al de mostrador.

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  nit text,
  telefono text,
  direccion text,
  contacto text,
  estado boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes_precios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  sku text not null,
  precio_especial numeric not null,
  created_at timestamptz not null default now(),
  unique (cliente_id, sku)
);

alter table public.clientes enable row level security;
drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_select" on public.clientes for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "clientes_insert" on public.clientes for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "clientes_update" on public.clientes for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

alter table public.clientes_precios enable row level security;
drop policy if exists "clientes_precios_select" on public.clientes_precios;
drop policy if exists "clientes_precios_insert" on public.clientes_precios;
drop policy if exists "clientes_precios_update" on public.clientes_precios;
drop policy if exists "clientes_precios_delete" on public.clientes_precios;
create policy "clientes_precios_select" on public.clientes_precios for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "clientes_precios_insert" on public.clientes_precios for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "clientes_precios_update" on public.clientes_precios for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "clientes_precios_delete" on public.clientes_precios for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- Ventas: ligar la venta a un cliente registrado (opcional -- sigue
-- permitiendo venta de mostrador sin cliente fijo).
alter table public.ventas_encab
  add column if not exists cliente_id uuid references public.clientes(id);
