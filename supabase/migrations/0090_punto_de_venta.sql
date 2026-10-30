-- Plan, precio, cliente y modelos de una empresa los maneja solo la Plataforma
-- (o Gerencia los modelos de sus propias empresas). El administrador de un
-- cliente puede editar sus datos, pero no cambiarse el plan.
create or replace function public.empresas_proteger_plan()
 returns trigger
 language plpgsql
as $function$
begin
  if auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or coalesce(jwt_rol(), '') = 'plataforma' then return new; end if;
  if new.cliente_id is distinct from old.cliente_id or new.plan is distinct from old.plan or new.precio_mensual is distinct from old.precio_mensual then
    raise exception 'El plan solo lo cambia MaissyPOS';
  end if;
  if new.modelos is distinct from old.modelos and not jwt_es_gerencia() then
    raise exception 'Los modelos solo los cambia Gerencia';
  end if;
  return new;
end;
$function$;
drop trigger if exists empresas_proteger_plan on public.empresas;
create trigger empresas_proteger_plan before update on public.empresas
  for each row execute function public.empresas_proteger_plan();
