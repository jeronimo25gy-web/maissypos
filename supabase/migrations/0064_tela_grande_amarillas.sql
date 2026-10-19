-- Arepas Maissy: la Tela y la Grande también se hacen de maíz amarillo, con
-- las mismas especificaciones (peso, unidades, precio) que su referencia
-- blanca. El maíz amarillo es una materia prima aparte porque a veces llega
-- más caro (esta vez llegó al mismo precio). Se cocina en la Olla 1 bulto.
-- Las blancas cambian de nombre para distinguirlas. Conservante: 300 g por
-- bulto (dato de planta, 19 oct 2026).
do $$
declare
  v_emp uuid := 'aef04001-a941-4ad3-bd22-397a76ffc17d';
  v_maiz_amarillo uuid;
begin
  if not exists (select 1 from public.empresas where id = v_emp) then return; end if;

  update public.productos set nombre = 'Maíz Blanco' where empresa_id = v_emp and sku = 'MP-001';
  update public.productos set nombre = 'Arepa de Maíz Blanco Tela' where empresa_id = v_emp and sku = 'ARE-002';
  update public.productos set nombre = 'Arepa de Maíz Blanco Grande' where empresa_id = v_emp and sku = 'ARE-004';
  update public.formulas f set nombre = 'Masa Arepa de Maíz Blanco Tela' from public.productos p where p.id = f.producto_id and p.empresa_id = v_emp and p.sku = 'ARE-002';
  update public.formulas f set nombre = 'Masa Arepa de Maíz Blanco Grande' from public.productos p where p.id = f.producto_id and p.empresa_id = v_emp and p.sku = 'ARE-004';

  if not exists (select 1 from public.productos where empresa_id = v_emp and sku = 'MP-002') then
    insert into public.productos (empresa_id, sku, nombre, categoria, presentacion, precio_venta, costo_compra, perecedero, dias_vida_util, proveedor_id, origen, estado, stock_minimo, dias_cobertura, cantidad_sugerida_manual, precio_empleado, tipo, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, orden_despacho)
    select empresa_id, 'MP-002', 'Maíz Amarillo', categoria, presentacion, precio_venta, costo_compra, perecedero, dias_vida_util, proveedor_id, origen, estado, stock_minimo, dias_cobertura, cantidad_sugerida_manual, precio_empleado, tipo, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, orden_despacho
    from public.productos where empresa_id = v_emp and sku = 'MP-001';
  end if;
  select id into v_maiz_amarillo from public.productos where empresa_id = v_emp and sku = 'MP-002';

  -- Terminados amarillos: copia de su referencia blanca.
  insert into public.productos (empresa_id, sku, nombre, categoria, presentacion, precio_venta, costo_compra, perecedero, dias_vida_util, proveedor_id, origen, estado, stock_minimo, dias_cobertura, cantidad_sugerida_manual, precio_empleado, tipo, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, orden_despacho)
  select p.empresa_id, x.sku_nuevo, x.nombre, p.categoria, p.presentacion, p.precio_venta, p.costo_compra, p.perecedero, p.dias_vida_util, p.proveedor_id, p.origen, p.estado, p.stock_minimo, p.dias_cobertura, p.cantidad_sugerida_manual, p.precio_empleado, p.tipo, p.peso_estandar_g, p.tolerancia_gramaje_pct, p.consumo_por_cochada, x.orden
  from (values ('ARE-002', 'ARE-010', 'Arepa de Maíz Amarillo Tela', 109), ('ARE-004', 'ARE-011', 'Arepa de Maíz Amarillo Grande', 110)) x(sku_base, sku_nuevo, nombre, orden)
  join public.productos p on p.empresa_id = v_emp and p.sku = x.sku_base
  where not exists (select 1 from public.productos q where q.empresa_id = v_emp and q.sku = x.sku_nuevo);

  -- Sus fórmulas: las mismas cantidades, con maíz amarillo.
  insert into public.formulas (empresa_id, producto_id, nombre, rendimiento, activo)
  select v_emp, n.id, 'Masa ' || n.nombre, f.rendimiento, true
  from (values ('ARE-002', 'ARE-010'), ('ARE-004', 'ARE-011')) x(sku_base, sku_nuevo)
  join public.productos b on b.empresa_id = v_emp and b.sku = x.sku_base
  join public.productos n on n.empresa_id = v_emp and n.sku = x.sku_nuevo
  join public.formulas f on f.producto_id = b.id and f.activo
  where not exists (select 1 from public.formulas g where g.producto_id = n.id);

  insert into public.formulas_detalle (empresa_id, formula_id, materia_prima_id, cantidad)
  select v_emp, fn.id, case when mp.sku = 'MP-001' then v_maiz_amarillo else fd.materia_prima_id end, fd.cantidad
  from (values ('ARE-002', 'ARE-010'), ('ARE-004', 'ARE-011')) x(sku_base, sku_nuevo)
  join public.productos b on b.empresa_id = v_emp and b.sku = x.sku_base
  join public.productos n on n.empresa_id = v_emp and n.sku = x.sku_nuevo
  join public.formulas fb on fb.producto_id = b.id and fb.activo
  join public.formulas fn on fn.producto_id = n.id and fn.activo
  join public.formulas_detalle fd on fd.formula_id = fb.id
  join public.productos mp on mp.id = fd.materia_prima_id
  where not exists (select 1 from public.formulas_detalle d where d.formula_id = fn.id);

  -- Precios especiales por ruta: los mismos de la blanca.
  insert into public.rutas_precios (empresa_id, ruta_id, sku, precio_especial)
  select r.empresa_id, r.ruta_id, x.sku_nuevo, r.precio_especial
  from (values ('ARE-002', 'ARE-010'), ('ARE-004', 'ARE-011')) x(sku_base, sku_nuevo)
  join public.rutas_precios r on r.empresa_id = v_emp and r.sku = x.sku_base
  where not exists (select 1 from public.rutas_precios q where q.empresa_id = v_emp and q.ruta_id = r.ruta_id and q.sku = x.sku_nuevo);

  -- Cada tanque con su maíz: la olla con amarillo, los demás con blanco.
  update public.tanques set materia_prima_id = v_maiz_amarillo where empresa_id = v_emp and nombre = 'Olla 1 bulto';
  update public.tanques t set materia_prima_id = p.id from public.productos p
  where t.empresa_id = v_emp and t.nombre <> 'Olla 1 bulto' and p.empresa_id = v_emp and p.sku = 'MP-001' and t.materia_prima_id is null;

  -- Conservante por bulto.
  insert into public.produccion_estandares (empresa_id, clave, valor, estado, nota, actualizado_por)
  select v_emp, 'conservante_g_bulto', 300, 'fijo', 'Dato de planta 19 oct 2026; el gramo sale a $26,66', 'Jeronimo'
  where not exists (select 1 from public.produccion_estandares where empresa_id = v_emp and clave = 'conservante_g_bulto');
end $$;
