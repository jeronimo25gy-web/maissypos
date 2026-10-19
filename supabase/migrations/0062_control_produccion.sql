-- Control de produccion (Arepas Maissy): el "lote de coccion" es el maiz que
-- se cocina junto en un tanque. Se monta en el turno, se apaga y reposa en el
-- tanque hasta la madrugada, se saca, se muele, se troquela, se asa y se
-- empaca. Se registra desde la planta (tablet arriba, celular abajo, monitor
-- abajo). Regla: todo numero sale de una medicion; lo no medido queda vacio.
--
-- Se extienden las tablas de produccion que ya existen (no tablas paralelas):
--   produccion_cochadas      -> el lote de coccion (tanque, horas, agua...)
--   produccion_muestras_peso -> cada registro de la planta (pesos, cambios de
--                               referencia, paquetes, reproceso, desecho...)
--   produccion_lotes         -> lo que pasa a bodega, ligado a su lote
-- Nuevas y pequenas: tanques y produccion_estandares. Rol nuevo: planta.

-- Tanques ------------------------------------------------------------------
create table if not exists public.tanques (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nombre text not null,
  capacidad_bultos numeric(6,2) not null check (capacidad_bultos > 0),
  con_presion boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.tanques enable row level security;
create policy empresa_id_select on public.tanques for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.tanques for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'));
create policy empresa_id_update on public.tanques for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar')) with check (empresa_id = any (jwt_empresa_ids()));

insert into public.tanques (empresa_id, nombre, capacidad_bultos, con_presion, orden)
select e.id, t.nombre, t.cap, t.presion, t.orden
from (values ('aef04001-a941-4ad3-bd22-397a76ffc17d'::uuid), ('00000000-0000-4000-a000-0000000000a1'::uuid)) e(id)
cross join (values ('Tanque 8 bultos', 8, true, 1), ('Tanque 6 bultos', 6, false, 2), ('Tanque 4 bultos', 4, false, 3)) t(nombre, cap, presion, orden)
where exists (select 1 from public.empresas x where x.id = e.id)
  and not exists (select 1 from public.tanques y where y.empresa_id = e.id);

-- Lote de coccion -----------------------------------------------------------
-- Las cochadas que ya existian quedan cerradas (estado por defecto).
alter table public.produccion_cochadas
  add column if not exists tanque_id uuid references public.tanques(id),
  add column if not exists compra_maiz_id uuid references public.compras(id),
  add column if not exists estado text not null default 'cerrado' check (estado in ('abierto', 'cerrado')),
  add column if not exists hora_montada timestamptz,
  add column if not exists hora_apagado timestamptz,
  add column if not exists hora_sacada timestamptz,
  add column if not exists agua_l numeric(8,2),
  add column if not exists conservante_g numeric(8,2),
  add column if not exists temperatura_c numeric(5,1),
  add column if not exists textura smallint check (textura between 1 and 5),
  add column if not exists textura_foto text,
  add column if not exists testigos jsonb, -- [{"pos":"abajo","kg":1.58}, ...]
  add column if not exists notas text,
  add column if not exists cerrado_at timestamptz,
  add column if not exists cerrado_por text;
create index if not exists produccion_cochadas_abiertas on public.produccion_cochadas (empresa_id) where estado = 'abierto';

-- Registros de la planta ----------------------------------------------------
-- tipo: empacado_lote (los de antes: pesos de paquetes al registrar un lote),
--   crudo (5 arepas en troqueladora), merma (10 arepas: crudas, al salir del
--   horno, frias), paquete (revision del dia en empaque), bola (kg de masa),
--   cambio_ref (troqueladora cambia de referencia), llego_ref (empaque recibe
--   la referencia nueva), empaque (paquetes contados, puede ser negativo para
--   corregir), reproceso (kg + motivo), desecho (kg), aceite (recarga del
--   atomizador).
alter table public.produccion_muestras_peso
  alter column lote_id drop not null,
  alter column producto_id drop not null,
  alter column pesos_individuales drop not null,
  alter column peso_promedio_g drop not null,
  add column if not exists cochada_id uuid references public.produccion_cochadas(id),
  add column if not exists tipo text not null default 'empacado_lote',
  add column if not exists cantidad numeric(12,3),
  add column if not exists motivo text,
  add column if not exists puesto text,
  add column if not exists registrado_por text,
  add column if not exists anulado boolean not null default false,
  add column if not exists hora timestamptz not null default now();
alter table public.produccion_muestras_peso drop constraint if exists produccion_muestras_peso_tipo_check;
alter table public.produccion_muestras_peso add constraint produccion_muestras_peso_tipo_check
  check (tipo in ('empacado_lote', 'crudo', 'merma', 'paquete', 'bola', 'cambio_ref', 'llego_ref', 'empaque', 'reproceso', 'desecho', 'aceite'));
create index if not exists produccion_muestras_cochada on public.produccion_muestras_peso (cochada_id, tipo, hora);
-- Un registro mal hecho se anula, no se borra.
drop policy if exists empresa_id_update on public.produccion_muestras_peso;
create policy empresa_id_update on public.produccion_muestras_peso
  for update using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()));

alter table public.produccion_lotes
  add column if not exists cochada_id uuid references public.produccion_cochadas(id);
create index if not exists produccion_lotes_cochada on public.produccion_lotes (cochada_id);

-- Estandares ----------------------------------------------------------------
-- Valores que el admin fija cuando ya hay datos (o que se saben de antemano,
-- como la dosis de conservante por tanque). clave: conservante_g (por tanque),
-- tiempo_coccion_min (por tanque), tiempo_caida_min, atomizador_ml,
-- peso_crudo_g (por producto), merma_pct (por producto), telas_por_bulto,
-- peso_bulto_kg, absorcion_pct.
create table if not exists public.produccion_estandares (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  clave text not null,
  tanque_id uuid references public.tanques(id),
  producto_id uuid references public.productos(id),
  valor numeric not null,
  estado text not null default 'provisional' check (estado in ('provisional', 'fijo')),
  nota text,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
create unique index if not exists produccion_estandares_unico on public.produccion_estandares
  (empresa_id, clave, coalesce(tanque_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(producto_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.produccion_estandares enable row level security;
create policy empresa_id_select on public.produccion_estandares for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.produccion_estandares for insert with check (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'));
create policy empresa_id_update on public.produccion_estandares for update using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar')) with check (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_delete on public.produccion_estandares for delete using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') in ('admin', 'auxiliar'));

-- Rol planta: entra directo a Control de produccion -------------------------
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check check (rol in ('admin', 'auxiliar', 'vendedor', 'planta'));

-- Pasar a bodega ------------------------------------------------------------
-- Lo empacado de un lote de coccion que todavia no ha entrado al inventario
-- (paquetes contados menos lo que ya paso a bodega) entra como un lote de
-- produccion con su detalle y sus movimientos, igual que el registro manual
-- de Produccion ("Produccion: <formula>", fecha del dia en Bogota). Si se
-- llama dos veces no duplica: la segunda no encuentra nada pendiente.
create or replace function public.produccion_pasar_a_bodega(p_cochada_id uuid, p_usuario text)
returns int
language plpgsql
security invoker
as $$
declare
  v_empresa uuid;
  v_fecha date := (now() at time zone 'America/Bogota')::date;
  v_lote uuid;
  v_n int := 0;
  r record;
  d record;
begin
  select empresa_id into v_empresa from public.produccion_cochadas where id = p_cochada_id;
  if v_empresa is null then raise exception 'Lote de coccion no encontrado'; end if;

  for r in
    with contado as (
      select producto_id, sum(cantidad) as cant
      from public.produccion_muestras_peso
      where cochada_id = p_cochada_id and tipo = 'empaque' and not anulado and producto_id is not null
      group by producto_id
    ), pasado as (
      select f.producto_id, sum(pd.cantidad_producida) as cant
      from public.produccion_lotes pl
      join public.produccion_detalle pd on pd.lote_id = pl.id
      join public.formulas f on f.id = pd.formula_id
      where pl.cochada_id = p_cochada_id
      group by f.producto_id
    )
    select c.producto_id, c.cant - coalesce(p.cant, 0) as pendiente,
           (select f.id from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as formula_id,
           (select f.nombre from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as formula_nombre,
           (select f.rendimiento from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as rendimiento,
           pr.sku
    from contado c
    left join pasado p on p.producto_id = c.producto_id
    join public.productos pr on pr.id = c.producto_id
    where c.cant - coalesce(p.cant, 0) > 0
  loop
    if r.formula_id is null then
      raise exception 'El producto % no tiene formula activa', r.sku;
    end if;
    if v_lote is null then
      insert into public.produccion_lotes (empresa_id, fecha, cochada_id, observaciones)
      values (v_empresa, v_fecha, p_cochada_id, 'Desde Control de produccion · ' || coalesce(p_usuario, ''))
      returning id into v_lote;
    end if;
    insert into public.produccion_detalle (empresa_id, lote_id, formula_id, cantidad_producida)
    values (v_empresa, v_lote, r.formula_id, r.pendiente);
    insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    values (v_empresa, r.sku, r.pendiente, v_fecha, 'entrada', 'Producción: ' || r.formula_nombre);
    -- Materias primas por formula (las de cochada, como el maiz, ya salieron al montar).
    for d in
      select fd.cantidad, mp.sku
      from public.formulas_detalle fd
      join public.productos mp on mp.id = fd.materia_prima_id
      where fd.formula_id = r.formula_id and not mp.consumo_por_cochada
    loop
      insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      values (v_empresa, d.sku, d.cantidad * r.pendiente / nullif(r.rendimiento, 0), v_fecha, 'salida', 'Producción: ' || r.formula_nombre);
    end loop;
    v_n := v_n + r.pendiente::int;
  end loop;
  return v_n;
end;
$$;
