-- Metas de los indicadores de Reportes. Arrancan vacías y se ponen en la
-- transición. alcance 'empresa' es la meta de esa empresa; 'grupo' es la meta
-- de Maissy Group (se guarda con la empresa de quien la puso, por RLS).

create table if not exists public.indicadores_metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  alcance text not null default 'empresa' check (alcance in ('empresa', 'grupo')),
  indicador text not null,
  meta numeric not null,
  actualizado_por text,
  updated_at timestamptz not null default now(),
  unique (empresa_id, alcance, indicador)
);

alter table public.indicadores_metas enable row level security;
create policy empresa_id_select on public.indicadores_metas for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.indicadores_metas for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin');
create policy empresa_id_update on public.indicadores_metas for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin') with check (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_delete on public.indicadores_metas for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin');
