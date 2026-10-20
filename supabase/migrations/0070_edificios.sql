-- Edificios: el edificio pasa a ser una parada del rutero con sus apartamentos
-- (clientes) adentro, su portero y el obsequio que el admin autoriza para la
-- portería. Antes el edificio era solo un texto en cada cliente.

create table if not exists public.edificios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null,
  direccion text,
  barrio text,
  portero_nombre text,
  portero_telefono text,
  notas text,
  -- Obsequio a la portería: solo lo pone el admin en Rutas.
  obsequio_sku text,
  obsequio_cantidad numeric check (obsequio_cantidad > 0),
  obsequio_frecuencia text check (obsequio_frecuencia in ('visita', 'semana', 'mes')),
  obsequio_autorizado_por text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists edificios_empresa on public.edificios (empresa_id, nombre);

alter table public.edificios enable row level security;
create policy empresa_id_select on public.edificios for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.edificios for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = any (array['admin', 'auxiliar']));
create policy empresa_id_update on public.edificios for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = any (array['admin', 'auxiliar'])) with check (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_delete on public.edificios for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin');

alter table public.clientes add column if not exists edificio_id uuid references public.edificios(id);
create index if not exists clientes_edificio on public.clientes (edificio_id);
alter table public.obsequios add column if not exists edificio_id uuid references public.edificios(id);

-- Los edificios que hoy son texto en los clientes de tipo edificio o unidad.
insert into public.edificios (empresa_id, nombre, direccion, barrio)
select c.empresa_id, min(trim(c.edificio)),
       mode() within group (order by nullif(trim(c.direccion), '')),
       mode() within group (order by nullif(trim(c.barrio), ''))
from public.clientes c
where nullif(trim(c.edificio), '') is not null and c.tipo_inmueble in ('edificio', 'unidad')
group by c.empresa_id, lower(trim(c.edificio));

update public.clientes c set edificio_id = e.id
from public.edificios e
where e.empresa_id = c.empresa_id and lower(trim(c.edificio)) = lower(e.nombre) and c.tipo_inmueble in ('edificio', 'unidad');
