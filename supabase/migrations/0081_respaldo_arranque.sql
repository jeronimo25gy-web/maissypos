-- Copia de los saldos de prueba antes de limpiarlos para el arranque del 2 de noviembre.
-- La tabla tiene RLS sin politicas: no se ve desde la app, solo desde la base.
create table if not exists respaldo_arranque (
  id bigserial primary key,
  tabla text not null,
  fila jsonb not null,
  respaldado_en timestamptz not null default now()
);
alter table respaldo_arranque enable row level security;
insert into respaldo_arranque (tabla, fila)
  select 'cartera_fiados', to_jsonb(t) from cartera_fiados t
  union all select 'abonos_cartera', to_jsonb(t) from abonos_cartera t
  union all select 'liquidaciones_fiados', to_jsonb(t) from liquidaciones_fiados t where cartera_fiados_id is not null
  union all select 'consumos_empleado', to_jsonb(t) from consumos_empleado t
  union all select 'facturas_proveedores', to_jsonb(t) from facturas_proveedores t
  union all select 'abonos_proveedores', to_jsonb(t) from abonos_proveedores t
  union all select 'compras_encab', to_jsonb(t) from compras_encab t where estado_pago = 'cuenta_por_pagar';
