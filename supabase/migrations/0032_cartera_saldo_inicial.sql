-- Cartera: permitir cargar deudas anteriores (migracion desde Excel) sin
-- inventarse una venta. Antes, la unica forma de crear cartera era una venta
-- fiada, una liquidacion o el kiosco -- todas suman ingreso y descuentan
-- inventario, lo cual es falso para una deuda que ya existia antes de usar
-- el sistema.
--
-- cliente_id: liga la deuda al cliente registrado (el chequeo de cupo de
-- credito en Ventas antes solo la encontraba via venta_id, asi que una deuda
-- migrada nunca contaba contra el cupo).
-- es_saldo_inicial: marca la deuda migrada para no contarla como "fiado
-- nuevo del dia" en Ejecutivo.

alter table public.cartera_fiados
  add column if not exists cliente_id uuid references public.clientes(id),
  add column if not exists es_saldo_inicial boolean not null default false;
