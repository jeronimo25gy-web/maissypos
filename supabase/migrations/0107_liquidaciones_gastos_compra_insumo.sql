-- Compra de un insumo pagada con la plata de la ruta: se registra en la
-- liquidación (la plata cuadra), entra al inventario y no cuenta como gasto.
alter table public.liquidaciones_gastos add column if not exists sku text;
alter table public.liquidaciones_gastos add column if not exists cantidad numeric;
