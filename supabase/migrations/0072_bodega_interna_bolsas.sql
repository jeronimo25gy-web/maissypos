-- Bodega interna del grupo (repuestos, herramientas, dotación…) y bolsas de
-- reparto de Distri.

-- Bodega interna: elementos que no se venden. Cada uno queda a nombre de la
-- empresa que lo paga; el admin del grupo ve las dos.
create table if not exists public.bodega_categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.bodega_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  categoria_id uuid references public.bodega_categorias(id),
  nombre text not null,
  unidad text not null default 'und',
  cantidad numeric not null default 0,
  minimo numeric not null default 0,
  ubicacion text,
  valor_unitario numeric not null default 0,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.bodega_movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  item_id uuid not null references public.bodega_items(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad numeric not null,
  destino text check (destino in ('vehiculo', 'persona', 'area', 'otro')),
  vehiculo_id uuid references public.vehiculos(id),
  responsable text,
  motivo text,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists bodega_mov_item on public.bodega_movimientos (item_id, fecha);

-- La cantidad del elemento se mueve con cada entrada, salida o ajuste (el ajuste deja la cantidad contada).
create or replace function public.bodega_aplicar_movimiento() returns trigger language plpgsql as $$
begin
  update public.bodega_items set cantidad = case
    when new.tipo = 'entrada' then cantidad + new.cantidad
    when new.tipo = 'salida' then cantidad - new.cantidad
    else new.cantidad end
  where id = new.item_id;
  return new;
end $$;
drop trigger if exists bodega_movimiento_aplicar on public.bodega_movimientos;
create trigger bodega_movimiento_aplicar after insert on public.bodega_movimientos for each row execute function public.bodega_aplicar_movimiento();

do $$ declare t text; begin
  foreach t in array array['bodega_categorias', 'bodega_items', 'bodega_movimientos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy empresa_id_select on public.%I for select using (empresa_id = any (jwt_empresa_ids()))', t);
    execute format('create policy empresa_id_insert on public.%I for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) = any (array[%L, %L]))', t, '', 'admin', 'auxiliar');
    execute format('create policy empresa_id_update on public.%I for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) = any (array[%L, %L])) with check (empresa_id = any (jwt_empresa_ids()))', t, '', 'admin', 'auxiliar');
    execute format('create policy empresa_id_delete on public.%I for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) = %L)', t, '', 'admin');
  end loop;
end $$;

-- Categorías de arranque (se crean más desde la bodega interna).
insert into public.bodega_categorias (empresa_id, nombre)
select e.id, c from public.empresas e, unnest(array['Repuestos', 'Herramientas', 'Dotación y uniformes', 'Aseo', 'Puntos de venta y eventos', 'Papelería']) c
where e.nombre ilike 'distri%';

-- Bolsas de reparto de Distri: insumo (no se venden ni se despachan como producto).
-- Salen en el despacho de cada ruta, ligadas al despacho, sin cobrarse a la ruta.
alter table public.inventario_mov add column if not exists despacho_id uuid references public.despachos_encab(id) on delete cascade;
insert into public.productos (empresa_id, sku, nombre, categoria, tipo, estado, precio_venta, stock_minimo, dias_cobertura)
select e.id, v.sku, v.nombre, 'Insumos de reparto', 'materia_prima', true, 0, 0, 14
from public.empresas e, (values ('BOL-001', 'Bolsa quesito 8x10 opaca'), ('BOL-002', 'Bolsa T25'), ('BOL-003', 'Bolsa T30')) v(sku, nombre)
where e.nombre ilike 'distri%' and not exists (select 1 from public.productos p where p.empresa_id = e.id and p.sku = v.sku);
