-- Reemplaza el patron debil (header 'x-empresa-id', que pone el propio
-- navegador y cualquiera puede falsificar con la anon key publica) por
-- verificacion real contra el JWT de sesion (auth.jwt() -> app_metadata ->
-- empresa_ids), inyectado por custom_access_token_hook (ver
-- 0001_auth_empresa_claims.sql). Confirmado en produccion: hoy se puede leer
-- cualquier tabla de cualquier empresa con la anon key publica + un header
-- falsificado, sin sesion real. Este migration cierra eso.
--
-- Nombres de politica exactos tomados en vivo de pg_policies antes de este
-- cambio -- se hace drop+create sobre el mismo nombre para no dejar rastros
-- ni romper nada que dependa del nombre de la politica.
--
-- Deliberadamente fuera de este migration: `usuarios` y `sesiones_activas`
-- (hoy en `using (true)`, forma distinta -- son un seguimiento aparte) y el
-- SELECT publico de `empresas` (se deja tal cual, es solo nombre/logo y hace
-- falta antes de que exista sesion).

create or replace function public.jwt_empresa_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'empresa_ids')::uuid),
    array[]::uuid[]
  )
$$;

-- ============ alertas_admin ============
drop policy if exists "alertas_admin_insert" on public.alertas_admin;
drop policy if exists "alertas_admin_select" on public.alertas_admin;
drop policy if exists "alertas_admin_update" on public.alertas_admin;
create policy "alertas_admin_select" on public.alertas_admin for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "alertas_admin_insert" on public.alertas_admin for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "alertas_admin_update" on public.alertas_admin for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ cargas_ruta ============
drop policy if exists "cargas_ruta_insert" on public.cargas_ruta;
drop policy if exists "cargas_ruta_select" on public.cargas_ruta;
drop policy if exists "cargas_ruta_update" on public.cargas_ruta;
create policy "cargas_ruta_select" on public.cargas_ruta for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "cargas_ruta_insert" on public.cargas_ruta for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "cargas_ruta_update" on public.cargas_ruta for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ cartera_fiados ============
drop policy if exists "empresa_id_insert" on public.cartera_fiados;
drop policy if exists "empresa_id_select" on public.cartera_fiados;
drop policy if exists "empresa_id_update" on public.cartera_fiados;
create policy "empresa_id_select" on public.cartera_fiados for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.cartera_fiados for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.cartera_fiados for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ categorias_gasto ============
drop policy if exists "empresa_id_insert" on public.categorias_gasto;
drop policy if exists "empresa_id_select" on public.categorias_gasto;
drop policy if exists "empresa_id_update" on public.categorias_gasto;
create policy "empresa_id_select" on public.categorias_gasto for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.categorias_gasto for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.categorias_gasto for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ categorias_producto ============
drop policy if exists "categorias_producto_insert" on public.categorias_producto;
drop policy if exists "categorias_producto_select" on public.categorias_producto;
drop policy if exists "categorias_producto_update" on public.categorias_producto;
create policy "categorias_producto_select" on public.categorias_producto for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "categorias_producto_insert" on public.categorias_producto for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "categorias_producto_update" on public.categorias_producto for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ compras ============
drop policy if exists "empresa_id_insert" on public.compras;
drop policy if exists "empresa_id_select" on public.compras;
drop policy if exists "empresa_id_update" on public.compras;
create policy "empresa_id_select" on public.compras for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.compras for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.compras for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ compras_encab ============
drop policy if exists "compras_encab_insert" on public.compras_encab;
drop policy if exists "compras_encab_select" on public.compras_encab;
drop policy if exists "compras_encab_update" on public.compras_encab;
create policy "compras_encab_select" on public.compras_encab for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "compras_encab_insert" on public.compras_encab for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "compras_encab_update" on public.compras_encab for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ config_comisiones ============
drop policy if exists "empresa_id_delete" on public.config_comisiones;
drop policy if exists "empresa_id_insert" on public.config_comisiones;
drop policy if exists "empresa_id_select" on public.config_comisiones;
drop policy if exists "empresa_id_update" on public.config_comisiones;
create policy "empresa_id_select" on public.config_comisiones for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.config_comisiones for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.config_comisiones for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.config_comisiones for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ configuracion ============
drop policy if exists "empresa_id_insert" on public.configuracion;
drop policy if exists "empresa_id_select" on public.configuracion;
drop policy if exists "empresa_id_update" on public.configuracion;
create policy "empresa_id_select" on public.configuracion for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.configuracion for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.configuracion for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ consumos_empleado ============
drop policy if exists "consumos_empleado_insert" on public.consumos_empleado;
drop policy if exists "consumos_empleado_select" on public.consumos_empleado;
create policy "consumos_empleado_select" on public.consumos_empleado for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "consumos_empleado_insert" on public.consumos_empleado for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ conteo_fisico ============
drop policy if exists "empresa_id_insert" on public.conteo_fisico;
drop policy if exists "empresa_id_select" on public.conteo_fisico;
create policy "empresa_id_select" on public.conteo_fisico for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.conteo_fisico for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ cuentas ============
drop policy if exists "cuentas_empresa" on public.cuentas;
create policy "cuentas_empresa" on public.cuentas for all using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ despachos_detalle ============
drop policy if exists "empresa_id_insert" on public.despachos_detalle;
drop policy if exists "empresa_id_select" on public.despachos_detalle;
drop policy if exists "empresa_id_update" on public.despachos_detalle;
create policy "empresa_id_select" on public.despachos_detalle for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.despachos_detalle for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.despachos_detalle for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ despachos_encab ============
drop policy if exists "empresa_id_insert" on public.despachos_encab;
drop policy if exists "empresa_id_select" on public.despachos_encab;
drop policy if exists "empresa_id_update" on public.despachos_encab;
create policy "empresa_id_select" on public.despachos_encab for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.despachos_encab for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.despachos_encab for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ empleados ============
drop policy if exists "empleados_insert" on public.empleados;
drop policy if exists "empleados_select" on public.empleados;
drop policy if exists "empleados_update" on public.empleados;
create policy "empleados_select" on public.empleados for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empleados_insert" on public.empleados for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empleados_update" on public.empleados for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ empresas (solo UPDATE; el SELECT publico se deja tal cual) ============
drop policy if exists "empresa_id_update" on public.empresas;
create policy "empresa_id_update" on public.empresas for update using (id = any (public.jwt_empresa_ids())) with check (id = any (public.jwt_empresa_ids()));

-- ============ facturas_proveedores ============
drop policy if exists "facturas_proveedores_insert" on public.facturas_proveedores;
drop policy if exists "facturas_proveedores_select" on public.facturas_proveedores;
drop policy if exists "facturas_proveedores_update" on public.facturas_proveedores;
create policy "facturas_proveedores_select" on public.facturas_proveedores for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "facturas_proveedores_insert" on public.facturas_proveedores for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "facturas_proveedores_update" on public.facturas_proveedores for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ gastos_admin ============
drop policy if exists "empresa_id_insert" on public.gastos_admin;
drop policy if exists "empresa_id_select" on public.gastos_admin;
create policy "empresa_id_select" on public.gastos_admin for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.gastos_admin for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ inventario_mov ============
drop policy if exists "empresa_id_insert" on public.inventario_mov;
drop policy if exists "empresa_id_select" on public.inventario_mov;
create policy "empresa_id_select" on public.inventario_mov for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.inventario_mov for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ liquidaciones ============
drop policy if exists "empresa_id_delete" on public.liquidaciones;
drop policy if exists "empresa_id_insert" on public.liquidaciones;
drop policy if exists "empresa_id_select" on public.liquidaciones;
create policy "empresa_id_select" on public.liquidaciones for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.liquidaciones for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.liquidaciones for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ liquidaciones_descuentos ============
drop policy if exists "empresa_id_delete" on public.liquidaciones_descuentos;
drop policy if exists "empresa_id_insert" on public.liquidaciones_descuentos;
drop policy if exists "empresa_id_select" on public.liquidaciones_descuentos;
drop policy if exists "empresa_id_update" on public.liquidaciones_descuentos;
create policy "empresa_id_select" on public.liquidaciones_descuentos for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.liquidaciones_descuentos for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.liquidaciones_descuentos for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.liquidaciones_descuentos for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ liquidaciones_detalle ============
drop policy if exists "empresa_id_delete" on public.liquidaciones_detalle;
drop policy if exists "empresa_id_insert" on public.liquidaciones_detalle;
drop policy if exists "empresa_id_select" on public.liquidaciones_detalle;
create policy "empresa_id_select" on public.liquidaciones_detalle for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.liquidaciones_detalle for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.liquidaciones_detalle for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ liquidaciones_fiados ============
drop policy if exists "empresa_id_delete" on public.liquidaciones_fiados;
drop policy if exists "empresa_id_insert" on public.liquidaciones_fiados;
drop policy if exists "empresa_id_select" on public.liquidaciones_fiados;
create policy "empresa_id_select" on public.liquidaciones_fiados for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.liquidaciones_fiados for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.liquidaciones_fiados for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ liquidaciones_gastos ============
drop policy if exists "empresa_id_delete" on public.liquidaciones_gastos;
drop policy if exists "empresa_id_insert" on public.liquidaciones_gastos;
drop policy if exists "empresa_id_select" on public.liquidaciones_gastos;
create policy "empresa_id_select" on public.liquidaciones_gastos for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.liquidaciones_gastos for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_delete" on public.liquidaciones_gastos for delete using (empresa_id = any (public.jwt_empresa_ids()));

-- ============ metas_ventas ============
drop policy if exists "empresa_id_insert" on public.metas_ventas;
drop policy if exists "empresa_id_select" on public.metas_ventas;
drop policy if exists "empresa_id_update" on public.metas_ventas;
create policy "empresa_id_select" on public.metas_ventas for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.metas_ventas for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.metas_ventas for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ movimientos_tesoreria ============
drop policy if exists "movimientos_tesoreria_empresa" on public.movimientos_tesoreria;
create policy "movimientos_tesoreria_empresa" on public.movimientos_tesoreria for all using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ nomina_pagos ============
drop policy if exists "nomina_pagos_insert" on public.nomina_pagos;
drop policy if exists "nomina_pagos_select" on public.nomina_pagos;
create policy "nomina_pagos_select" on public.nomina_pagos for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "nomina_pagos_insert" on public.nomina_pagos for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ novedades ============
drop policy if exists "empresa_id_insert" on public.novedades;
drop policy if exists "empresa_id_select" on public.novedades;
drop policy if exists "novedades_update" on public.novedades;
create policy "empresa_id_select" on public.novedades for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.novedades for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "novedades_update" on public.novedades for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ obsequios ============
drop policy if exists "empresa_id_insert" on public.obsequios;
drop policy if exists "empresa_id_select" on public.obsequios;
create policy "empresa_id_select" on public.obsequios for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.obsequios for insert with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ productos ============
drop policy if exists "empresa_id_insert" on public.productos;
drop policy if exists "empresa_id_select" on public.productos;
drop policy if exists "empresa_id_update" on public.productos;
create policy "empresa_id_select" on public.productos for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.productos for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.productos for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ proveedores ============
drop policy if exists "empresa_id_insert" on public.proveedores;
drop policy if exists "empresa_id_select" on public.proveedores;
drop policy if exists "empresa_id_update" on public.proveedores;
create policy "empresa_id_select" on public.proveedores for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.proveedores for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.proveedores for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ rutas ============
drop policy if exists "empresa_id_insert" on public.rutas;
drop policy if exists "empresa_id_select" on public.rutas;
drop policy if exists "empresa_id_update" on public.rutas;
create policy "empresa_id_select" on public.rutas for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.rutas for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.rutas for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ transferencias_mercancia ============
drop policy if exists "empresa_id_insert" on public.transferencias_mercancia;
drop policy if exists "empresa_id_select" on public.transferencias_mercancia;
drop policy if exists "empresa_id_update" on public.transferencias_mercancia;
create policy "empresa_id_select" on public.transferencias_mercancia for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.transferencias_mercancia for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.transferencias_mercancia for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ vehiculos ============
drop policy if exists "vehiculos_empresa" on public.vehiculos;
create policy "vehiculos_empresa" on public.vehiculos for all using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ vehiculos_documentos ============
drop policy if exists "vehiculos_documentos_empresa" on public.vehiculos_documentos;
create policy "vehiculos_documentos_empresa" on public.vehiculos_documentos for all using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ vehiculos_fotos ============
drop policy if exists "vehiculos_fotos_empresa" on public.vehiculos_fotos;
create policy "vehiculos_fotos_empresa" on public.vehiculos_fotos for all using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ vendedores (hoy sin RLS -- se activa por primera vez) ============
alter table public.vendedores enable row level security;
drop policy if exists "empresa_id_select" on public.vendedores;
drop policy if exists "empresa_id_insert" on public.vendedores;
drop policy if exists "empresa_id_update" on public.vendedores;
create policy "empresa_id_select" on public.vendedores for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.vendedores for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.vendedores for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ vehiculos_mantenimientos (hoy sin RLS -- se activa por primera vez) ============
alter table public.vehiculos_mantenimientos enable row level security;
drop policy if exists "empresa_id_select" on public.vehiculos_mantenimientos;
drop policy if exists "empresa_id_insert" on public.vehiculos_mantenimientos;
drop policy if exists "empresa_id_update" on public.vehiculos_mantenimientos;
create policy "empresa_id_select" on public.vehiculos_mantenimientos for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.vehiculos_mantenimientos for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.vehiculos_mantenimientos for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ ventas_encab (hoy sin RLS -- se activa por primera vez) ============
alter table public.ventas_encab enable row level security;
drop policy if exists "empresa_id_select" on public.ventas_encab;
drop policy if exists "empresa_id_insert" on public.ventas_encab;
drop policy if exists "empresa_id_update" on public.ventas_encab;
create policy "empresa_id_select" on public.ventas_encab for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.ventas_encab for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.ventas_encab for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

-- ============ ventas_detalle (hoy sin RLS -- se activa por primera vez) ============
alter table public.ventas_detalle enable row level security;
drop policy if exists "empresa_id_select" on public.ventas_detalle;
drop policy if exists "empresa_id_insert" on public.ventas_detalle;
drop policy if exists "empresa_id_update" on public.ventas_detalle;
create policy "empresa_id_select" on public.ventas_detalle for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.ventas_detalle for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_update" on public.ventas_detalle for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));
