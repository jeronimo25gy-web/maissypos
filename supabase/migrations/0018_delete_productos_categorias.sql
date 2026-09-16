-- productos y categorias_producto nunca tuvieron politica de DELETE (solo
-- select/insert/update en 0004_rls_jwt_rollout.sql). Sin una politica para
-- ese comando, RLS bloquea el borrado en silencio: Supabase no devuelve
-- error, simplemente borra 0 filas -- por eso "Eliminar definitivamente" en
-- Maestros parecia no hacer nada. Maestros ya esta gateado a admin en la
-- app, asi que la politica solo necesita el mismo scope por empresa que las
-- demas.

create policy "empresa_id_delete" on public.productos
for delete using (empresa_id = any (public.jwt_empresa_ids()));

create policy "categorias_producto_delete" on public.categorias_producto
for delete using (empresa_id = any (public.jwt_empresa_ids()));
