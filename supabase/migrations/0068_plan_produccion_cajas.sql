-- Planta: plan de producción del día (qué referencias, cuántos paquetes y en
-- qué orden) y paquetes por caja de cada referencia, para pedir el pesaje de
-- 3 paquetes por caja en empaque.

alter table public.productos add column if not exists paquetes_por_caja integer check (paquetes_por_caja > 0);

update public.productos p set paquetes_por_caja = v.n
from (values ('ARE-002', 49), ('ARE-010', 49), ('ARE-003', 33), ('ARE-004', 42), ('ARE-011', 42), ('ARE-005', 16), ('ARE-006', 22)) v(sku, n)
where p.sku = v.sku and p.empresa_id = (select id from public.empresas where nombre ilike 'arepas%' limit 1);

create table if not exists public.produccion_plan (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  producto_id uuid not null references public.productos(id),
  paquetes integer not null check (paquetes > 0),
  orden integer not null default 0,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, fecha, producto_id)
);
create index if not exists produccion_plan_fecha on public.produccion_plan (empresa_id, fecha, orden);

alter table public.produccion_plan enable row level security;
create policy empresa_id_select on public.produccion_plan for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.produccion_plan for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = any (array['admin', 'auxiliar']));
create policy empresa_id_update on public.produccion_plan for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = any (array['admin', 'auxiliar'])) with check (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_delete on public.produccion_plan for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = any (array['admin', 'auxiliar']));
