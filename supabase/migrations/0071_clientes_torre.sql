-- Torre del apartamento en unidades con varias torres: en el rutero y en Mi
-- ruta los apartamentos de un edificio salen agrupados por torre.
alter table public.clientes add column if not exists torre text;
