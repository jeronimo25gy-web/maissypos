-- Gasolina de la liquidación cargada al carro que la usó: una ruta puede
-- trabajar con otro carro (se varó el suyo) o con dos el mismo día.
-- tanqueo_id: el gasto vino de un tanqueo registrado en Mi ruta (ese tanqueo
-- ya cuenta en el carro; no se suma otra vez).
alter table public.liquidaciones_gastos add column if not exists vehiculo_id uuid references public.vehiculos(id) on delete set null;
alter table public.liquidaciones_gastos add column if not exists tanqueo_id uuid references public.vehiculos_tanqueos(id) on delete set null;

-- La gasolina ya anotada queda en el carro asignado a su ruta.
update public.liquidaciones_gastos g set vehiculo_id = v.id
from public.despachos_encab d, public.vehiculos v
where g.despacho_id = d.id and v.ruta_id = d.ruta_id and v.empresa_id = g.empresa_id
  and g.vehiculo_id is null and g.sku is null and g.categoria ilike '%gasolin%'
  and (select count(*) from public.vehiculos v2 where v2.ruta_id = d.ruta_id and v2.empresa_id = g.empresa_id) = 1;
