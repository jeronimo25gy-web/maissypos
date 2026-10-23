-- Calendario del Inicio: fechas propias (reuniones, impuestos, conteo de los
-- lunes) que pueden repetirse y que ve Gerencia, el Administrador o todos.
-- Tareas por rol: qué tipo de tarea le llega a cada rol (lo ajusta Gerencia).

create table if not exists calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  titulo text not null,
  fecha date not null,
  hora time,
  repetir text not null default 'no' check (repetir in ('no', 'semana', 'mes')),
  para text not null default 'todos' check (para in ('gerencia', 'admin', 'todos')),
  notas text,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table calendario_eventos enable row level security;
create policy calendario_eventos_select on calendario_eventos for select using (empresa_id = any (jwt_empresa_ids()) and (para <> 'gerencia' or jwt_es_gerencia()));
create policy calendario_eventos_insert on calendario_eventos for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar') and (para <> 'gerencia' or jwt_es_gerencia()));
create policy calendario_eventos_update on calendario_eventos for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar') and (para <> 'gerencia' or jwt_es_gerencia())) with check (empresa_id = any (jwt_empresa_ids()));
create policy calendario_eventos_delete on calendario_eventos for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar') and (para <> 'gerencia' or jwt_es_gerencia()));

create table if not exists tareas_roles (
  tipo text primary key,
  roles jsonb not null default '[]'::jsonb,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table tareas_roles enable row level security;
create policy tareas_roles_select on tareas_roles for select to authenticated using (true);
create policy tareas_roles_insert on tareas_roles for insert to authenticated with check (jwt_es_gerencia());
create policy tareas_roles_update on tareas_roles for update to authenticated using (jwt_es_gerencia()) with check (jwt_es_gerencia());
