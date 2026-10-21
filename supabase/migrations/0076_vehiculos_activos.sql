-- Vehículos y activos.
-- Vehículos: clase (carro o moto), compra para depreciación, preoperacional
-- diario con kilometraje (reemplaza el FR-SST-001 en papel), novedades con
-- foto, tanqueos, entregas del vehículo con fotos, plan de mantenimiento por
-- kilometraje o tiempo y arreglos con factura y garantía.
-- Conductores: licencia y carné de manipulación de alimentos con fotos y
-- vencimiento. Activos fijos con ubicación, responsable, garantía, valor y
-- su historial (mantenimientos, traslados, reparaciones y baja).

alter table vehiculos add column if not exists clase text not null default 'carro' check (clase in ('carro', 'moto'));
alter table vehiculos add column if not exists fecha_compra date;
alter table vehiculos add column if not exists valor_compra numeric;
alter table vehiculos add column if not exists vida_util_anios numeric default 10;
alter table vehiculos add column if not exists combustible text default 'gasolina';

alter table vehiculos_mantenimientos add column if not exists factura_url text;
alter table vehiculos_mantenimientos add column if not exists garantia_hasta date;
alter table vehiculos_mantenimientos add column if not exists plan_id uuid;

create table if not exists vehiculos_plan (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  tipo text not null,
  cada_km numeric,
  cada_meses numeric,
  created_at timestamptz not null default now()
);

create table if not exists vehiculos_preoperacional (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  fecha date not null,
  vendedor_id uuid references vendedores(id),
  conductor text,
  km numeric not null,
  items jsonb not null default '{}'::jsonb,
  novedades int not null default 0,
  created_at timestamptz not null default now(),
  unique (vehiculo_id, fecha)
);

create table if not exists vehiculos_novedades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  preoperacional_id uuid references vehiculos_preoperacional(id) on delete set null,
  fecha date not null,
  item text not null,
  detalle text,
  fotos jsonb not null default '[]'::jsonb,
  critica boolean not null default false,
  reportada_por text,
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  resuelta_por text,
  resuelta_at timestamptz,
  solucion text,
  created_at timestamptz not null default now()
);

create table if not exists vehiculos_tanqueos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  fecha date not null,
  km numeric,
  galones numeric,
  valor numeric not null,
  tanque_lleno boolean not null default true,
  vendedor_id uuid references vendedores(id),
  foto_url text,
  registrado_por text,
  created_at timestamptz not null default now()
);

create table if not exists vehiculos_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  fecha date not null,
  vendedor_id uuid references vendedores(id),
  conductor text,
  km numeric,
  fotos jsonb not null default '[]'::jsonb,
  notas text,
  registrado_por text,
  created_at timestamptz not null default now()
);

create table if not exists conductores_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  tipo text not null check (tipo in ('licencia', 'cma')),
  categoria text,
  numero text,
  vence date,
  fotos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (vendedor_id, tipo)
);

create table if not exists activos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  categoria text not null default 'Otro',
  marca text,
  serial text,
  ubicacion text,
  responsable text,
  fecha_compra date,
  valor_compra numeric,
  vida_util_anios numeric default 5,
  garantia_hasta date,
  estado text not null default 'en_uso' check (estado in ('en_uso', 'reparacion', 'baja')),
  baja_motivo text,
  factura_url text,
  foto_url text,
  notas text,
  proximo_mantenimiento date,
  created_at timestamptz not null default now()
);

create table if not exists activos_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  activo_id uuid not null references activos(id) on delete cascade,
  tipo text not null check (tipo in ('mantenimiento', 'reparacion', 'traslado', 'baja', 'nota')),
  fecha date not null,
  detalle text,
  costo numeric,
  desde text,
  hacia text,
  archivo_url text,
  registrado_por text,
  created_at timestamptz not null default now()
);

-- RLS: todos los de la empresa leen; el vendedor registra preoperacional,
-- novedades y tanqueos; administración edita y resuelve.
do $$
declare t text;
begin
  foreach t in array array['vehiculos_plan', 'vehiculos_preoperacional', 'vehiculos_novedades', 'vehiculos_tanqueos', 'vehiculos_entregas', 'conductores_documentos', 'activos', 'activos_eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (empresa_id = any (jwt_empresa_ids()))', t || '_select', t);
  end loop;
  foreach t in array array['vehiculos_preoperacional', 'vehiculos_novedades', 'vehiculos_tanqueos'] loop
    execute format('create policy %I on %I for insert with check (empresa_id = any (jwt_empresa_ids()))', t || '_insert', t);
  end loop;
  foreach t in array array['vehiculos_plan', 'vehiculos_entregas', 'conductores_documentos', 'activos', 'activos_eventos'] loop
    execute format('create policy %I on %I for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) in (%L, %L))', t || '_insert', t, '', 'admin', 'auxiliar');
  end loop;
  foreach t in array array['vehiculos_plan', 'vehiculos_preoperacional', 'vehiculos_novedades', 'vehiculos_tanqueos', 'vehiculos_entregas', 'conductores_documentos', 'activos', 'activos_eventos'] loop
    execute format('create policy %I on %I for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) in (%L, %L)) with check (empresa_id = any (jwt_empresa_ids()))', t || '_update', t, '', 'admin', 'auxiliar');
  end loop;
  foreach t in array array['vehiculos_plan', 'vehiculos_tanqueos', 'conductores_documentos', 'activos_eventos'] loop
    execute format('create policy %I on %I for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), %L) = %L)', t || '_delete', t, '', 'admin');
  end loop;
end $$;

-- El preoperacional actualiza el kilometraje del vehículo si es mayor.
create or replace function preoperacional_km() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update vehiculos set kilometraje_actual = new.km where id = new.vehiculo_id and coalesce(kilometraje_actual, 0) < new.km;
  return new;
end $$;
drop trigger if exists vehiculos_preoperacional_km on vehiculos_preoperacional;
create trigger vehiculos_preoperacional_km after insert on vehiculos_preoperacional for each row execute function preoperacional_km();
drop trigger if exists vehiculos_tanqueos_km on vehiculos_tanqueos;
create trigger vehiculos_tanqueos_km after insert on vehiculos_tanqueos for each row when (new.km is not null) execute function preoperacional_km();

-- Plan inicial de la van existente (cambio de aceite cada 5.000 km).
insert into vehiculos_plan (empresa_id, vehiculo_id, tipo, cada_km)
select empresa_id, id, 'Cambio de aceite', 5000 from vehiculos v
where not exists (select 1 from vehiculos_plan p where p.vehiculo_id = v.id);
