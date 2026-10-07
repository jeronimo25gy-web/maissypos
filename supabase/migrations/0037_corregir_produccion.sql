-- Corregir la cantidad de un lote de produccion mal digitado (ej. Chuzo 2 en
-- vez de 1). produccion_detalle no admite UPDATE directo: esta funcion lo hace
-- solo para admin, guarda la cantidad original y quien corrigio, y ajusta el
-- inventario con un movimiento de diferencia (no reescribe el original):
-- producto terminado +/- la diferencia y, en sentido contrario, las materias
-- primas que se descuentan por formula (no las de cochada, que van por bultos
-- reales).

alter table public.produccion_detalle
  add column if not exists cantidad_original numeric,
  add column if not exists corregido_por text,
  add column if not exists corregido_at timestamptz;

create or replace function public.corregir_produccion_detalle(p_detalle_id uuid, p_cantidad numeric, p_usuario_nombre text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d record;
  v_delta numeric;
  v_sku text;
  v_ref text;
  fd record;
begin
  if coalesce(public.jwt_rol(), '') <> 'admin' then
    raise exception 'Solo un administrador puede corregir la produccion';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'Cantidad invalida';
  end if;

  select pd.*, pl.fecha, f.nombre as formula_nombre, f.producto_id, f.rendimiento
    into d
  from public.produccion_detalle pd
  join public.produccion_lotes pl on pl.id = pd.lote_id
  join public.formulas f on f.id = pd.formula_id
  where pd.id = p_detalle_id and pd.empresa_id = any (public.jwt_empresa_ids())
  for update of pd;

  if not found then
    raise exception 'Registro de produccion no encontrado';
  end if;

  v_delta := p_cantidad - d.cantidad_producida;
  if v_delta = 0 then
    return;
  end if;

  v_ref := 'Corrección producción: ' || d.formula_nombre || ' (' || d.cantidad_producida || ' → ' || p_cantidad || '), por ' || p_usuario_nombre;

  select sku into v_sku from public.productos where id = d.producto_id;
  if v_sku is not null then
    insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    values (d.empresa_id, v_sku, abs(v_delta), d.fecha, case when v_delta > 0 then 'entrada' else 'salida' end, v_ref);
  end if;

  if d.rendimiento > 0 then
    for fd in
      select p.sku, x.cantidad
      from public.formulas_detalle x join public.productos p on p.id = x.materia_prima_id
      where x.formula_id = d.formula_id and not p.consumo_por_cochada
    loop
      insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      values (d.empresa_id, fd.sku, abs(v_delta) * fd.cantidad / d.rendimiento, d.fecha,
              case when v_delta > 0 then 'salida' else 'entrada' end, v_ref);
    end loop;
  end if;

  update public.produccion_detalle set
    cantidad_original = coalesce(cantidad_original, d.cantidad_producida),
    cantidad_producida = p_cantidad,
    corregido_por = p_usuario_nombre,
    corregido_at = now()
  where id = p_detalle_id;
end;
$$;

revoke all on function public.corregir_produccion_detalle(uuid, numeric, text) from public, anon;
grant execute on function public.corregir_produccion_detalle(uuid, numeric, text) to authenticated;
