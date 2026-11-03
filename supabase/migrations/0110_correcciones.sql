-- Correcciones de Gerencia a un despacho o una compra ya confirmados: quién,
-- cuándo, por qué, y cómo estaba y cómo quedó.
create table if not exists public.correcciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  tipo text not null check (tipo in ('despacho', 'compra')),
  referencia_id uuid not null,
  motivo text not null,
  antes jsonb not null,
  despues jsonb not null,
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists correcciones_referencia on public.correcciones (referencia_id);
alter table public.correcciones enable row level security;
create policy empresa_id_select on public.correcciones for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.correcciones for insert with check (empresa_id = any (jwt_empresa_ids()) and jwt_es_gerencia());
create policy suspendido_sin_lectura on public.correcciones as restrictive for select using (not (select cliente_suspendido()));
create policy solo_lectura_ins on public.correcciones as restrictive for insert with check (not (select cliente_bloqueado()));
