-- Compras: aplicar los efectos de confirmar/pagar una compra (entrada de
-- inventario, saldo del proveedor, movimiento de caja) como una sola
-- transaccion atomica -- mismo patron que aprobar_divergencia_inventario
-- (migracion 0017). Antes eran 3 escrituras seguidas desde el cliente:
-- si la segunda o tercera fallaba, la compra quedaba con inventario
-- sumado pero sin saldo de proveedor actualizado (o viceversa), sin
-- ningun rastro de que algo quedo a medias.
--
-- Solo cubre este bloque de efectos, no el guardado del encabezado/detalle
-- de la compra en si (eso sigue igual) -- si ese guardado falla a medias,
-- el resultado es una compra incompleta en borrador, visible y corregible
-- editandola; no genera movimientos de dinero o inventario fantasma, que
-- es el riesgo real que esto cierra.

create or replace function public.aplicar_efectos_compra(
  p_compra_id uuid,
  p_proveedor_id uuid,
  p_proveedor_nombre text,
  p_estado_final text,
  p_total numeric,
  p_fecha date,
  p_items jsonb,
  p_cuenta_pago_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_item jsonb;
  v_factura_id uuid;
  v_factura_pendiente numeric;
begin
  select empresa_id into v_empresa_id from public.compras_encab where id = p_compra_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then
    raise exception 'Compra no encontrada';
  end if;
  if p_estado_final not in ('confirmada', 'pagada') then
    raise exception 'Estado invalido: %', p_estado_final;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    values (
      v_empresa_id, v_item->>'sku', (v_item->>'cantidad')::numeric, p_fecha,
      'entrada', 'Compra a ' || p_proveedor_nombre
    );
  end loop;

  if p_estado_final = 'confirmada' then
    select id, total_pendiente into v_factura_id, v_factura_pendiente
    from public.facturas_proveedores
    where proveedor_id = p_proveedor_id and empresa_id = v_empresa_id and estado = 'pendiente'
    limit 1;

    if v_factura_id is not null then
      update public.facturas_proveedores
      set total_pendiente = coalesce(v_factura_pendiente, 0) + p_total, updated_at = now()
      where id = v_factura_id;
    else
      insert into public.facturas_proveedores (empresa_id, proveedor_id, total_pendiente, estado)
      values (v_empresa_id, p_proveedor_id, p_total, 'pendiente');
    end if;
  elsif p_estado_final = 'pagada' then
    insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
    values (v_empresa_id, p_cuenta_pago_id, p_fecha, 'salida', p_total, 'Compra pagada a ' || p_proveedor_nombre, 'compra', p_compra_id);
  end if;
end;
$$;

grant execute on function public.aplicar_efectos_compra(uuid, uuid, text, text, numeric, date, jsonb, uuid) to authenticated;
