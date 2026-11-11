-- Gastos que el vendedor paga con la plata de la ruta pero que son de la
-- empresa (centro de distribución, planta, oficina): se descuentan igual de lo
-- que entrega el vendedor, pero no cuentan como costo de la ruta ni bajan su
-- comisión; en Finanzas van con los gastos de la empresa según su categoría
-- (categorias_gasto tipo admin).
alter table public.liquidaciones_gastos add column if not exists de_empresa boolean not null default false;
