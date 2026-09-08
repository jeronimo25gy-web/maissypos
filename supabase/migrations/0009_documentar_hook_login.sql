-- custom_access_token_hook se corrigio en vivo en produccion (dos hotfixes:
-- usar `found` en vez de `fila is not null`, y agregar `security definer`
-- porque sin eso la funcion corria con los privilegios limitados del rol
-- supabase_auth_admin y fallaba en silencio) pero esos cambios nunca
-- quedaron en una migracion -- 0001_auth_empresa_claims.sql tiene la
-- version vieja, rota. Esta migracion documenta la version que realmente
-- esta corriendo hoy en produccion, confirmada via pg_get_functiondef.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  claims jsonb;
  fila record;
  todas_empresas jsonb;
begin
  claims := event->'claims';

  select empresas, rol
  into fila
  from public.usuarios
  where auth_user_id = (event->>'user_id')::uuid;

  if found then
    if fila.empresas is null then
      select coalesce(jsonb_agg(id), '[]'::jsonb) into todas_empresas from public.empresas where activo = true;
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', todas_empresas);
    else
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', fila.empresas);
    end if;
    claims := jsonb_set(claims, '{app_metadata,rol}', to_jsonb(fila.rol));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$function$;
