-- Demo vencida o cliente suspendido: puede ver todo lo suyo, pero no registrar
-- nada nuevo. La regla vive en la base (politica restrictiva en cada tabla con
-- empresa_id), asi vale para todas las pantallas. No se borra nada.

create or replace function public.mi_plan()
 returns table (estado text, demo_hasta date, dias int)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.estado, c.demo_hasta, (c.demo_hasta - (now() at time zone 'America/Bogota')::date)::int
  from public.clientes_plataforma c where c.id = jwt_cliente_id()
$function$;
grant execute on function public.mi_plan() to authenticated;

create or replace function public.cliente_bloqueado()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select c.estado in ('vencido', 'suspendido') or (c.estado = 'demo' and c.demo_hasta is not null and c.demo_hasta < (now() at time zone 'America/Bogota')::date)
    from public.clientes_plataforma c where c.id = jwt_cliente_id()
  ), false)
$function$;
grant execute on function public.cliente_bloqueado() to authenticated;

do $$
declare t record;
begin
  for t in select pt.tablename from pg_tables pt join information_schema.columns c on c.table_name = pt.tablename and c.table_schema = pt.schemaname
           where pt.schemaname = 'public' and c.column_name = 'empresa_id' and pt.rowsecurity and pt.tablename <> 'sesiones_activas' loop
    execute format('drop policy if exists solo_lectura_ins on public.%I', t.tablename);
    execute format('drop policy if exists solo_lectura_upd on public.%I', t.tablename);
    execute format('drop policy if exists solo_lectura_del on public.%I', t.tablename);
    execute format('create policy solo_lectura_ins on public.%I as restrictive for insert to authenticated with check (not (select public.cliente_bloqueado()))', t.tablename);
    execute format('create policy solo_lectura_upd on public.%I as restrictive for update to authenticated using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()))', t.tablename);
    execute format('create policy solo_lectura_del on public.%I as restrictive for delete to authenticated using (not (select public.cliente_bloqueado()))', t.tablename);
  end loop;
end $$;
