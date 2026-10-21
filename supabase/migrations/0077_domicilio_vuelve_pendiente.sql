-- Si el vendedor anula el ticket de un domicilio (el cliente no dejó todo),
-- el domicilio vuelve a pendiente para entregarlo de nuevo con lo que sí dejó.
drop policy if exists domicilios_vend_solo_entrega on public.domicilios;
create policy domicilios_vend_solo_entrega on public.domicilios as restrictive for update to authenticated
  using (true) with check (coalesce(jwt_rol(), '') <> 'vendedor' or estado in ('entregado', 'no_entregado') or (estado = 'pendiente' and venta_id is null));
