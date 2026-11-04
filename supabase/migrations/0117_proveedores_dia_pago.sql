-- Cómo se le paga a cada proveedor: a un plazo en días (como antes), cada
-- semana un día fijo, cada quincena (15 y último día) o cada mes un día fijo.
-- Lo comprado antes de ese día vence ese día.
alter table public.proveedores add column if not exists pago_frecuencia text not null default 'plazo'
  check (pago_frecuencia in ('plazo', 'semanal', 'quincenal', 'mensual'));
alter table public.proveedores add column if not exists pago_dia integer check (pago_dia between 1 and 31);
