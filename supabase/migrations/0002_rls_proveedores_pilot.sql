-- NO correr todavia. Esto es el piloto de RLS (Fase 3 del plan) y depende de
-- que TODOS los usuarios ya esten migrados a Supabase Auth (0001 corrido +
-- backfill de scripts/backfill-auth-users.mjs + login cambiado a
-- signInWithPassword en app/page.js). Si se corre antes, cualquiera que siga
-- usando el login viejo pierde acceso a `proveedores` porque su sesion no
-- tiene JWT con el claim empresa_ids.
--
-- Antes de correr: confirma el tipo real de `proveedores.empresa_id` (uuid vs
-- int/text) y ajusta el cast de abajo si no es uuid.

alter table public.proveedores enable row level security;

create policy "proveedores_select_empresa" on public.proveedores
for select using (
  empresa_id = any (
    select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'empresa_ids')::uuid
  )
);

create policy "proveedores_insert_empresa" on public.proveedores
for insert with check (
  empresa_id = any (
    select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'empresa_ids')::uuid
  )
);

create policy "proveedores_update_empresa" on public.proveedores
for update using (
  empresa_id = any (
    select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'empresa_ids')::uuid
  )
);

create policy "proveedores_delete_empresa" on public.proveedores
for delete using (
  empresa_id = any (
    select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'empresa_ids')::uuid
  )
);

-- Verificacion despues de correr (ver seccion Verificacion del plan):
-- curl a la REST API de `proveedores` con la anon key, sin token de usuario,
-- debe devolver [] en vez de todas las filas.
