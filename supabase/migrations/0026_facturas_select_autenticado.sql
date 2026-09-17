-- facturas_storage_select dejaba leer cualquier archivo del bucket
-- 'facturas' sin sesion (bucket_id = 'facturas', sin chequear auth.role()).
-- La app ya cambio a generar links firmados y temporales
-- (createSignedUrl) en vez de usar la URL publica permanente, asi que
-- cerrar la lectura publica no rompe nada -- los links firmados
-- funcionan sin importar esta politica.

drop policy if exists "facturas_storage_select" on storage.objects;
create policy "facturas_storage_select" on storage.objects
for select using (bucket_id = 'facturas' and auth.role() = 'authenticated');
