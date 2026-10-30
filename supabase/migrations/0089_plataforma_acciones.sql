-- La consola de Plataforma cambia el plan, el precio y si una empresa esta
-- activa, sin poder tocar nada mas de la empresa.
create or replace function public.plataforma_actualizar_empresa(p_id uuid, p_plan text, p_precio numeric, p_activo boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  update public.empresas set plan = coalesce(p_plan, plan), precio_mensual = p_precio, activo = coalesce(p_activo, activo) where id = p_id;
end;
$function$;
grant execute on function public.plataforma_actualizar_empresa(uuid, text, numeric, boolean) to authenticated;
