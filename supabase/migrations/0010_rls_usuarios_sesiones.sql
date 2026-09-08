-- Cierra el ultimo hueco grande de RLS: usuarios y sesiones_activas seguian
-- en `using (true)` -- cualquier sesion logueada (hasta un vendedor) podia
-- leer nombre/rol/accesos/empresas de TODOS los usuarios de las DOS
-- empresas. Se dejo aparte del barrido grande (0004_rls_jwt_rollout.sql)
-- porque tocar el login sin probarlo aparte era mas delicado.
--
-- La logica de visibilidad replica exactamente compartenEmpresa() en
-- app/(app)/configuracion/page.js:
--   - un admin con empresas=null (jero/kathe hoy) ve a todos
--   - un admin con empresas=[...] solo ve usuarios cuyo empresas se cruce
--     con el suyo; nunca ve a alguien con empresas=null
--   - cualquiera puede leer/actualizar su propia fila (necesario para login)
--
-- jwt_empresa_ids() (de 0004) ya resuelve empresas=null -> "todas las
-- activas" a nivel de claims, pero eso no alcanza para distinguir "admin
-- sin restriccion" de "admin restringido que por casualidad tiene acceso a
-- todas las empresas que existen hoy". Por eso el hook ahora tambien manda
-- un booleano explicito: ve_todas_empresas.

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
    claims := jsonb_set(claims, '{app_metadata,ve_todas_empresas}', to_jsonb(fila.empresas is null));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$function$;

create or replace function public.jwt_ve_todas_empresas()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 've_todas_empresas')::boolean, false);
$$;

create or replace function public.jwt_rol()
returns text
language sql stable
as $$
  select auth.jwt() -> 'app_metadata' ->> 'rol';
$$;

-- usuarios.empresas es jsonb (array de strings), no un array nativo de
-- Postgres -- el operador && necesita uuid[] de los dos lados.
create or replace function public.jsonb_a_uuids(valor jsonb)
returns uuid[]
language sql immutable
as $$
  select case when valor is null then null
    else array(select jsonb_array_elements_text(valor)::uuid) end;
$$;

-- ============ usuarios ============
alter table public.usuarios enable row level security;
drop policy if exists "usuarios_select" on public.usuarios;
drop policy if exists "usuarios_insert" on public.usuarios;
drop policy if exists "usuarios_update" on public.usuarios;

create policy "usuarios_select" on public.usuarios
for select using (
  auth_user_id = auth.uid()
  or (
    public.jwt_rol() = 'admin'
    and (public.jwt_ve_todas_empresas() or public.jsonb_a_uuids(empresas) && public.jwt_empresa_ids())
  )
);

-- Los inserts/updates de usuarios hoy solo los dispara la UI para
-- SUPERADMINS (jero/kathe, ambos con empresas=null) -- ver puedeEditar en
-- configuracion/page.js. Se exige ve_todas_empresas por eso.
create policy "usuarios_insert" on public.usuarios
for insert with check (public.jwt_rol() = 'admin' and public.jwt_ve_todas_empresas());

create policy "usuarios_update" on public.usuarios
for update using (public.jwt_rol() = 'admin' and public.jwt_ve_todas_empresas())
with check (public.jwt_rol() = 'admin' and public.jwt_ve_todas_empresas());

-- ============ sesiones_activas ============
alter table public.sesiones_activas enable row level security;
drop policy if exists "sesiones_select" on public.sesiones_activas;
drop policy if exists "sesiones_update" on public.sesiones_activas;

create policy "sesiones_select" on public.sesiones_activas
for select using (
  public.jwt_rol() = 'admin'
  and (
    public.jwt_ve_todas_empresas()
    or usuario_id in (select id from public.usuarios where public.jsonb_a_uuids(empresas) && public.jwt_empresa_ids())
  )
);

-- Permite que cualquiera marque su PROPIA sesion inactiva al cerrar sesion
-- (lib/sesion.js: cerrarSesionUsuario, ahora corre antes del signOut).
create policy "sesiones_update" on public.sesiones_activas
for update using (
  usuario_id in (select id from public.usuarios where auth_user_id = auth.uid())
)
with check (
  usuario_id in (select id from public.usuarios where auth_user_id = auth.uid())
);

-- El insert/upsert de login (app/api/sesion/route.js) ahora corre con
-- service_role, que ignora RLS -- no necesita politica de insert aqui.
