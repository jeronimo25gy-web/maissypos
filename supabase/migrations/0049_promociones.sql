-- Promociones por cantidad sobre un mismo producto (ej. Arepa Tela: 6 por
-- $14.000). No son otro producto: se despachan y se descuentan como el
-- producto normal; al vender, el ticket arma solo las promos (8 = 1 promo x6
-- + 2 sueltas) y la liquidacion cobra lo que de verdad se vendio.
create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sku text not null,
  nombre text not null,
  cantidad int not null check (cantidad > 1),
  precio numeric not null check (precio > 0),
  ruta_id uuid references public.rutas(id) on delete cascade,
  activa boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists promociones_empresa_sku on public.promociones (empresa_id, sku) where activa;
alter table public.promociones enable row level security;
create policy promociones_select on public.promociones for select to authenticated using (empresa_id = any (jwt_empresa_ids()));
create policy promociones_insert on public.promociones for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()));
create policy promociones_update on public.promociones for update to authenticated using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()));
create policy promociones_delete on public.promociones for delete to authenticated using (empresa_id = any (jwt_empresa_ids()));
-- Las promos las pone el admin; el vendedor solo las usa.
create policy promociones_vendedor_no_escribe on public.promociones as restrictive for all to authenticated
  using (true) with check (coalesce(jwt_rol(), '') <> 'vendedor');
drop policy if exists promociones_vendedor_no_borra on public.promociones;
create policy promociones_vendedor_no_borra on public.promociones as restrictive for delete to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor');

alter table public.ventas_ruta_detalle add column if not exists paquetes int, add column if not exists promo_id uuid references public.promociones(id);

-- Distri: Arepa Tela, 6 por $14.000.
insert into public.promociones (empresa_id, sku, nombre, cantidad, precio)
select '025529ee-8655-459b-91a3-4a719f28c8bc', 'ARE-001', 'Promo x6', 6, 14000
where not exists (select 1 from public.promociones where empresa_id = '025529ee-8655-459b-91a3-4a719f28c8bc' and sku = 'ARE-001');
