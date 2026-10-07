-- Nomina mas completa: bonificaciones y descuentos manuales por mes,
-- prestamos a empleados con cuotas mensuales (saldo e historial de abonos),
-- y colilla con devengados/deducciones detallados.

alter table public.empleados add column if not exists documento text;

alter table public.nomina_pagos
  add column if not exists total_bonificaciones numeric not null default 0,
  add column if not exists detalle jsonb,
  add column if not exists cuenta_id uuid references public.cuentas(id);

-- Bonificaciones (+) y descuentos (-) que se agregan a mano para un mes.
create table if not exists public.nomina_novedades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  empleado_id uuid not null references public.empleados(id),
  periodo text not null,
  tipo text not null check (tipo in ('bonificacion', 'descuento')),
  concepto text not null,
  valor numeric not null check (valor > 0),
  salarial boolean not null default false,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists nomina_novedades_periodo on public.nomina_novedades (empresa_id, periodo);

-- Prestamos de la empresa a un empleado, descontados por cuotas en nomina.
create table if not exists public.nomina_prestamos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  empleado_id uuid not null references public.empleados(id),
  fecha date not null,
  monto numeric not null check (monto > 0),
  num_cuotas integer not null check (num_cuotas > 0),
  valor_cuota numeric not null check (valor_cuota > 0),
  concepto text,
  cuenta_id uuid references public.cuentas(id),
  estado text not null default 'activo' check (estado in ('activo', 'pagado')),
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists nomina_prestamos_empleado on public.nomina_prestamos (empresa_id, empleado_id);

create table if not exists public.nomina_prestamos_abonos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  prestamo_id uuid not null references public.nomina_prestamos(id),
  periodo text,
  fecha date not null,
  valor numeric not null check (valor > 0),
  origen text not null check (origen in ('nomina', 'manual')),
  nomina_pago_id uuid references public.nomina_pagos(id),
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists nomina_prestamos_abonos_prestamo on public.nomina_prestamos_abonos (prestamo_id);

alter table public.nomina_novedades enable row level security;
alter table public.nomina_prestamos enable row level security;
alter table public.nomina_prestamos_abonos enable row level security;

-- Nomina es solo de admin (igual que el modulo).
create policy admin_select on public.nomina_novedades for select using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
create policy admin_insert on public.nomina_novedades for insert with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
-- Se puede quitar una novedad mientras el mes no se haya pagado (lo valida la app).
create policy admin_delete on public.nomina_novedades for delete using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');

create policy admin_select on public.nomina_prestamos for select using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
create policy admin_insert on public.nomina_prestamos for insert with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
create policy admin_update on public.nomina_prestamos for update using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin') with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');

create policy admin_select on public.nomina_prestamos_abonos for select using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
create policy admin_insert on public.nomina_prestamos_abonos for insert with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
