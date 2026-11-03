-- Productos que se venden por mitades (0,5): la canasta de huevos, la arepa para
-- rellenar… Se marca en Maestros, Productos.
alter table public.productos add column if not exists por_mitades boolean not null default false;
update public.productos set por_mitades = true where sku like 'HUE-%';
