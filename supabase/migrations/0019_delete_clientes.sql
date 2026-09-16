-- Mismo problema que productos/categorias_producto (ver 0018): clientes
-- nunca tuvo politica de DELETE, solo select/insert/update. Encontrado al
-- intentar borrar un cliente de prueba -- el delete no daba error, solo
-- borraba 0 filas.

create policy "clientes_delete" on public.clientes
for delete using (empresa_id = any (public.jwt_empresa_ids()));
