-- Cierre de la producción del día (anotada a mano): una vez cerrado, ya no
-- se le suma producción ni maíz; Gerencia puede reabrirlo.
create table if not exists public.produccion_dias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  cerrado_at timestamptz,
  cerrado_por text,
  unique (empresa_id, fecha)
);
alter table public.produccion_dias enable row level security;
create policy empresa_id_select on public.produccion_dias for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy empresa_id_insert on public.produccion_dias for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy empresa_id_update on public.produccion_dias for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
