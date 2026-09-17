-- Mismo hueco que productos/categorias_producto/clientes (0018/0019):
-- estas tablas de datos maestros tampoco tenian politica de DELETE, solo
-- select/insert/update -- el borrado fallaba en silencio (0 filas, sin
-- error).
--
-- A proposito NO se agrega DELETE a tablas transaccionales/contables
-- (ventas_encab, ventas_detalle, compras, compras_encab, cartera_fiados,
-- inventario_mov, liquidaciones*, gastos_admin, novedades,
-- transferencias_mercancia, despachos_*, obsequios, consumos_empleado,
-- produccion_*, nomina_pagos, usuarios, empresas, facturas_proveedores,
-- alertas_admin, audit_ajustes_inventario, divergencias_inventario,
-- sesiones_activas, configuracion): permitir borrar esas abriria la
-- misma puerta de fraude que la alerta de cambio de precio en Compras
-- existe para cerrar -- alguien podria borrar una venta, un movimiento de
-- inventario o una liquidacion sin dejar rastro. Esas tablas se quedan
-- append-only a proposito; una correccion ahi se hace con un movimiento
-- compensatorio (como ya hace Ajustes de Inventario), no borrando.

create policy "rutas_delete" on public.rutas
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "vendedores_delete" on public.vendedores
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "empleados_delete" on public.empleados
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "formulas_delete" on public.formulas
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "categorias_gasto_delete" on public.categorias_gasto
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "metas_ventas_delete" on public.metas_ventas
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "cargas_ruta_delete" on public.cargas_ruta
for delete using (empresa_id = any (public.jwt_empresa_ids()));
