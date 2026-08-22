-- Modulo de Produccion/Formulas/Costeo para Arepas Maissy. Reusa `productos`
-- (con un tipo nuevo 'materia_prima') en vez de una tabla paralela, y el
-- mecanismo de stock ya existente (inventario_mov entrada/salida) en vez de
-- inventar uno nuevo -- calcularStockPorSku() en lib/inventario-helpers.js
-- ya suma/resta de ahi, asi que producir/consumir materia prima se refleja
-- automaticamente en Inventario y Conteo sin tocar esa logica.
--
-- Las 4 tablas nuevas usan desde el dia uno el patron de RLS por JWT ya
-- probado hoy (0004_rls_jwt_rollout.sql) -- ninguna pasa por el patron viejo
-- del header.

-- productos: distinguir materia prima de producto terminado
alter table public.productos
  add column if not exists tipo text not null default 'terminado'
  check (tipo in ('terminado', 'materia_prima'));

-- formulas: la "receta" de un producto terminado (ej. "Masa Arepa Tela")
create table if not exists public.formulas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  producto_id uuid not null references public.productos(id),
  nombre text not null,
  rendimiento numeric not null default 1, -- cuantas unidades del producto terminado rinde esta formula (ej. 1 bulto de masa -> 200 paquetes)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.formulas_detalle (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  formula_id uuid not null references public.formulas(id),
  materia_prima_id uuid not null references public.productos(id), -- producto con tipo='materia_prima'
  cantidad numeric not null,
  created_at timestamptz not null default now()
);

-- produccion_lotes: un dia/tanda de produccion de un operario
create table if not exists public.produccion_lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fecha date not null,
  operario_id uuid references public.empleados(id),
  observaciones text,
  created_at timestamptz not null default now()
);

-- produccion_detalle: cuanto se produjo realmente de cada formula en ese lote
create table if not exists public.produccion_detalle (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lote_id uuid not null references public.produccion_lotes(id),
  formula_id uuid not null references public.formulas(id),
  cantidad_producida numeric not null,
  created_at timestamptz not null default now()
);

-- categorias_gasto: clasificar en costo fijo vs CIF (costos indirectos de
-- fabricacion) para el reporte de Costeo. Null = sin clasificar todavia
-- (se pide clasificar la primera vez que se usa, no en un barrido previo).
alter table public.categorias_gasto
  add column if not exists tipo_costo text
  check (tipo_costo in ('costo_fijo', 'cif'));

-- empleados: si su salario cuenta como mano de obra directa (costo variable
-- de produccion) o como gasto administrativo/fijo.
alter table public.empleados
  add column if not exists es_mano_obra_directa boolean not null default false;

-- ============ RLS (patron JWT ya probado, ver 0004_rls_jwt_rollout.sql) ============

alter table public.formulas enable row level security;
drop policy if exists "empresa_id_select" on public.formulas;
drop policy if exists "empresa_id_insert" on public.formulas;
drop policy if exists "empresa_id_update" on public.formulas;
create policy "empresa_id_select" on public.formulas for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.formulas for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.formulas for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

alter table public.formulas_detalle enable row level security;
drop policy if exists "empresa_id_select" on public.formulas_detalle;
drop policy if exists "empresa_id_insert" on public.formulas_detalle;
drop policy if exists "empresa_id_update" on public.formulas_detalle;
drop policy if exists "empresa_id_delete" on public.formulas_detalle;
create policy "empresa_id_select" on public.formulas_detalle for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.formulas_detalle for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.formulas_detalle for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.formulas_detalle for delete using (empresa_id = any (public.jwt_empresa_ids()));

alter table public.produccion_lotes enable row level security;
drop policy if exists "empresa_id_select" on public.produccion_lotes;
drop policy if exists "empresa_id_insert" on public.produccion_lotes;
drop policy if exists "empresa_id_update" on public.produccion_lotes;
create policy "empresa_id_select" on public.produccion_lotes for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.produccion_lotes for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.produccion_lotes for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

alter table public.produccion_detalle enable row level security;
drop policy if exists "empresa_id_select" on public.produccion_detalle;
drop policy if exists "empresa_id_insert" on public.produccion_detalle;
create policy "empresa_id_select" on public.produccion_detalle for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.produccion_detalle for insert with check (empresa_id = any (public.jwt_empresa_ids()));
