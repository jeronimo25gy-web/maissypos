-- Saldo a favor con un proveedor: el cruce de una liquidación (Yeimer) o un pago
-- pueden ser mayores que lo que se le debe. La diferencia queda como saldo
-- negativo en facturas_proveedores (a favor de la empresa) y la siguiente compra
-- lo descuenta. Antes se bloqueaba con "es mayor que lo que se le debe".

create or replace function public._aplicar_pago_proveedor(p_empresa uuid, p_proveedor uuid, p_valor numeric)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare v_resta numeric;
begin
  perform public._sumar_deuda_proveedor(p_empresa, p_proveedor, -p_valor);
  select coalesce(sum(total_pendiente), 0) into v_resta from public.facturas_proveedores
    where proveedor_id = p_proveedor and empresa_id = p_empresa and estado = 'pendiente';
  if v_resta <= 0.5 then
    -- Todo lo comprado quedó cubierto.
    update public.compras_encab set estado = 'pagada', updated_at = now() where proveedor_id = p_proveedor and estado = 'confirmada' and empresa_id = p_empresa;
    update public.compras set estado = 'pagada' where proveedor_id = p_proveedor and estado = 'confirmada' and empresa_id = p_empresa;
  end if;
  if abs(v_resta) <= 0.5 then
    update public.facturas_proveedores set total_pendiente = 0, estado = 'pagado', updated_at = now()
      where proveedor_id = p_proveedor and empresa_id = p_empresa and estado = 'pendiente';
    v_resta := 0;
  end if;
  return v_resta;
end $$;

create or replace function public.cruzar_liquidacion_proveedor(p_despacho_id uuid, p_proveedor_id uuid, p_valor numeric, p_fecha date, p_nota text, p_usuario text)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare v_empresa uuid;
begin
  if coalesce(public.jwt_rol(), '') not in ('admin', 'auxiliar') then raise exception 'Solo administración registra cruces'; end if;
  select empresa_id into v_empresa from public.despachos_encab where id = p_despacho_id;
  if v_empresa is null or not (v_empresa = any (public.jwt_empresa_ids())) then raise exception 'Despacho no encontrado'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor_id and empresa_id = v_empresa) then raise exception 'Proveedor no válido'; end if;
  perform public.deshacer_cruce_liquidacion(p_despacho_id);
  if coalesce(p_valor, 0) <= 0 then return null; end if;
  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por, despacho_id)
  values (v_empresa, p_proveedor_id, p_fecha, p_valor, null, nullif(trim(p_nota), ''), p_usuario, p_despacho_id);
  return public._aplicar_pago_proveedor(v_empresa, p_proveedor_id, p_valor);
end $$;

create or replace function public.abonar_proveedor(p_proveedor_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text, p_compra_ids uuid[] default null, p_pagado_por uuid default null)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare
  v_empresa_id uuid; v_nombre text; v_abono_id uuid; v_resta numeric;
  v_prov_grupo uuid; v_cli record; v_esta record; v_fiado uuid;
begin
  if public.jwt_rol() <> 'admin' then raise exception 'Solo un administrador registra pagos a proveedores'; end if;
  select empresa_id, nombre into v_empresa_id, v_nombre from public.proveedores where id = p_proveedor_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Proveedor no encontrado'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;

  if p_pagado_por is not null then
    select id into v_prov_grupo from public.proveedores
      where empresa_id = v_empresa_id and empresa_grupo_id = p_pagado_por and empresa_grupo_id <> v_empresa_id limit 1;
    if v_prov_grupo is null then raise exception 'Esa empresa no está ligada como proveedor de esta'; end if;
    if v_prov_grupo = p_proveedor_id then raise exception 'Escoja una cuenta: este proveedor es la misma empresa que pagaría'; end if;
  else
    if p_cuenta_id is null then raise exception 'Selecciona de que cuenta sale el pago'; end if;
    if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = v_empresa_id) then raise exception 'Cuenta no valida'; end if;
  end if;

  if p_pagado_por is not null then
    select * into v_esta from public.empresas where id = v_empresa_id;
    select * into v_cli from public.clientes where empresa_id = p_pagado_por and empresa_grupo_id = v_empresa_id limit 1;
    if v_cli.id is null then
      insert into public.clientes (empresa_id, nombre, nit, telefono, estado, empresa_grupo_id)
      values (p_pagado_por, v_esta.nombre, v_esta.nit, v_esta.telefono, true, v_empresa_id)
      returning * into v_cli;
    end if;
    insert into public.cartera_fiados (empresa_id, cliente_id, nombre_cliente, valor_original, saldo, fecha_fiado, fecha_pago, estado, concepto)
    values (p_pagado_por, v_cli.id, v_cli.nombre, p_valor, p_valor, p_fecha, p_fecha + coalesce(nullif(v_cli.dias_credito, 0), 7), 'pendiente',
      'Pago a ' || v_nombre || ' por cuenta de ' || v_esta.nombre)
    returning id into v_fiado;
    perform public._sumar_deuda_proveedor(v_empresa_id, v_prov_grupo, p_valor);
  end if;

  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por, pagado_por_empresa_id, cartera_fiado_id)
  values (v_empresa_id, p_proveedor_id, p_fecha, p_valor, case when p_pagado_por is null then p_cuenta_id end, nullif(trim(p_nota), ''), p_usuario, p_pagado_por, v_fiado)
  returning id into v_abono_id;

  if p_compra_ids is not null and array_length(p_compra_ids, 1) > 0 then
    update public.compras_encab set estado = 'pagada', updated_at = now()
    where id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    update public.compras set estado = 'pagada'
    where compra_id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
  end if;

  v_resta := public._aplicar_pago_proveedor(v_empresa_id, p_proveedor_id, p_valor);

  if p_pagado_por is null then
    insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
    values (v_empresa_id, p_cuenta_id, p_fecha, 'salida', p_valor,
      case when v_resta <= 0 then 'Pago a ' else 'Abono a ' end || v_nombre, 'abono_proveedor', v_abono_id);
  end if;

  return v_resta;
end $$;
