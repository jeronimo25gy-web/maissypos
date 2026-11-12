-- Pago a proveedor escogiendo qué compras se pagan: esas quedan pagadas aunque
-- el pago no cubra todo el saldo. Antes un pago total marcaba como pagadas
-- todas las compras pendientes, también las que entraron después de hacer la
-- cuenta con el proveedor (pasó con Arepas El Abuelo: el pago de la semana se
-- registró el sábado y se llevó la compra del viernes).
drop function if exists public.abonar_proveedor(uuid, numeric, uuid, date, text, text);
create or replace function public.abonar_proveedor(p_proveedor_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text, p_compra_ids uuid[] default null)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare
  v_empresa_id uuid; v_nombre text; v_factura_id uuid; v_pendiente numeric; v_abono_id uuid; v_resta numeric;
begin
  if public.jwt_rol() <> 'admin' then raise exception 'Solo un administrador registra pagos a proveedores'; end if;
  select empresa_id, nombre into v_empresa_id, v_nombre from public.proveedores where id = p_proveedor_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Proveedor no encontrado'; end if;
  if p_cuenta_id is null then raise exception 'Selecciona de que cuenta sale el pago'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = v_empresa_id) then raise exception 'Cuenta no valida'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;

  select id, total_pendiente into v_factura_id, v_pendiente from public.facturas_proveedores
  where proveedor_id = p_proveedor_id and empresa_id = v_empresa_id and estado = 'pendiente' limit 1 for update;
  if v_factura_id is null then raise exception 'Este proveedor no tiene saldo pendiente'; end if;
  if p_valor > coalesce(v_pendiente, 0) + 0.5 then
    raise exception 'El abono ($%) es mayor que lo que se debe ($%)', p_valor, v_pendiente;
  end if;

  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por)
  values (v_empresa_id, p_proveedor_id, p_fecha, p_valor, p_cuenta_id, nullif(trim(p_nota), ''), p_usuario)
  returning id into v_abono_id;

  -- Las compras escogidas quedan pagadas.
  if p_compra_ids is not null and array_length(p_compra_ids, 1) > 0 then
    update public.compras_encab set estado = 'pagada', updated_at = now()
    where id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    update public.compras set estado = 'pagada'
    where compra_id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
  end if;

  v_resta := greatest(coalesce(v_pendiente, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.facturas_proveedores set total_pendiente = 0, estado = 'pagado', updated_at = now() where id = v_factura_id;
    update public.compras_encab set estado = 'pagada', updated_at = now()
    where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    update public.compras set estado = 'pagada'
    where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    v_resta := 0;
  else
    update public.facturas_proveedores set total_pendiente = v_resta, updated_at = now() where id = v_factura_id;
  end if;

  insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
  values (v_empresa_id, p_cuenta_id, p_fecha, 'salida', p_valor,
    case when v_resta = 0 then 'Pago a ' else 'Abono a ' end || v_nombre, 'abono_proveedor', v_abono_id);

  return v_resta;
end $$;
grant execute on function public.abonar_proveedor(uuid, numeric, uuid, date, text, text, uuid[]) to authenticated;
