-- Ubicación de cada cliente para el mapa de la ruta. Sale del GPS del celular
-- la primera vez que el vendedor le vende o lo visita (o se fija a mano en la
-- puerta); no se adivina desde el texto de la dirección.
alter table public.clientes add column if not exists lat double precision;
alter table public.clientes add column if not exists lng double precision;
alter table public.clientes add column if not exists ubicacion_fuente text;
alter table public.clientes add column if not exists ubicacion_at timestamptz;
alter table public.clientes drop constraint if exists clientes_ubicacion_fuente_check;
alter table public.clientes add constraint clientes_ubicacion_fuente_check check (ubicacion_fuente in ('visita', 'manual'));

-- Lo que ya hay: el punto más preciso de sus visitas y ventas (hasta 150 m de error).
with puntos as (
  select cliente_id, lat, lng, precision_m, created_at from public.visitas_ruta where cliente_id is not null and lat is not null
  union all
  select cliente_id, lat, lng, null::double precision, created_at from public.ventas_ruta where cliente_id is not null and lat is not null
), mejor as (
  select distinct on (cliente_id) cliente_id, lat, lng, created_at from puntos
  where coalesce(precision_m, 0) <= 150
  order by cliente_id, coalesce(precision_m, 999), created_at desc
)
update public.clientes c set lat = m.lat, lng = m.lng, ubicacion_fuente = 'visita', ubicacion_at = m.created_at
from mejor m where c.id = m.cliente_id and c.lat is null;

-- De aquí en adelante: la primera visita o venta con buen GPS deja la ubicación.
create or replace function public.ubicacion_cliente_desde_ruta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and new.lat is not null and coalesce(new.precision_m, 0) <= 150 then
    update public.clientes set lat = new.lat, lng = new.lng, ubicacion_fuente = 'visita', ubicacion_at = now()
    where id = new.cliente_id and lat is null and empresa_id = new.empresa_id;
  end if;
  return new;
end $$;

drop trigger if exists ubicacion_cliente_visita on public.visitas_ruta;
create trigger ubicacion_cliente_visita after insert or update of lat on public.visitas_ruta for each row execute function public.ubicacion_cliente_desde_ruta();
drop trigger if exists ubicacion_cliente_venta on public.ventas_ruta;
create trigger ubicacion_cliente_venta after insert or update of lat on public.ventas_ruta for each row execute function public.ubicacion_cliente_desde_ruta();
