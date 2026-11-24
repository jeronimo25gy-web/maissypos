-- Gastos de carro pagados en una liquidacion pero que son de otro carro:
-- ruta_id es la ruta que asume el costo (la del carro escogido). Si el gasto
-- tiene carro y ruta_id vacio, el carro no tiene ruta y va a los gastos de
-- distribucion de la empresa. Sin carro, el costo sigue en la ruta del despacho.
alter table public.liquidaciones_gastos add column if not exists ruta_id uuid references public.rutas(id) on delete set null;

-- Lo ya registrado conserva su ruta de siempre: la del despacho.
update public.liquidaciones_gastos g set ruta_id = d.ruta_id
from public.despachos_encab d
where d.id = g.despacho_id and g.vehiculo_id is not null and g.ruta_id is null;
