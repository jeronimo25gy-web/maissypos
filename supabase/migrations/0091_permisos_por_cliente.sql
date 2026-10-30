-- Cada cliente de MaissyPOS tiene sus propios permisos por rol. Nadie puede
-- crear ni convertirse en usuario Plataforma desde el sistema. Los modelos de
-- una empresa solo los cambia la Plataforma.

alter table public.roles_permisos add column if not exists cliente_id uuid references public.clientes_plataforma(id) default jwt_cliente_id();
update public.roles_permisos set cliente_id = (select id from public.clientes_plataforma where nombre = 'Maissy Group') where cliente_id is null;
alter table public.roles_permisos alter column cliente_id set not null;
alter table public.roles_permisos drop constraint if exists roles_permisos_pkey;
alter table public.roles_permisos add primary key (cliente_id, rol);

drop policy if exists roles_permisos_select on public.roles_permisos;
drop policy if exists roles_permisos_insert on public.roles_permisos;
drop policy if exists roles_permisos_update on public.roles_permisos;
create policy roles_permisos_select on public.roles_permisos for select using (cliente_id = jwt_cliente_id());
create policy roles_permisos_insert on public.roles_permisos for insert with check (jwt_es_gerencia() and cliente_id = jwt_cliente_id());
create policy roles_permisos_update on public.roles_permisos for update using (jwt_es_gerencia() and cliente_id = jwt_cliente_id()) with check (jwt_es_gerencia() and cliente_id = jwt_cliente_id());

drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios for insert
  with check ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id() and rol <> 'plataforma');
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update
  using ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id())
  with check ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id() and rol <> 'plataforma');

create or replace function public.empresas_proteger_plan()
 returns trigger
 language plpgsql
as $function$
begin
  if auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or coalesce(jwt_rol(), '') = 'plataforma' then return new; end if;
  if new.cliente_id is distinct from old.cliente_id or new.plan is distinct from old.plan or new.precio_mensual is distinct from old.precio_mensual or new.modelos is distinct from old.modelos then
    raise exception 'El plan y los modelos solo los cambia MaissyPOS';
  end if;
  return new;
end;
$function$;

drop function if exists public.plataforma_actualizar_empresa(uuid, text, numeric, boolean);
create or replace function public.plataforma_actualizar_empresa(p_id uuid, p_plan text, p_precio numeric, p_activo boolean, p_modelos text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  update public.empresas set plan = coalesce(p_plan, plan), precio_mensual = p_precio, activo = coalesce(p_activo, activo), modelos = coalesce(p_modelos, modelos) where id = p_id;
end;
$function$;
grant execute on function public.plataforma_actualizar_empresa(uuid, text, numeric, boolean, text[]) to authenticated;

-- El dueño de cada demo es Gerencia de su negocio: administra sus usuarios.
update public.usuarios set rol = 'gerencia', empresas = null where usuario = 'jg.parfums';
