-- Gastos de la oficina que son de un carro (gasolina que se le da al
-- vendedor antes de salir, seguro, parqueadero): quedan en la ruta y en el
-- carro, y suman al costo del carro en Vehículos.
alter table public.gastos_admin add column if not exists vehiculo_id uuid references public.vehiculos(id) on delete set null;

-- Los ya registrados que dicen la placa en la descripción.
update public.gastos_admin g set vehiculo_id = v.id
from public.vehiculos v
where g.vehiculo_id is null and v.empresa_id = g.empresa_id and g.descripcion ilike '%' || v.placa || '%';
