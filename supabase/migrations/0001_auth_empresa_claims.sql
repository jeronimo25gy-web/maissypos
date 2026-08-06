-- Fase 1 del plan de migracion a Supabase Auth (ver
-- /Users/jeronimo/.claude/plans/lovely-pondering-perlis.md).
--
-- Correr esto en el SQL Editor de Supabase.
--
-- Confirmado por consulta a information_schema (2026-07-26):
--   usuarios.id       uuid
--   usuarios.rol      text
--   usuarios.empresas jsonb  (ya es jsonb, no hace falta convertir con to_jsonb)
--
-- No rompe nada al correrlo: solo agrega una columna nueva y una funcion. El
-- Auth Hook hay que habilitarlo aparte en Dashboard -> Authentication -> Hooks.

alter table public.usuarios
  add column if not exists auth_user_id uuid references auth.users(id);

-- Correo personal, solo para usuarios administrativos/gerenciales que van a
-- tener recuperacion de clave self-service. Nullable: vendedores y operarios
-- de produccion se quedan sin valor aca y siguen con el email sintetico
-- {usuario}@maissypos.internal (sin reset propio, como ya estaba planeado).
alter table public.usuarios
  add column if not exists email text;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  fila record;
begin
  claims := event->'claims';

  select empresas, rol
  into fila
  from public.usuarios
  where auth_user_id = (event->>'user_id')::uuid;

  if fila is not null then
    claims := jsonb_set(claims, '{app_metadata,empresa_ids}', coalesce(fila.empresas, '[]'::jsonb));
    claims := jsonb_set(claims, '{app_metadata,rol}', to_jsonb(fila.rol));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- Paso manual (no tiene equivalente SQL): Dashboard -> Authentication -> Hooks
-- -> "Customize Access Token (JWT) Claims hook" -> seleccionar
-- public.custom_access_token_hook y guardar.
