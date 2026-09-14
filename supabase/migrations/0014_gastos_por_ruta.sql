-- Gastos Admin no tenia forma de asignarse a una ruta especifica -- solo
-- existian los "gastos de ruta" del dia a dia (liquidaciones_gastos,
-- capturados durante el cuadre de caja en Kiosco/Liquidacion). Para gastos
-- recurrentes o administrativos que si le pertenecen a una ruta puntual
-- (ej. un seguro, un arriendo de punto de venta, algo que no es del cuadre
-- diario), se agrega un ruta_id opcional.

alter table public.gastos_admin
  add column if not exists ruta_id uuid references public.rutas(id);
