-- Configuracion -> Usuarios fallaba con "permission denied for table usuarios":
-- tras pasar a Supabase Auth los grants de usuarios quedaron al reves (anon
-- con INSERT/UPDATE heredados de cuando todo iba con la anon key, y
-- authenticated sin INSERT ni UPDATE de puede_aprobar_inventario). Las
-- politicas RLS (solo admin que ve todas las empresas) siguen siendo las que
-- deciden quien puede; esto solo habilita las columnas que la app escribe.

grant insert (usuario, nombre, rol, empresas, activo, password_hash, modulos, vendedor_nombre, email)
  on public.usuarios to authenticated;
grant update (puede_aprobar_inventario, vendedor_nombre)
  on public.usuarios to authenticated;

-- El login sin sesion usa la RPC usuario_a_email (security definer); anon no
-- necesita tocar la tabla directamente.
revoke all on public.usuarios from anon;

-- Eliminar usuarios definitivamente se hace por /api/admin-usuarios con
-- service_role (borra tambien la cuenta de Auth); el cliente no recibe DELETE.
