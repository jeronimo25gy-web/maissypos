-- Ubicación de clientes más confiable. Antes la primera venta o visita dejaba
-- el punto para siempre, aunque el vendedor la registrara caminando hacia la
-- casa siguiente (las ventas ni siquiera traían la precisión del GPS) y no
-- había forma de corregirla. Desde ahora:
--   1. Solo cuentan puntos con precisión conocida de 50 m o menos.
--   2. Con 3 o más puntos buenos, la ubicación pasa a ser la mediana de ellos
--      (donde casi siempre lo atienden), y se corrige sola con cada visita.
--   3. La ubicación fijada a mano (vendedor en la entrada o admin en el mapa
--      de Rutas) es 'manual' y las visitas ya no la cambian.

create or replace function public.ubicacion_cliente_recalcular(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int; v_lat double precision; v_lng double precision;
begin
  with puntos as (
    select lat, lng from public.visitas_ruta where cliente_id = p_cliente and lat is not null and precision_m is not null and precision_m <= 50
    union all
    select lat, lng from public.ventas_ruta where cliente_id = p_cliente and lat is not null and precision_m is not null and precision_m <= 50 and estado = 'activa'
  )
  select count(*), percentile_cont(0.5) within group (order by lat), percentile_cont(0.5) within group (order by lng)
  into v_n, v_lat, v_lng from puntos;

  if v_n >= 3 then
    update public.clientes set lat = v_lat, lng = v_lng, ubicacion_fuente = 'visita', ubicacion_at = now()
    where id = p_cliente and coalesce(ubicacion_fuente, '') <> 'manual';
  end if;
end $$;

create or replace function public.ubicacion_cliente_desde_ruta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is null or new.lat is null or new.precision_m is null or new.precision_m > 50 then
    return new;
  end if;
  -- Sin ubicación todavía: el primer punto bueno.
  update public.clientes set lat = new.lat, lng = new.lng, ubicacion_fuente = 'visita', ubicacion_at = now()
  where id = new.cliente_id and lat is null and empresa_id = new.empresa_id;
  -- Con varios puntos buenos: la mediana (si no fue fijada a mano).
  perform public.ubicacion_cliente_recalcular(new.cliente_id);
  return new;
end $$;

-- Los triggers de 0083 siguen apuntando a esta función; no cambian.

-- Una sola vez: recalcular los que ya tienen 3 o más puntos buenos (corrige
-- los que quedaron corridos con la primera venta).
do $$
declare r record;
begin
  for r in
    select cliente_id from (
      select cliente_id from public.visitas_ruta where cliente_id is not null and lat is not null and precision_m <= 50
      union all
      select cliente_id from public.ventas_ruta where cliente_id is not null and lat is not null and precision_m <= 50 and estado = 'activa'
    ) p group by cliente_id having count(*) >= 3
  loop
    perform public.ubicacion_cliente_recalcular(r.cliente_id);
  end loop;
end $$;
