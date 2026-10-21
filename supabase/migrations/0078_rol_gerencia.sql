-- Rol Gerencia: acceso total (dueños). El administrador queda limitado por los
-- permisos por rol que Gerencia configura en Configuración.
-- En el token, Gerencia viaja como rol 'admin' más la marca gerencia = true,
-- para que todas las reglas de acceso existentes le apliquen sin cambios.

alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('gerencia', 'admin', 'auxiliar', 'vendedor', 'planta'));

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  claims jsonb;
  fila record;
  todas_empresas jsonb;
begin
  claims := event->'claims';
  select empresas, rol into fila from public.usuarios where auth_user_id = (event->>'user_id')::uuid;
  if found then
    if fila.empresas is null then
      select coalesce(jsonb_agg(id), '[]'::jsonb) into todas_empresas from public.empresas where activo = true;
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', todas_empresas);
    else
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', fila.empresas);
    end if;
    claims := jsonb_set(claims, '{app_metadata,rol}', to_jsonb(case when fila.rol = 'gerencia' then 'admin' else fila.rol end));
    claims := jsonb_set(claims, '{app_metadata,gerencia}', to_jsonb(fila.rol = 'gerencia'));
    claims := jsonb_set(claims, '{app_metadata,ve_todas_empresas}', to_jsonb(fila.empresas is null));
  end if;
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$function$;

create or replace function public.jwt_es_gerencia() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'gerencia')::boolean, false)
$$;

-- Módulos que ve cada rol (si no hay fila, se usan los del sistema).
create table if not exists roles_permisos (
  rol text primary key check (rol in ('admin', 'auxiliar', 'vendedor', 'planta')),
  modulos jsonb not null default '[]'::jsonb,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table roles_permisos enable row level security;
create policy roles_permisos_select on roles_permisos for select to authenticated using (true);
create policy roles_permisos_insert on roles_permisos for insert to authenticated with check (jwt_es_gerencia());
create policy roles_permisos_update on roles_permisos for update to authenticated using (jwt_es_gerencia()) with check (jwt_es_gerencia());

update usuarios set rol = 'gerencia' where usuario in ('jero', 'kathe');
