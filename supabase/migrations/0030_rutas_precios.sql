-- Precio especial por RUTA (distinto a clientes_precios, que es por
-- cliente registrado). En Distri Maissy algunas rutas venden ciertos
-- productos a un valor distinto al de catalogo, sin que haya necesariamente
-- un cliente fijo detras (venta informal en el recorrido). Mismo patron que
-- clientes_precios (0013_clientes.sql).

create table if not exists public.rutas_precios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  ruta_id uuid not null references public.rutas(id) on delete cascade,
  sku text not null,
  precio_especial numeric not null,
  created_at timestamptz not null default now(),
  unique (ruta_id, sku)
);

alter table public.rutas_precios enable row level security;
drop policy if exists "rutas_precios_select" on public.rutas_precios;
drop policy if exists "rutas_precios_insert" on public.rutas_precios;
drop policy if exists "rutas_precios_update" on public.rutas_precios;
drop policy if exists "rutas_precios_delete" on public.rutas_precios;
create policy "rutas_precios_select" on public.rutas_precios for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "rutas_precios_insert" on public.rutas_precios for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "rutas_precios_update" on public.rutas_precios for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "rutas_precios_delete" on public.rutas_precios for delete using (empresa_id = any (public.jwt_empresa_ids()));
