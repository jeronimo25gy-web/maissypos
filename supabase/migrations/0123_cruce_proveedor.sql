-- Cruce con proveedor: un vendedor que también es proveedor (Yeimer) paga su
-- liquidación con lo que la empresa le debe. Se configura en Maestros
-- (vendedores.proveedor_cruce_id); en la liquidación el valor del cruce cuenta
-- como plata entregada y queda como abono al proveedor, sin mover caja.
alter table public.vendedores add column if not exists proveedor_cruce_id uuid references public.proveedores(id);
alter table public.liquidaciones_detalle add column if not exists cruce_proveedor numeric not null default 0;
alter table public.abonos_proveedores add column if not exists despacho_id uuid references public.despachos_encab(id);

-- Deshace el cruce guardado de una liquidación: devuelve el valor a la deuda
-- con el proveedor y borra el abono.
create or replace function public.deshacer_cruce_liquidacion(p_despacho_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a record; v_factura uuid;
begin
  for a in select * from public.abonos_proveedores where despacho_id = p_despacho_id and empresa_id = any (public.jwt_empresa_ids()) loop
    select id into v_factura from public.facturas_proveedores
      where proveedor_id = a.proveedor_id and empresa_id = a.empresa_id and estado = 'pendiente' limit 1 for update;
    if v_factura is null then
      select id into v_factura from public.facturas_proveedores
        where proveedor_id = a.proveedor_id and empresa_id = a.empresa_id order by updated_at desc limit 1 for update;
    end if;
    if v_factura is null then
      insert into public.facturas_proveedores (empresa_id, proveedor_id, total_pendiente, estado) values (a.empresa_id, a.proveedor_id, a.valor, 'pendiente');
    else
      update public.facturas_proveedores set total_pendiente = coalesce(total_pendiente, 0) + a.valor, estado = 'pendiente', updated_at = now() where id = v_factura;
    end if;
    delete from public.abonos_proveedores where id = a.id;
  end loop;
end $$;

-- Registra el cruce de una liquidación (reemplaza el que hubiera).
create or replace function public.cruzar_liquidacion_proveedor(p_despacho_id uuid, p_proveedor_id uuid, p_valor numeric, p_fecha date, p_nota text, p_usuario text)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare v_empresa uuid; v_factura uuid; v_pendiente numeric; v_resta numeric;
begin
  if coalesce(public.jwt_rol(), '') not in ('admin', 'auxiliar') then raise exception 'Solo administración registra cruces'; end if;
  select empresa_id into v_empresa from public.despachos_encab where id = p_despacho_id;
  if v_empresa is null or not (v_empresa = any (public.jwt_empresa_ids())) then raise exception 'Despacho no encontrado'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor_id and empresa_id = v_empresa) then raise exception 'Proveedor no válido'; end if;
  perform public.deshacer_cruce_liquidacion(p_despacho_id);
  if coalesce(p_valor, 0) <= 0 then return null; end if;
  select id, total_pendiente into v_factura, v_pendiente from public.facturas_proveedores
    where proveedor_id = p_proveedor_id and empresa_id = v_empresa and estado = 'pendiente' limit 1 for update;
  if v_factura is null or p_valor > coalesce(v_pendiente, 0) + 0.5 then
    raise exception 'El cruce ($%) es mayor que lo que se le debe al proveedor ($%)', p_valor, coalesce(v_pendiente, 0);
  end if;
  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por, despacho_id)
  values (v_empresa, p_proveedor_id, p_fecha, p_valor, null, nullif(trim(p_nota), ''), p_usuario, p_despacho_id);
  v_resta := greatest(coalesce(v_pendiente, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.facturas_proveedores set total_pendiente = 0, estado = 'pagado', updated_at = now() where id = v_factura;
    update public.compras_encab set estado = 'pagada', updated_at = now() where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa;
    update public.compras set estado = 'pagada' where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa;
    v_resta := 0;
  else
    update public.facturas_proveedores set total_pendiente = v_resta, updated_at = now() where id = v_factura;
  end if;
  return v_resta;
end $$;
