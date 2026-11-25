-- Arreglos de los carros completos: tipo de arreglo, taller (con su teléfono),
-- quién lo llevó, varias facturas, cómo se pagó y el gasto que generó; y el
-- enlace a un gasto ya anotado en una liquidación o en Gastos cuando se completa
-- desde la ficha del carro (no mueve plata otra vez).
create table if not exists public.vehiculos_talleres (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  telefono text,
  direccion text,
  created_at timestamptz not null default now(),
  unique (empresa_id, nombre)
);
alter table public.vehiculos_talleres enable row level security;
create policy empresa_select on public.vehiculos_talleres for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy admin_insert on public.vehiculos_talleres for insert with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_update on public.vehiculos_talleres for update using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin') with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_delete on public.vehiculos_talleres for delete using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy solo_lectura_ins on public.vehiculos_talleres as restrictive for insert with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_upd on public.vehiculos_talleres as restrictive for update using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_del on public.vehiculos_talleres as restrictive for delete using (not (select public.cliente_bloqueado()));
create policy suspendido_sin_lectura on public.vehiculos_talleres as restrictive for select using (not (select public.cliente_suspendido()));

alter table public.vehiculos_mantenimientos
  add column if not exists tipo_arreglo text,
  add column if not exists taller_id uuid references public.vehiculos_talleres(id) on delete set null,
  add column if not exists responsable text,
  add column if not exists facturas text[] not null default '{}',
  add column if not exists forma_pago text,
  add column if not exists cuenta_id uuid references public.cuentas(id) on delete set null,
  add column if not exists gasto_admin_id uuid references public.gastos_admin(id) on delete set null,
  add column if not exists liq_gasto_id uuid references public.liquidaciones_gastos(id) on delete set null,
  add column if not exists registrado_por text;

-- Los talleres que ya están escritos en los arreglos pasan a la lista.
insert into public.vehiculos_talleres (empresa_id, nombre)
select distinct empresa_id, trim(taller) from public.vehiculos_mantenimientos
where taller is not null and trim(taller) <> ''
on conflict (empresa_id, nombre) do nothing;
update public.vehiculos_mantenimientos m set taller_id = t.id
from public.vehiculos_talleres t
where t.empresa_id = m.empresa_id and t.nombre = trim(m.taller) and m.taller_id is null;
