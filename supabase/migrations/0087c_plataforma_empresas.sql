-- Nombre, plan y precio de cada empresa para la consola de Plataforma, sin
-- abrirle los datos de las empresas.
create or replace function public.plataforma_empresas()
 returns table (id uuid, nombre text, nit text, plan text, precio_mensual numeric, cliente_id uuid, activo boolean, modelos text[])
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(jwt_rol(), '') <> 'plataforma' then
    raise exception 'Solo la plataforma';
  end if;
  return query select e.id, e.nombre, e.nit, e.plan, e.precio_mensual, e.cliente_id, e.activo, e.modelos::text[] from public.empresas e order by e.nombre;
end;
$function$;
grant execute on function public.plataforma_empresas() to authenticated;
