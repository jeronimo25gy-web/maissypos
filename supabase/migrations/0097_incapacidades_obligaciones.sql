-- Incapacidades en Nomina y obligaciones financieras en Finanzas. Solo agrega:
-- no cambia datos ni reglas de lo que ya existe.

create table if not exists public.nomina_incapacidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  empleado_id uuid not null references public.empleados(id),
  tipo text not null check (tipo in ('general', 'laboral', 'maternidad', 'paternidad')),
  desde date not null,
  hasta date not null,
  prorroga_de uuid references public.nomina_incapacidades(id),
  entidad text,
  numero text,
  soporte_url text,
  notas text,
  valor_recobro numeric not null default 0,
  cobrado numeric not null default 0,
  cobrado_fecha date,
  anulada boolean not null default false,
  registrado_por text,
  created_at timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists nomina_incapacidades_empleado on public.nomina_incapacidades (empresa_id, empleado_id, desde);

-- Lo pagado por incapacidad en cada nomina y la parte que devuelve la EPS o ARL.
alter table public.nomina_pagos add column if not exists incapacidad numeric not null default 0;
alter table public.nomina_pagos add column if not exists incapacidad_recobro numeric not null default 0;

create table if not exists public.obligaciones_financieras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  tipo text not null check (tipo in ('credito', 'vehiculo', 'leasing', 'tarjeta', 'rotativo', 'socio', 'otro')),
  entidad text not null,
  descripcion text,
  saldo_inicial numeric not null check (saldo_inicial >= 0),
  tasa_mensual numeric not null default 0 check (tasa_mensual >= 0),
  cuota numeric not null default 0 check (cuota >= 0),
  plazo_meses integer check (plazo_meses is null or plazo_meses > 0),
  fecha_inicio date not null,
  dia_pago integer check (dia_pago is null or dia_pago between 1 and 31),
  estado text not null default 'activa' check (estado in ('activa', 'pagada')),
  notas text,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists obligaciones_financieras_empresa on public.obligaciones_financieras (empresa_id, estado);

create table if not exists public.obligaciones_pagos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  obligacion_id uuid not null references public.obligaciones_financieras(id),
  fecha date not null,
  capital numeric not null default 0 check (capital >= 0),
  intereses numeric not null default 0 check (intereses >= 0),
  cuenta_id uuid references public.cuentas(id),
  notas text,
  registrado_por text,
  created_at timestamptz not null default now(),
  check (capital + intereses > 0)
);
create index if not exists obligaciones_pagos_obligacion on public.obligaciones_pagos (obligacion_id);
create index if not exists obligaciones_pagos_fecha on public.obligaciones_pagos (empresa_id, fecha);

do $$
declare t text;
begin
  foreach t in array array['nomina_incapacidades', 'obligaciones_financieras', 'obligaciones_pagos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_select on public.%I for select using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = ''admin'')', t);
    execute format('create policy admin_insert on public.%I for insert with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = ''admin'')', t);
    -- Demo vencida o cliente suspendido: solo lectura, como en todas las tablas.
    execute format('create policy solo_lectura_ins on public.%I as restrictive for insert to authenticated with check (not (select public.cliente_bloqueado()))', t);
    execute format('create policy solo_lectura_upd on public.%I as restrictive for update to authenticated using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()))', t);
    execute format('create policy solo_lectura_del on public.%I as restrictive for delete to authenticated using (not (select public.cliente_bloqueado()))', t);
  end loop;
end $$;

create policy admin_update on public.nomina_incapacidades for update using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin') with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
create policy admin_update on public.obligaciones_financieras for update using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin') with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
