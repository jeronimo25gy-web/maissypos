-- Fase 2 del plan de migracion a Supabase Auth: antes de llamar
-- signInWithPassword hace falta saber el email real de la cuenta -- para
-- jero/kathy es su correo personal, para el resto es el sintetico
-- {usuario}@maissypos.internal. Esta funcion lo resuelve sin exponer las
-- columnas email/auth_user_id (ya restringidas al rol anon) directamente.
--
-- Correr esto en el SQL Editor de Supabase. No rompe nada al correrlo: solo
-- agrega una funcion nueva.
create or replace function public.usuario_a_email(p_usuario text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(email, usuario || '@maissypos.internal')
  from public.usuarios
  where lower(usuario) = lower(p_usuario)
  limit 1;
$$;

revoke all on function public.usuario_a_email(text) from public;
grant execute on function public.usuario_a_email(text) to anon, authenticated;
