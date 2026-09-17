-- El bucket 'logos' (subida de logo de empresa en Configuracion) nunca
-- tuvo politicas propias en las migraciones de este repo -- se configuro
-- en algun momento directo en el panel de Supabase. Verificado en vivo:
-- la lectura es publica (correcto, un logo debe verse sin sesion), pero
-- la ESCRITURA tambien estaba abierta con la sola llave publica (anon),
-- sin necesitar sesion -- cualquiera con la anon key (embebida en el
-- bundle del cliente, no es secreta) podia subir archivos arbitrarios al
-- bucket. Se restringe insert/update/delete a usuarios autenticados,
-- mismo patron que el bucket 'facturas' (0016_facturas_electronicas.sql).

drop policy if exists "logos_storage_select" on storage.objects;
create policy "logos_storage_select" on storage.objects
for select using (bucket_id = 'logos');

drop policy if exists "logos_storage_insert" on storage.objects;
create policy "logos_storage_insert" on storage.objects
for insert with check (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "logos_storage_update" on storage.objects;
create policy "logos_storage_update" on storage.objects
for update using (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "logos_storage_delete" on storage.objects;
create policy "logos_storage_delete" on storage.objects
for delete using (bucket_id = 'logos' and auth.role() = 'authenticated');

-- El archivo de prueba que quedo subido durante la verificacion de este
-- hueco (probando que se podia subir sin sesion) no se borra con SQL
-- directo -- Supabase lo bloquea a proposito ("Direct deletion from
-- storage tables is not allowed. Use the Storage API instead."). Se borra
-- aparte via la Storage API una vez esta politica de delete ya exista.
