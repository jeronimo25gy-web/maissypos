-- Carga de qué día lleva un despacho (0 domingo … 6 sábado). Después de un
-- festivo, un punto de venta sale con la carga del lunes y la del martes en
-- despachos separados; así los registros semanales siguen por día de carga.
-- Vacío: la carga del día del despacho.
alter table public.despachos_encab add column if not exists dia_carga smallint check (dia_carga between 0 and 6);
