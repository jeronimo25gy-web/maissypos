-- Domicilios con la ruta (le llegan al vendedor en Mi ruta) o express (los
-- lleva un domiciliario aparte, sin Mi ruta: se manejan desde Domicilios y al
-- entregarse se registran como venta normal, que descuenta de bodega).
alter table public.domicilios
  add column if not exists tipo text not null default 'ruta' check (tipo in ('ruta', 'express')),
  add column if not exists km numeric,
  add column if not exists domiciliario text,
  add column if not exists venta_encab_id uuid references public.ventas_encab(id) on delete set null;

-- Tarifas de Distri (se cambian en configuracion).
insert into public.configuracion (empresa_id, parametro, valor)
select '025529ee-8655-459b-91a3-4a719f28c8bc', x.p, x.v
from (values ('bodega_direccion', 'Carrera 34A #71-81'), ('domi_ruta_valor', '2000'), ('domi_ruta_gratis_desde', '50000'),
             ('domi_express_base', '5000'), ('domi_express_km_incluidos', '3'), ('domi_express_km_valor', '1000'), ('domi_express_tope', '12000')) as x(p, v)
where not exists (select 1 from public.configuracion c where c.empresa_id = '025529ee-8655-459b-91a3-4a719f28c8bc' and c.parametro = x.p);
