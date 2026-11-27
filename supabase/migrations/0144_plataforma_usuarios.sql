-- Consola de Plataforma: usuarios de cada cliente, clave temporal con cambio
-- obligatorio, registro de lo que hace la plataforma y avisos de "olvide mi
-- contrasena" de quien no tiene a nadie arriba (Gerencia).
-- La plataforma ve quien es cada usuario y cuando entro; nunca su clave ni
-- los datos del negocio.

-- Quien recibe una clave temporal debe cambiarla al entrar.
alter table public.usuarios add column if not exists debe_cambiar_clave boolean not null default false;

-- Registro de lo que hace la plataforma sobre los usuarios de un cliente.
-- Solo se escribe desde el servidor (llave de servicio); nadie lo edita.
create table if not exists public.plataforma_registro (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  accion text not null,
  cliente_id uuid references public.clientes_plataforma(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  detalle text,
  created_at timestamptz not null default now()
);
alter table public.plataforma_registro enable row level security;
drop policy if exists plataforma_lee on public.plataforma_registro;
create policy plataforma_lee on public.plataforma_registro for select using (jwt_rol() = 'plataforma');

-- Avisos para la plataforma (por ahora: un Gerencia olvido su clave).
create table if not exists public.plataforma_avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  mensaje text not null,
  cliente_id uuid references public.clientes_plataforma(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  atendido boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.plataforma_avisos enable row level security;
drop policy if exists plataforma_todo on public.plataforma_avisos;
create policy plataforma_todo on public.plataforma_avisos for all using (jwt_rol() = 'plataforma') with check (jwt_rol() = 'plataforma');

-- Usuarios de todos los clientes, sin datos del negocio: quien es, su rol,
-- si esta activo, si tiene acceso creado y cuando entro por ultima vez.
create or replace function public.plataforma_usuarios()
 returns table (id uuid, usuario text, nombre text, rol text, activo boolean, cliente_id uuid, empresas jsonb,
                debe_cambiar_clave boolean, tiene_acceso boolean, ultimo_acceso timestamptz, created_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select u.id, u.usuario::text, u.nombre::text, u.rol::text, coalesce(u.activo, true), u.cliente_id, u.empresas::jsonb,
    u.debe_cambiar_clave, u.auth_user_id is not null,
    (select max(s.ultimo_acceso) from public.sesiones_activas s where s.usuario_id = u.id),
    u.created_at::timestamptz
  from public.usuarios u
  where u.rol <> 'plataforma'
  order by u.nombre;
end;
$function$;
revoke all on function public.plataforma_usuarios() from public, anon;
grant execute on function public.plataforma_usuarios() to authenticated;

-- El propio usuario, ya con su clave nueva, quita la marca de cambio obligatorio.
create or replace function public.clave_cambiada()
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.usuarios set debe_cambiar_clave = false where auth_user_id = auth.uid();
$function$;
revoke all on function public.clave_cambiada() from public, anon;
grant execute on function public.clave_cambiada() to authenticated;

-- La plataforma cambia el nombre con el que aparece en su consola.
create or replace function public.plataforma_mi_nombre(p_nombre text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe tu nombre';
  end if;
  update public.usuarios set nombre = trim(p_nombre) where auth_user_id = auth.uid();
end;
$function$;
revoke all on function public.plataforma_mi_nombre(text) from public, anon;
grant execute on function public.plataforma_mi_nombre(text) to authenticated;
