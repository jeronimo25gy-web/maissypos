-- Tareas propias: recordatorios personales de cada usuario. Solo los ve quien
-- los crea y salen junto a las demas tareas.
create table if not exists public.tareas_propias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  creado_auth uuid not null default auth.uid(),
  creado_por text,
  titulo text not null check (length(trim(titulo)) > 0),
  detalle text,
  prioridad text not null default 'hoy' check (prioridad in ('alta', 'hoy', 'semana')),
  fecha date,
  hecha_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tareas_propias_usuario on public.tareas_propias (empresa_id, creado_auth) where hecha_at is null;

alter table public.tareas_propias enable row level security;
create policy propias_select on public.tareas_propias for select using (creado_auth = auth.uid() and empresa_id = any (jwt_empresa_ids()));
create policy propias_insert on public.tareas_propias for insert with check (creado_auth = auth.uid() and empresa_id = any (jwt_empresa_ids()));
create policy propias_update on public.tareas_propias for update using (creado_auth = auth.uid() and empresa_id = any (jwt_empresa_ids())) with check (creado_auth = auth.uid() and empresa_id = any (jwt_empresa_ids()));
create policy solo_lectura_ins on public.tareas_propias as restrictive for insert to authenticated with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_upd on public.tareas_propias as restrictive for update to authenticated using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_del on public.tareas_propias as restrictive for delete to authenticated using (not (select public.cliente_bloqueado()));
