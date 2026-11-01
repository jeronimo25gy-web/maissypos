-- La bolsa deja de ser un porcentaje supuesto: cada producto tiene su bolsa
-- principal y las otras que puede usar, la planta anota en cuál empaca y al
-- pasar a bodega se descuenta justo esa. Quita lo creado en 0100, que no se usó.
alter table public.productos
  drop column if exists bolsa_alterna_id,
  drop column if exists bolsa_alterna_pct,
  add column if not exists bolsas_otras uuid[] not null default '{}';

alter table public.produccion_muestras_peso
  add column if not exists bolsa_id uuid references public.productos(id) on delete set null;

create or replace function public.produccion_pasar_a_bodega(p_cochada_id uuid, p_usuario text)
returns integer
language plpgsql
as $function$
declare
  v_empresa uuid;
  v_fecha date := (now() at time zone 'America/Bogota')::date;
  v_lote uuid;
  v_n int := 0;
  v_ref text := 'Bolsas del lote ' || p_cochada_id;
  r record;
  d record;
  b record;
begin
  select empresa_id into v_empresa from public.produccion_cochadas where id = p_cochada_id;
  if v_empresa is null then raise exception 'Lote de coccion no encontrado'; end if;

  for r in
    with contado as (
      select producto_id, sum(cantidad) as cant
      from public.produccion_muestras_peso
      where cochada_id = p_cochada_id and tipo = 'empaque' and not anulado and producto_id is not null
      group by producto_id
    ), pasado as (
      select f.producto_id, sum(pd.cantidad_producida) as cant
      from public.produccion_lotes pl
      join public.produccion_detalle pd on pd.lote_id = pl.id
      join public.formulas f on f.id = pd.formula_id
      where pl.cochada_id = p_cochada_id
      group by f.producto_id
    )
    select c.producto_id, c.cant - coalesce(p.cant, 0) as pendiente,
           (select f.id from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as formula_id,
           (select f.nombre from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as formula_nombre,
           (select f.rendimiento from public.formulas f where f.producto_id = c.producto_id and f.empresa_id = v_empresa and f.activo order by f.created_at limit 1) as rendimiento,
           pr.sku
    from contado c
    left join pasado p on p.producto_id = c.producto_id
    join public.productos pr on pr.id = c.producto_id
    where c.cant - coalesce(p.cant, 0) > 0
  loop
    if r.formula_id is null then
      raise exception 'El producto % no tiene formula activa', r.sku;
    end if;
    if v_lote is null then
      insert into public.produccion_lotes (empresa_id, fecha, cochada_id, observaciones)
      values (v_empresa, v_fecha, p_cochada_id, 'Desde Control de produccion · ' || coalesce(p_usuario, ''))
      returning id into v_lote;
    end if;
    insert into public.produccion_detalle (empresa_id, lote_id, formula_id, cantidad_producida)
    values (v_empresa, v_lote, r.formula_id, r.pendiente);
    insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    values (v_empresa, r.sku, r.pendiente, v_fecha, 'entrada', 'Producción: ' || r.formula_nombre);
    for d in
      select fd.cantidad, mp.sku
      from public.formulas_detalle fd
      join public.productos mp on mp.id = fd.materia_prima_id
      where fd.formula_id = r.formula_id and not mp.consumo_por_cochada
    loop
      insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      values (v_empresa, d.sku, d.cantidad * r.pendiente / nullif(r.rendimiento, 0), v_fecha, 'salida', 'Producción: ' || r.formula_nombre);
    end loop;
    v_n := v_n + r.pendiente::int;
  end loop;

  -- Bolsas: lo empacado en cada una menos lo ya descontado de este lote. Lo
  -- anotado sin bolsa va a la principal del producto.
  for b in
    with usado as (
      select coalesce(m.bolsa_id, pr.bolsa_id) as bolsa, sum(m.cantidad) as cant
      from public.produccion_muestras_peso m
      join public.productos pr on pr.id = m.producto_id
      where m.cochada_id = p_cochada_id and m.tipo = 'empaque' and not m.anulado
        and coalesce(m.bolsa_id, pr.bolsa_id) is not null
      group by 1
    )
    select bp.sku, u.cant - coalesce((
      select sum(im.cantidad) from public.inventario_mov im
      where im.empresa_id = v_empresa and im.sku = bp.sku and im.tipo_movimiento = 'salida' and im.referencia = v_ref
    ), 0) as pendiente
    from usado u
    join public.productos bp on bp.id = u.bolsa
  loop
    if b.pendiente > 0 then
      insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
      values (v_empresa, b.sku, b.pendiente, v_fecha, 'salida', v_ref);
    end if;
  end loop;

  return v_n;
end;
$function$;
