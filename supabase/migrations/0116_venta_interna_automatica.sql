-- Venta automática entre empresas del grupo: cuando una empresa confirma una
-- compra a un proveedor que es otra empresa del grupo (Distri le compra a
-- Arepas), en la empresa que vende queda la venta a crédito con su salida de
-- inventario y su cartera. Una corrección de la compra ajusta la venta.
alter table public.proveedores add column if not exists empresa_grupo_id uuid references public.empresas(id);
alter table public.clientes add column if not exists empresa_grupo_id uuid references public.empresas(id);
alter table public.ventas_encab add column if not exists compra_origen_id uuid unique references public.compras_encab(id);

update public.proveedores set empresa_grupo_id = 'aef04001-a941-4ad3-bd22-397a76ffc17d'
where id = '29f97cb1-c640-4814-8089-ba192816ba13';
update public.clientes set empresa_grupo_id = '025529ee-8655-459b-91a3-4a719f28c8bc'
where id = 'db88d60f-a160-4b8b-be20-971ee53cc9f9';

create or replace function public._sincronizar_venta_interna(p_compra_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  c record; v_vende uuid; v_compra_empresa record; v_cli record; v_venta record;
  v_total numeric; v_dif numeric; v_ref text; v_fecha_pago date; r record;
begin
  select e.*, p.empresa_grupo_id, p.nombre prov_nombre into c
  from compras_encab e join proveedores p on p.id = e.proveedor_id where e.id = p_compra_id;
  if c.id is null or c.empresa_grupo_id is null or c.empresa_grupo_id = c.empresa_id then return null; end if;
  v_vende := c.empresa_grupo_id;
  select * into v_venta from ventas_encab where compra_origen_id = p_compra_id;

  -- Lo comprado, con la referencia de la empresa que vende (producto espejo).
  create temp table if not exists _vi_lineas (sku text, cantidad numeric, precio numeric) on commit drop;
  delete from _vi_lineas;
  insert into _vi_lineas
  select pv.sku, sum(co.cantidad), max(co.precio_unitario)
  from compras co
  join productos pc on pc.empresa_id = co.empresa_id and pc.sku = co.sku
  join productos pv on pv.id = pc.producto_espejo_id and pv.empresa_id = v_vende
  where co.compra_id = p_compra_id and co.cantidad > 0
  group by pv.sku;

  -- Compra que ya no está confirmada (o sin productos): la venta se anula.
  if c.estado not in ('confirmada', 'pagada') or not exists (select 1 from _vi_lineas) then
    if v_venta.id is not null and v_venta.estado <> 'anulada' then
      v_ref := 'Anulación venta CV-' || lpad(v_venta.numero::text, 8, '0');
      insert into inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      select v_vende, sku, cantidad, c.fecha, 'entrada', v_ref from ventas_detalle where venta_id = v_venta.id;
      update ventas_encab set estado = 'anulada', anulada_at = now(), anulada_por = 'Sistema', motivo_anulacion = 'Compra de ' || (select nombre from empresas where id = c.empresa_id) || ' anulada' where id = v_venta.id;
      update cartera_fiados set estado = 'anulado', saldo = 0 where venta_id = v_venta.id and saldo = valor_original;
    end if;
    return v_venta.id;
  end if;

  select sum(cantidad * precio) into v_total from _vi_lineas;

  if v_venta.id is null then
    select * into v_compra_empresa from empresas where id = c.empresa_id;
    select * into v_cli from clientes where empresa_id = v_vende and empresa_grupo_id = c.empresa_id limit 1;
    if v_cli.id is null then
      insert into clientes (empresa_id, nombre, nit, telefono, estado, empresa_grupo_id)
      values (v_vende, v_compra_empresa.nombre, v_compra_empresa.nit, v_compra_empresa.telefono, true, c.empresa_id)
      returning * into v_cli;
    end if;
    insert into ventas_encab (empresa_id, fecha, cliente_id, cliente_nombre, cliente_documento, cliente_telefono, forma_pago, total, registrado_por, estado, observaciones, compra_origen_id)
    values (v_vende, c.fecha, v_cli.id, v_cli.nombre, v_cli.nit, v_cli.telefono, 'fiado', v_total, 'Compra de ' || v_compra_empresa.nombre, 'confirmada',
      'Registrada automáticamente con la compra de ' || v_compra_empresa.nombre, p_compra_id)
    returning * into v_venta;
    insert into ventas_detalle (empresa_id, venta_id, sku, cantidad, precio_unitario, descuento, subtotal)
    select v_vende, v_venta.id, sku, cantidad, precio, 0, cantidad * precio from _vi_lineas;
    insert into inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    select v_vende, sku, cantidad, c.fecha, 'salida', 'Venta mostrador CV-' || lpad(v_venta.numero::text, 8, '0') from _vi_lineas;
    v_fecha_pago := c.fecha + coalesce(nullif(v_cli.dias_credito, 0), 7);
    insert into cartera_fiados (empresa_id, venta_id, cliente_id, nombre_cliente, valor_original, saldo, fecha_fiado, fecha_pago, estado)
    values (v_vende, v_venta.id, v_cli.id, v_cli.nombre, v_total, v_total, c.fecha, v_fecha_pago, 'pendiente');
    return v_venta.id;
  end if;

  -- Ya existía: se ajusta a lo que dice la compra ahora.
  v_ref := 'Corrección venta CV-' || lpad(v_venta.numero::text, 8, '0');
  for r in
    select coalesce(l.sku, d.sku) sku, coalesce(l.cantidad, 0) - coalesce(d.cantidad, 0) dif
    from _vi_lineas l full join (select sku, sum(cantidad) cantidad from ventas_detalle where venta_id = v_venta.id group by sku) d on d.sku = l.sku
  loop
    if abs(r.dif) > 0.0001 then
      insert into inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      values (v_vende, r.sku, abs(r.dif), c.fecha, case when r.dif > 0 then 'salida' else 'entrada' end, v_ref);
    end if;
  end loop;
  delete from ventas_detalle where venta_id = v_venta.id;
  insert into ventas_detalle (empresa_id, venta_id, sku, cantidad, precio_unitario, descuento, subtotal)
  select v_vende, v_venta.id, sku, cantidad, precio, 0, cantidad * precio from _vi_lineas;
  v_dif := v_total - coalesce(v_venta.total, 0);
  update ventas_encab set total = v_total, estado = 'confirmada', anulada_at = null, anulada_por = null, motivo_anulacion = null where id = v_venta.id;
  update cartera_fiados set valor_original = valor_original + v_dif, saldo = greatest(saldo + v_dif, 0),
    estado = case when greatest(saldo + v_dif, 0) > 0.5 then 'pendiente' else estado end
  where venta_id = v_venta.id;
  return v_venta.id;
end;
$$;
revoke all on function public._sincronizar_venta_interna(uuid) from public, anon, authenticated;

create or replace function public.sincronizar_venta_interna(p_compra_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from compras_encab where id = p_compra_id;
  if v_empresa is null or not (v_empresa = any (jwt_empresa_ids())) then raise exception 'Compra no encontrada'; end if;
  return _sincronizar_venta_interna(p_compra_id);
end;
$$;
revoke all on function public.sincronizar_venta_interna(uuid) from public, anon;
grant execute on function public.sincronizar_venta_interna(uuid) to authenticated;
