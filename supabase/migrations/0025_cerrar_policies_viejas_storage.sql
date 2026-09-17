-- La migracion 0024 creo politicas nuevas y correctas para 'logos', pero
-- quedaron políticas viejas (creadas a mano en el panel de Supabase, con
-- otro nombre) que seguian permitiendo todo sin sesion -- por eso el
-- hueco seguia abierto aunque las politicas nuevas ya existieran: en
-- Postgres RLS las politicas se combinan con OR, asi que una sola
-- politica vieja permisiva basta para anular una nueva mas estricta.
--
-- Encontrado leyendo pg_policies directamente (no asumiendo que el
-- nombre de policy que uno espera es el unico que existe):
--   logos_insert / logos_select / logos_update -- roles {anon,authenticated},
--   sin ningun chequeo de auth.role().
--
-- De paso aparecio el mismo hueco en 'vehiculos': "Allow uploads to
-- vehiculos bucket" es INSERT para {public} sin chequear autenticacion.

drop policy if exists "logos_insert" on storage.objects;
drop policy if exists "logos_select" on storage.objects;
drop policy if exists "logos_update" on storage.objects;

drop policy if exists "Allow uploads to vehiculos bucket" on storage.objects;
create policy "vehiculos_storage_insert" on storage.objects
for insert with check (bucket_id = 'vehiculos' and auth.role() = 'authenticated');
