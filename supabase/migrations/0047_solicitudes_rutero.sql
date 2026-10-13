-- Sacar clientes del rutero: el vendedor lo pide (con motivo) desde Mi ruta y
-- el admin/auxiliar lo aprueba o lo rechaza en Rutas.
create table if not exists public.solicitudes_rutero (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ruta_id uuid references public.rutas(id),
  dia_semana int,
  vendedor_id uuid references public.vendedores(id),
  motivo text not null,
  detalle text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  pedido_por text,
  resuelto_por text,
  resuelto_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists solicitudes_rutero_pend on public.solicitudes_rutero (empresa_id, ruta_id, estado);

alter table public.solicitudes_rutero enable row level security;
create policy solicitudes_rutero_select on public.solicitudes_rutero for select to authenticated using (empresa_id = any (jwt_empresa_ids()));
create policy solicitudes_rutero_insert on public.solicitudes_rutero for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()));
create policy solicitudes_rutero_update on public.solicitudes_rutero for update to authenticated using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()));
create policy solicitudes_rutero_delete on public.solicitudes_rutero for delete to authenticated using (empresa_id = any (jwt_empresa_ids()));
-- El vendedor pide; aprobar o rechazar es del admin/auxiliar.
create policy solicitudes_rutero_vendedor_solo_pide on public.solicitudes_rutero as restrictive for all to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor' or estado = 'pendiente')
  with check (coalesce(jwt_rol(), '') <> 'vendedor' or estado = 'pendiente');

-- Sacar clientes del rutero es del admin/auxiliar: el vendedor solo lo pide.
drop policy if exists rutero_vendedor_no_borra on public.rutero;
create policy rutero_vendedor_no_borra on public.rutero as restrictive for delete to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor');
