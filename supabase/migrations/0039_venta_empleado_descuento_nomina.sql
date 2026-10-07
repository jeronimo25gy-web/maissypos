-- Venta a empleado pagada por descuento de nomina: queda ligada al empleado
-- (ventas_encab.empleado_id) y genera consumos_empleado, que Nomina descuenta
-- en el mes como "Productos". No entra a caja ni a cartera.

alter table public.ventas_encab drop constraint if exists ventas_encab_forma_pago_check;
alter table public.ventas_encab add constraint ventas_encab_forma_pago_check
  check (forma_pago = any (array['efectivo', 'transferencia', 'fiado', 'nomina']));

alter table public.ventas_encab add column if not exists empleado_id uuid references public.empleados(id);
alter table public.consumos_empleado add column if not exists venta_id uuid references public.ventas_encab(id);
