-- Modulo de Ajustes de Inventario con segregacion de funciones.
--
-- Problema real: guardarConteo() en conteo/page.js hoy BORRA y REEMPLAZA el
-- conteo del dia sin ningun bloqueo -- quien hizo el conteo fisico puede
-- volver a entrar despues de ver una alerta de descuadre y "corregirlo",
-- borrando la evidencia. Este cambio:
--   1. Bloquea conteo_fisico a nivel de base de datos (constraint unico +
--      RLS) para que una vez insertado el conteo del dia, un auxiliar no
--      pueda editarlo/borrarlo -- solo alguien con puede_aprobar_inventario.
--   2. Cada diferencia queda registrada en divergencias_inventario en
--      estado 'pendiente', con su propio historial de auditoria.
--   3. /ajustes-inventario (nuevo modulo, gateado por el permiso puntual
--      puede_aprobar_inventario, no por rol) deja aprobar (ajusta
--      inventario_mov para que el stock futuro refleje el conteo fisico) o
--      rechazar (queda registrado, sin efecto en inventario) cada
--      divergencia.
--   4. Separado del sistema de roles existente a proposito -- ver el punto
--      "permisos configurables" del pedido: un flag puntual en usuarios,
--      no un sistema de roles nuevo.

-- ============ usuarios: permiso puntual, no un rol nuevo ============
alter table public.usuarios
  add column if not exists puede_aprobar_inventario boolean not null default false;

update public.usuarios set puede_aprobar_inventario = true where usuario in ('jero', 'kathe');

create or replace function public.jwt_puede_aprobar_inventario()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select puede_aprobar_inventario from public.usuarios where auth_user_id = auth.uid()),
    false
  );
$$;

-- ============ conteo_fisico: bloqueo real ============
-- Un conteo ya guardado para (empresa, fecha, sku) no se puede volver a
-- insertar -- el guard de la app tambien avisa antes, pero la garantia real
-- es esta.
alter table public.conteo_fisico
  add constraint conteo_fisico_unico unique (empresa_id, fecha, sku);

-- Solo admin o quien tenga el permiso puntual puede editar/borrar un conteo
-- ya guardado (necesario para que un admin pueda reiniciar el conteo del
-- dia si hace falta). Select/insert quedan como estaban (0004).
drop policy if exists "empresa_id_update" on public.conteo_fisico;
create policy "empresa_id_update" on public.conteo_fisico
for update using (
  empresa_id = any (public.jwt_empresa_ids())
  and (public.jwt_rol() = 'admin' or public.jwt_puede_aprobar_inventario())
)
with check (
  empresa_id = any (public.jwt_empresa_ids())
  and (public.jwt_rol() = 'admin' or public.jwt_puede_aprobar_inventario())
);

drop policy if exists "empresa_id_delete" on public.conteo_fisico;
create policy "empresa_id_delete" on public.conteo_fisico
for delete using (
  empresa_id = any (public.jwt_empresa_ids())
  and (public.jwt_rol() = 'admin' or public.jwt_puede_aprobar_inventario())
);

-- ============ divergencias_inventario ============
create table if not exists public.divergencias_inventario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fecha date not null,
  sku text not null,
  cantidad_sistema numeric not null,
  cantidad_fisica numeric not null,
  diferencia numeric not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  registrado_por text not null,
  revisado_por uuid references public.usuarios(id),
  revisado_en timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now()
);

alter table public.divergencias_inventario enable row level security;

-- Quien tiene el permiso ve todas las de su empresa; cualquier otro solo ve
-- las que el mismo registro (su propio conteo).
create policy "divergencias_select" on public.divergencias_inventario
for select using (
  empresa_id = any (public.jwt_empresa_ids())
  and (
    public.jwt_puede_aprobar_inventario()
    or registrado_por = (select nombre from public.usuarios where auth_user_id = auth.uid())
  )
);

create policy "divergencias_insert" on public.divergencias_inventario
for insert with check (empresa_id = any (public.jwt_empresa_ids()));

create policy "divergencias_update" on public.divergencias_inventario
for update using (
  empresa_id = any (public.jwt_empresa_ids()) and public.jwt_puede_aprobar_inventario()
)
with check (
  empresa_id = any (public.jwt_empresa_ids()) and public.jwt_puede_aprobar_inventario()
);

-- ============ audit_ajustes_inventario ============
create table if not exists public.audit_ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  divergencia_id uuid not null references public.divergencias_inventario(id),
  accion text not null check (accion in ('creada', 'aprobada', 'rechazada')),
  usuario text not null,
  detalle text,
  created_at timestamptz not null default now()
);

alter table public.audit_ajustes_inventario enable row level security;

create policy "audit_select" on public.audit_ajustes_inventario
for select using (
  empresa_id = any (public.jwt_empresa_ids())
  and (
    public.jwt_puede_aprobar_inventario()
    or exists (
      select 1 from public.divergencias_inventario d
      where d.id = audit_ajustes_inventario.divergencia_id
      and d.registrado_por = (select nombre from public.usuarios where auth_user_id = auth.uid())
    )
  )
);

create policy "audit_insert" on public.audit_ajustes_inventario
for insert with check (empresa_id = any (public.jwt_empresa_ids()));
