-- Donde va la ruta: cada visita y cada venta guarda la ubicacion del celular
-- en ese momento, y mientras el vendedor tiene Mi ruta abierta se guarda su
-- posicion cada pocos minutos. Sirve para ver la ruta en vivo y para
-- responder "¿si paso el vendedor?".
alter table public.visitas_ruta add column if not exists lat double precision, add column if not exists lng double precision, add column if not exists precision_m double precision;
alter table public.ventas_ruta add column if not exists lat double precision, add column if not exists lng double precision, add column if not exists precision_m double precision;
alter table public.visitas_ruta alter column cliente_id drop not null;

create table if not exists public.ubicaciones_ruta (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id),
  vendedor_id uuid references public.vendedores(id),
  ruta_id uuid references public.rutas(id),
  fecha date not null,
  lat double precision not null,
  lng double precision not null,
  precision_m double precision,
  created_at timestamptz default now()
);
create index if not exists ubicaciones_ruta_ruta_fecha on public.ubicaciones_ruta (ruta_id, fecha, created_at desc);
alter table public.ubicaciones_ruta enable row level security;
create policy ubicaciones_ruta_select on public.ubicaciones_ruta for select to authenticated using (empresa_id = any (jwt_empresa_ids()));
create policy ubicaciones_ruta_insert on public.ubicaciones_ruta for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()));
create policy ubicaciones_ruta_delete on public.ubicaciones_ruta for delete to authenticated using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') <> 'vendedor');
