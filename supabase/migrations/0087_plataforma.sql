-- MaissyPOS como producto: el dueño de la plataforma (rol 'plataforma') ve sus
-- clientes, demos, pagos y cifras generales de uso. Nunca entra a los datos de
-- ninguna empresa: su token no lleva empresas y las cifras salen de una
-- funcion que solo devuelve conteos.

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('gerencia', 'admin', 'auxiliar', 'vendedor', 'planta', 'plataforma'));

-- Cliente de MaissyPOS: agrupa una o varias empresas (o negocios de mostrador).
create table if not exists public.clientes_plataforma (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'demo' check (estado in ('demo', 'activo', 'vencido', 'suspendido')),
  demo_hasta date,
  dia_pago int check (dia_pago between 1 and 31),
  contacto_nombre text,
  contacto_celular text,
  ciudad text,
  notas text,
  created_at timestamptz not null default now()
);

-- Cada empresa paga su plan: empresa completa o solo mostrador.
alter table public.empresas add column if not exists cliente_id uuid references public.clientes_plataforma(id);
alter table public.empresas add column if not exists plan text not null default 'empresa' check (plan in ('empresa', 'mostrador'));
alter table public.empresas add column if not exists precio_mensual numeric;

create table if not exists public.pagos_plataforma (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_plataforma(id),
  fecha date not null default current_date,
  periodo text,
  valor numeric not null check (valor > 0),
  medio text,
  nota text,
  registrado_por text,
  created_at timestamptz not null default now()
);

create table if not exists public.solicitudes_demo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  negocio text not null,
  actividades text[] not null default '{}',
  celular text not null,
  ciudad text,
  rutas text,
  estado text not null default 'nueva' check (estado in ('nueva', 'aprobada', 'descartada')),
  cliente_id uuid references public.clientes_plataforma(id),
  created_at timestamptz not null default now()
);

alter table public.clientes_plataforma enable row level security;
alter table public.pagos_plataforma enable row level security;
alter table public.solicitudes_demo enable row level security;

create policy plataforma_todo on public.clientes_plataforma for all using (jwt_rol() = 'plataforma') with check (jwt_rol() = 'plataforma');
create policy plataforma_todo on public.pagos_plataforma for all using (jwt_rol() = 'plataforma') with check (jwt_rol() = 'plataforma');
create policy plataforma_todo on public.solicitudes_demo for all using (jwt_rol() = 'plataforma') with check (jwt_rol() = 'plataforma');
-- La pagina comercial deja una solicitud nueva sin sesion; no puede leer ninguna.
create policy publico_pide_demo on public.solicitudes_demo for insert to anon, authenticated with check (estado = 'nueva' and cliente_id is null);

-- Primer cliente: Maissy Group, con sus dos empresas a $250.000 cada una.
insert into public.clientes_plataforma (nombre, estado, dia_pago, ciudad)
select 'Maissy Group', 'activo', 1, 'Medellín'
where not exists (select 1 from public.clientes_plataforma where nombre = 'Maissy Group');
update public.empresas set cliente_id = (select id from public.clientes_plataforma where nombre = 'Maissy Group'), plan = 'empresa', precio_mensual = 250000
where cliente_id is null;

-- Token: la plataforma nunca lleva empresas.
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
  select empresas, rol into fila from public.usuarios where auth_user_id = (event->>'user_id')::uuid;
  if found then
    if fila.rol = 'plataforma' then
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', '[]'::jsonb);
    elsif fila.empresas is null then
      select coalesce(jsonb_agg(id), '[]'::jsonb) into todas_empresas from public.empresas where activo = true;
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', todas_empresas);
    else
      claims := jsonb_set(claims, '{app_metadata,empresa_ids}', fila.empresas);
    end if;
    claims := jsonb_set(claims, '{app_metadata,rol}', to_jsonb(case when fila.rol = 'gerencia' then 'admin' else fila.rol end));
    claims := jsonb_set(claims, '{app_metadata,gerencia}', to_jsonb(fila.rol = 'gerencia'));
    claims := jsonb_set(claims, '{app_metadata,ve_todas_empresas}', to_jsonb(fila.empresas is null and fila.rol <> 'plataforma'));
  end if;
  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$function$;

-- Cifras generales por empresa para la consola: usuarios, sesiones, ultima
-- actividad y espacio (archivos de la empresa mas su parte de las tablas).
-- Solo conteos; ningun dato del negocio.
create or replace function public.plataforma_uso()
 returns table (empresa_id uuid, usuarios int, sesiones_abiertas int, sesiones_hora int, ultima_actividad timestamptz, espacio_bytes bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  t record;
  filas_empresa bigint;
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
  select em.id,
    (select count(*)::int from public.usuarios u where u.activo is not false and u.rol <> 'plataforma' and (u.empresas is null or u.empresas ? em.id::text)),
    (select count(*)::int from public.sesiones_activas s where s.activo and s.empresa_id = em.id),
    (select count(*)::int from public.sesiones_activas s where s.activo and s.empresa_id = em.id and s.ultimo_acceso > now() - interval '1 hour'),
    (select max(s.ultimo_acceso) from public.sesiones_activas s where s.empresa_id = em.id),
    coalesce((espacio->>em.id::text)::bigint, 0)
  from public.empresas em;
end;
$function$;
grant execute on function public.plataforma_uso() to authenticated;
