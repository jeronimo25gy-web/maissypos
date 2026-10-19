-- Productos ligados entre las dos empresas del grupo: un producto de Distri
-- que es el mismo que hace Arepas Maissy apunta a él. Sirve para que la
-- devolución de un distribuidor salga del inventario correcto en la otra
-- empresa, y para que en el mostrador no se vendan las arepas de Distri (allá
-- se venden las de planta, a su precio).
alter table public.productos
  add column if not exists producto_espejo_id uuid references public.productos(id);

do $$
declare
  v_distri uuid := '025529ee-8655-459b-91a3-4a719f28c8bc';
  v_arepas uuid := 'aef04001-a941-4ad3-bd22-397a76ffc17d';
begin
  if not exists (select 1 from public.empresas where id = v_distri) or not exists (select 1 from public.empresas where id = v_arepas) then return; end if;

  -- Distri también vende las amarillas: copia de su blanca en Distri.
  insert into public.productos (empresa_id, sku, nombre, categoria, presentacion, precio_venta, costo_compra, perecedero, dias_vida_util, proveedor_id, origen, estado, stock_minimo, dias_cobertura, cantidad_sugerida_manual, precio_empleado, tipo, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, orden_despacho)
  select p.empresa_id, x.sku_nuevo, x.nombre, p.categoria, p.presentacion, p.precio_venta, p.costo_compra, p.perecedero, p.dias_vida_util, p.proveedor_id, p.origen, p.estado, p.stock_minimo, p.dias_cobertura, p.cantidad_sugerida_manual, p.precio_empleado, p.tipo, p.peso_estandar_g, p.tolerancia_gramaje_pct, p.consumo_por_cochada, x.orden
  from (values ('ARE-001', 'ARE-010', 'Arepa Tela Amarilla', 109), ('ARE-003', 'ARE-011', 'Arepa Extra Grande Amarilla', 110)) x(sku_base, sku_nuevo, nombre, orden)
  join public.productos p on p.empresa_id = v_distri and p.sku = x.sku_base
  where not exists (select 1 from public.productos q where q.empresa_id = v_distri and q.sku = x.sku_nuevo);

  -- Precios por ruta y por cliente de las amarillas: los de su blanca (en las dos empresas).
  insert into public.rutas_precios (empresa_id, ruta_id, sku, precio_especial)
  select r.empresa_id, r.ruta_id, x.sku_nuevo, r.precio_especial
  from (values (v_distri, 'ARE-001', 'ARE-010'), (v_distri, 'ARE-003', 'ARE-011')) x(emp, sku_base, sku_nuevo)
  join public.rutas_precios r on r.empresa_id = x.emp and r.sku = x.sku_base
  where not exists (select 1 from public.rutas_precios q where q.empresa_id = x.emp and q.ruta_id = r.ruta_id and q.sku = x.sku_nuevo);

  insert into public.clientes_precios (empresa_id, cliente_id, sku, precio_especial)
  select c.empresa_id, c.cliente_id, x.sku_nuevo, c.precio_especial
  from (values (v_distri, 'ARE-001', 'ARE-010'), (v_distri, 'ARE-003', 'ARE-011'), (v_arepas, 'ARE-002', 'ARE-010'), (v_arepas, 'ARE-004', 'ARE-011')) x(emp, sku_base, sku_nuevo)
  join public.clientes_precios c on c.empresa_id = x.emp and c.sku = x.sku_base
  where not exists (select 1 from public.clientes_precios q where q.empresa_id = x.emp and q.cliente_id = c.cliente_id and q.sku = x.sku_nuevo);

  -- Pares Distri -> Arepas Maissy (confirmados por el usuario el 19 oct 2026).
  update public.productos d set producto_espejo_id = a.id
  from (values ('ARE-001', 'ARE-002'), ('ARE-002', 'ARE-003'), ('ARE-003', 'ARE-004'), ('ARE-004', 'ARE-007'), ('ARE-006', 'ARE-005'), ('ARE-010', 'ARE-010'), ('ARE-011', 'ARE-011')) x(sku_distri, sku_arepas)
  join public.productos a on a.empresa_id = v_arepas and a.sku = x.sku_arepas
  where d.empresa_id = v_distri and d.sku = x.sku_distri;
end $$;
