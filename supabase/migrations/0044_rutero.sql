-- Modulo Rutas: el cliente es el centro (credito, ticket, visitas cuelgan de
-- el) y el rutero dice en que ruta, que dia(s) y en que puesto se visita.
-- Un cliente puede estar en varios dias (o rutas) con su propio orden.

alter table public.clientes
  add column if not exists codigo text,
  add column if not exists tipo_inmueble text,      -- casa | edificio | unidad | negocio
  add column if not exists edificio text,
  add column if not exists apto text,               -- apto / piso / interior
  add column if not exists barrio text,
  add column if not exists frecuencia_dias integer not null default 7,
  add column if not exists notas text;

create table if not exists public.rutero (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ruta_id uuid not null references public.rutas(id),
  dia_semana smallint not null check (dia_semana between 1 and 7),  -- 1 = lunes ... 7 = domingo
  orden integer not null,
  created_at timestamptz not null default now(),
  unique (cliente_id, ruta_id, dia_semana)
);
create index if not exists rutero_ruta_dia_idx on public.rutero (ruta_id, dia_semana, orden);
alter table public.rutero enable row level security;
create policy rutero_select on public.rutero for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy rutero_insert on public.rutero for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy rutero_update on public.rutero for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy rutero_delete on public.rutero for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- Reordena un dia completo de una vez (arrastrar y soltar): recibe los ids del
-- rutero en el orden nuevo y los numera 1..n en una sola transaccion.
create or replace function public.reordenar_rutero(p_ids uuid[])
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  update public.rutero r set orden = x.pos
  from unnest(p_ids) with ordinality as x(id, pos)
  where r.id = x.id;
end;
$$;
grant execute on function public.reordenar_rutero(uuid[]) to authenticated;
