-- Cliente suspendido: no lee ni escribe nada de sus empresas. (La demo vencida
-- sigue en solo lectura.) El usuario solo alcanza a ver su propio perfil, para
-- que la pantalla le diga que la cuenta esta suspendida.
create or replace function public.cliente_suspendido()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select c.estado = 'suspendido' from public.clientes_plataforma c where c.id = jwt_cliente_id()), false)
$function$;
grant execute on function public.cliente_suspendido() to authenticated;

do $$
declare t record;
begin
  for t in select pt.tablename from pg_tables pt join information_schema.columns c on c.table_name = pt.tablename and c.table_schema = pt.schemaname
           where pt.schemaname = 'public' and c.column_name = 'empresa_id' and pt.rowsecurity and pt.tablename <> 'sesiones_activas' loop
    execute format('drop policy if exists suspendido_sin_lectura on public.%I', t.tablename);
    execute format('create policy suspendido_sin_lectura on public.%I as restrictive for select to authenticated using (not (select public.cliente_suspendido()))', t.tablename);
  end loop;
end $$;
