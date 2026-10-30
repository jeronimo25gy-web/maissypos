-- MaissyPOS con varios clientes: cada usuario pertenece a un cliente y
-- "ver todas las empresas" (Gerencia) es ver todas las de SU cliente, nunca
-- las de otro. Las empresas se leen solo dentro del mismo cliente.

alter table public.usuarios add column if not exists cliente_id uuid references public.clientes_plataforma(id);
update public.usuarios set cliente_id = (select id from public.clientes_plataforma where nombre = 'Maissy Group')
where cliente_id is null and rol <> 'plataforma';

create or replace function public.jwt_cliente_id()
 returns uuid
 language sql
 stable
as $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'cliente_id', '')::uuid
$function$;

create or replace function public.custom_access_token_hook(event jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  claims jsonb;
  fila record;
  todas_empresas jsonb;
begin
  claims := event->'claims';
  select empresas, rol, cliente_id into fila from public.usuarios where auth_user_id = (event->>'user_id')::uuid;
  if found then
    if fila.rol = 'plataforma' then
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', '[]'::jsonb);
    elsif fila.empresas is null then
      select coalesce(jsonb_agg(id), '[]'::jsonb) into todas_empresas from public.empresas where activo = true and cliente_id is not distinct from fila.cliente_id;
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', todas_empresas);
    else
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', fila.empresas);
    end if;
    claims := jsonb_set(claims, '{app_metadata,rol}', to_jsonb(case when fila.rol = 'gerencia' then 'admin' else fila.rol end));
    claims := jsonb_set(claims, '{app_metadata,gerencia}', to_jsonb(fila.rol = 'gerencia'));
    claims := jsonb_set(claims, '{app_metadata,ve_todas_empresas}', to_jsonb(fila.empresas is null and fila.rol <> 'plataforma'));
    claims := jsonb_set(claims, '{app_metadata,cliente_id}', coalesce(to_jsonb(fila.cliente_id), 'null'::jsonb));
  end if;
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$function$;

-- Empresas: se leen las propias y las del mismo cliente (venta mixta).
drop policy if exists "Lectura publica empresas" on public.empresas;
create policy empresas_select on public.empresas for select
  using (id = any (jwt_empresa_ids()) or (cliente_id is not null and cliente_id = jwt_cliente_id()));

-- Usuarios y sesiones: Gerencia ve los de su cliente, no los de otros.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using ((auth_user_id = auth.uid()) or ((jwt_rol() = 'admin') and ((jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id()) or (jsonb_a_uuids(empresas) && jwt_empresa_ids()))));
drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios for insert
  with check ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id());
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update
  using ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id())
  with check ((jwt_rol() = 'admin') and jwt_ve_todas_empresas() and cliente_id = jwt_cliente_id());
drop policy if exists sesiones_select on public.sesiones_activas;
create policy sesiones_select on public.sesiones_activas for select
  using ((jwt_rol() = 'admin') and (usuario_id in (select u.id from public.usuarios u where u.cliente_id = jwt_cliente_id() and (jwt_ve_todas_empresas() or jsonb_a_uuids(u.empresas) && jwt_empresa_ids()))));

-- Un usuario nuevo queda en el cliente de quien lo crea.
create or replace function public.usuarios_cliente_por_defecto()
 returns trigger
 language plpgsql
as $function$
begin
  if new.cliente_id is null and new.rol <> 'plataforma' then
    new.cliente_id := jwt_cliente_id();
  end if;
  return new;
end;
$function$;
drop trigger if exists usuarios_cliente_por_defecto on public.usuarios;
create trigger usuarios_cliente_por_defecto before insert on public.usuarios
  for each row execute function public.usuarios_cliente_por_defecto();

-- Conteos de la consola: Gerencia (empresas null) cuenta solo en las empresas de su cliente.
create or replace function public.plataforma_uso()
 returns table (empresa_id uuid, usuarios int, sesiones_abiertas int, sesiones_hora int, ultima_actividad timestamptz, espacio_bytes bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  t record;
  filas_total bigint;
  tam bigint;
  espacio jsonb := '{}'::jsonb;
  e record;
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  for e in select id from public.empresas loop
    espacio := jsonb_set(espacio, array[e.id::text], to_jsonb(coalesce((
      select sum((o.metadata->>'size')::bigint) from storage.objects o where o.name like '%' || e.id::text || '%'), 0)));
  end loop;
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
           where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE' loop
    tam := pg_total_relation_size(format('public.%I', t.table_name));
    execute format('select count(*) from public.%I', t.table_name) into filas_total;
    if filas_total > 0 then
      for e in execute format('select empresa_id as id, count(*) as n from public.%I where empresa_id is not null group by empresa_id', t.table_name) loop
        espacio := jsonb_set(espacio, array[e.id::text], to_jsonb(coalesce((espacio->>e.id::text)::bigint, 0) + (tam * e.n / filas_total)));
      end loop;
    end if;
  end loop;
  return query
  with us as (
    select u.id, u.empresas, u.cliente_id, u.activo from public.usuarios u where u.rol <> 'plataforma'
  ), ses as (
    select s.activo, s.ultimo_acceso, s.empresa_id emp, us.empresas, us.cliente_id
    from public.sesiones_activas s join us on us.id = s.usuario_id
  )
  select em.id,
    (select count(*)::int from us where us.activo is not false and ((us.empresas is null and us.cliente_id = em.cliente_id) or us.empresas ? em.id::text)),
    (select count(*)::int from ses where ses.activo and (ses.emp = em.id or (ses.emp is null and ((ses.empresas is null and ses.cliente_id = em.cliente_id) or ses.empresas ? em.id::text)))),
    (select count(*)::int from ses where ses.activo and ses.ultimo_acceso > now() - interval '1 hour' and (ses.emp = em.id or (ses.emp is null and ((ses.empresas is null and ses.cliente_id = em.cliente_id) or ses.empresas ? em.id::text)))),
    (select max(ses.ultimo_acceso) from ses where ses.emp = em.id or (ses.emp is null and ((ses.empresas is null and ses.cliente_id = em.cliente_id) or ses.empresas ? em.id::text))),
    coalesce((espacio->>em.id::text)::bigint, 0)
  from public.empresas em;
end;
$function$;
