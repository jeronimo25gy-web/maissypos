-- La migracion 0026 restringio la politica RLS de select en facturas,
-- pero el link publico seguia funcionando igual -- porque el bucket
-- 'facturas' se creo con public=true (0016_facturas_electronicas.sql).
-- Un bucket marcado publico en Supabase Storage se sirve por la ruta
-- /object/public/... sin pasar por RLS en absoluto, sin importar que
-- politicas existan. Hay que apagar esa bandera para que la unica forma
-- de leer un archivo sea autenticado o con un link firmado
-- (createSignedUrl, ya usado por la app desde el cambio anterior).

update storage.buckets set public = false where id = 'facturas';
