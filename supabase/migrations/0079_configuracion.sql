-- Configuración: datos legales completos de la empresa y cierre de sesión a
-- distancia (solo Gerencia). Al cerrar, se revocan las sesiones del usuario:
-- en máximo una hora (vencimiento del token actual) le pide entrar de nuevo.

alter table empresas add column if not exists razon_social text;
alter table empresas add column if not exists dv text;
alter table empresas add column if not exists regimen text;

create or replace function public.cerrar_sesiones_usuario(p_usuario_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_auth uuid;
begin
  if not jwt_es_gerencia() then raise exception 'Solo Gerencia puede cerrar sesiones de otros usuarios'; end if;
  select auth_user_id into v_auth from public.usuarios where id = p_usuario_id;
  if v_auth is null then return; end if;
  delete from auth.refresh_tokens where user_id = v_auth::text;
  delete from auth.sessions where user_id = v_auth;
  update public.sesiones_activas set activo = false where usuario_id = p_usuario_id;
end $$;
revoke all on function public.cerrar_sesiones_usuario(uuid) from public;
grant execute on function public.cerrar_sesiones_usuario(uuid) to authenticated;
