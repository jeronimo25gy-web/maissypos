-- Gastos y Nómina por empresa.
-- Gastos: clasificación de categorías (planta, fijo administrativo, distribución,
-- financiero), soporte con foto, anulación solo por admin y gastos programados.
-- Nómina: pago quincenal (comisiones y cuotas de préstamos en la segunda
-- quincena), auxilio de transporte, horas extra y recargos, riesgo ARL por
-- empleado y parámetros legales por empresa para el costo laboral.

-- Categorías de gasto
alter table categorias_gasto drop constraint if exists categorias_gasto_tipo_costo_check;
alter table categorias_gasto add constraint categorias_gasto_tipo_costo_check
  check (tipo_costo is null or tipo_costo in ('costo_fijo', 'cif', 'distribucion', 'financiero'));

-- Clasificación inicial de las categorías administrativas de Distri.
update categorias_gasto set tipo_costo = 'costo_fijo'
  where tipo = 'admin' and tipo_costo is null and nombre in ('Administrativo', 'Arriendo', 'Servicios publicos');
update categorias_gasto set tipo_costo = 'distribucion'
  where tipo = 'admin' and tipo_costo is null and nombre in ('Mantenimiento', 'Transporte');

-- Gastos: soporte y anulación
alter table gastos_admin add column if not exists soporte_url text;
alter table gastos_admin add column if not exists anulado boolean not null default false;
alter table gastos_admin add column if not exists anulado_por text;
alter table gastos_admin add column if not exists anulado_motivo text;
alter table gastos_admin add column if not exists programado_id uuid;

drop policy if exists gastos_admin_update on gastos_admin;
create policy gastos_admin_update on gastos_admin for update
  using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin')
  with check (empresa_id = any (jwt_empresa_ids()));

-- Gastos programados (arriendo, servicios, internet...)
create table if not exists gastos_programados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  categoria text not null,
  valor numeric not null default 0,
  valor_variable boolean not null default false,
  dia smallint not null check (dia between 1 and 31),
  cuenta_id uuid references cuentas(id),
  ruta_id uuid references rutas(id),
  activo boolean not null default true,
  ultimo_mes text,
  created_at timestamptz not null default now()
);
alter table gastos_admin drop constraint if exists gastos_admin_programado_fk;
alter table gastos_admin add constraint gastos_admin_programado_fk foreign key (programado_id) references gastos_programados(id) on delete set null;
alter table gastos_programados enable row level security;
create policy gastos_programados_select on gastos_programados for select using (empresa_id = any (jwt_empresa_ids()));
create policy gastos_programados_insert on gastos_programados for insert
  with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'));
create policy gastos_programados_update on gastos_programados for update
  using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'))
  with check (empresa_id = any (jwt_empresa_ids()));
create policy gastos_programados_delete on gastos_programados for delete
  using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin');

-- Empleados: nivel de riesgo ARL (I a V)
alter table empleados add column if not exists riesgo_arl smallint not null default 1 check (riesgo_arl between 1 and 5);

-- Pagos de nómina por quincena (null = pagos mensuales anteriores)
alter table nomina_pagos add column if not exists quincena smallint check (quincena in (1, 2));
alter table nomina_pagos add column if not exists auxilio_transporte numeric not null default 0;
alter table nomina_pagos add column if not exists horas_extra numeric not null default 0;
create unique index if not exists nomina_pagos_quincena_unica on nomina_pagos (empleado_id, periodo, quincena) where quincena is not null;

-- Novedades por quincena y horas extra o recargos
alter table nomina_novedades add column if not exists quincena smallint check (quincena in (1, 2));
alter table nomina_novedades add column if not exists horas numeric;
alter table nomina_novedades add column if not exists clase text;
alter table nomina_novedades drop constraint if exists nomina_novedades_tipo_check;
alter table nomina_novedades add constraint nomina_novedades_tipo_check check (tipo in ('bonificacion', 'descuento', 'horas'));

-- Parámetros legales de nómina por empresa (salario mínimo, auxilio, jornada,
-- recargos, aportes y fechas). Se guardan como JSON para ajustarlos cada año.
create table if not exists nomina_parametros (
  empresa_id uuid primary key references empresas(id),
  datos jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table nomina_parametros enable row level security;
create policy nomina_parametros_select on nomina_parametros for select using (empresa_id = any (jwt_empresa_ids()));
create policy nomina_parametros_insert on nomina_parametros for insert
  with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin');
create policy nomina_parametros_update on nomina_parametros for update
  using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') = 'admin')
  with check (empresa_id = any (jwt_empresa_ids()));
