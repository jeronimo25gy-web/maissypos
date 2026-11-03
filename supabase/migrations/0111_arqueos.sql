-- Arqueo de cuentas: lo que dice el sistema contra lo que se contó (efectivo,
-- a diario) o lo que dice el banco (los lunes). Si no cuadra, la diferencia se
-- carga al encargado de la cuenta (descuento de nómina) o se ajusta con motivo.
alter table public.cuentas add column if not exists responsable_empleado_id uuid references public.empleados(id);
create table if not exists public.arqueos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cuenta_id uuid not null references public.cuentas(id),
  fecha date not null,
  saldo_sistema numeric not null,
  saldo_contado numeric not null,
  diferencia numeric not null,
  decision text not null check (decision in ('cuadra', 'cargo', 'ajuste')),
  empleado_id uuid references public.empleados(id),
  motivo text,
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists arqueos_cuenta_fecha on public.arqueos (cuenta_id, fecha desc);
alter table public.arqueos enable row level security;
create policy empresa_id_select on public.arqueos for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.arqueos for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'));
create policy suspendido_sin_lectura on public.arqueos as restrictive for select using (not (select cliente_suspendido()));
create policy solo_lectura_ins on public.arqueos as restrictive for insert with check (not (select cliente_bloqueado()));
