-- Compras: marcar como pagadas todas las facturas/compras confirmadas de
-- un proveedor, como una sola transaccion atomica. Antes eran 4 escrituras
-- seguidas (facturas_proveedores, compras_encab, compras, movimientos_
-- tesoreria) sin reversa -- si alguna fallaba a mitad de camino, un
-- proveedor podia quedar marcado como pagado sin el movimiento de caja
-- correspondiente, o viceversa.

create or replace function public.marcar_proveedor_pagado(
  p_proveedor_id uuid,
  p_cuenta_pago_id uuid,
  p_total numeric,
  p_nombre_proveedor text,
  p_fecha date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.proveedores where id = p_proveedor_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then
    raise exception 'Proveedor no encontrado';
  end if;

  update public.facturas_proveedores set estado = 'pagado', updated_at = now()
  where proveedor_id = p_proveedor_id and estado = 'pendiente' and empresa_id = v_empresa_id;

  update public.compras_encab set estado = 'pagada', updated_at = now()
  where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;

  update public.compras set estado = 'pagada'
  where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;

  insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
  values (v_empresa_id, p_cuenta_pago_id, p_fecha, 'salida', p_total, 'Pago a ' || p_nombre_proveedor, 'compra', p_proveedor_id);
end;
$$;

grant execute on function public.marcar_proveedor_pagado(uuid, uuid, numeric, text, date) to authenticated;
