-- Datos de ejemplo de las demos: quedan marcados para que el cliente los borre
-- con un boton. Lo que ya uso (vendio, despacho, le fio) no se borra: pasa a
-- ser dato suyo.
alter table public.productos add column if not exists es_ejemplo boolean not null default false;
alter table public.clientes add column if not exists es_ejemplo boolean not null default false;
alter table public.proveedores add column if not exists es_ejemplo boolean not null default false;
alter table public.rutas add column if not exists es_ejemplo boolean not null default false;
alter table public.vendedores add column if not exists es_ejemplo boolean not null default false;

drop function if exists public.mi_plan();
create or replace function public.mi_plan()
 returns table (estado text, demo_hasta date, dias int, ejemplos int)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.estado, c.demo_hasta, (c.demo_hasta - (now() at time zone 'America/Bogota')::date)::int,
    ((select count(*) from public.productos p where p.es_ejemplo and p.empresa_id = any (jwt_empresa_ids()))
     + (select count(*) from public.clientes x where x.es_ejemplo and x.empresa_id = any (jwt_empresa_ids())))::int
  from public.clientes_plataforma c where c.id = jwt_cliente_id()
$function$;
grant execute on function public.mi_plan() to authenticated;

create or replace function public.demo_borrar_ejemplos()
 returns table (borrados int, conservados int)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ids uuid[] := jwt_empresa_ids();
  r record;
  b int := 0;
  k int := 0;
begin
  if not jwt_es_gerencia() then
    raise exception 'Solo Gerencia';
  end if;
  delete from public.rutero t using public.clientes c where t.cliente_id = c.id and c.es_ejemplo and c.empresa_id = any (ids);
  for r in select id from public.clientes where es_ejemplo and empresa_id = any (ids) loop
    begin
      delete from public.clientes where id = r.id; b := b + 1;
    exception when foreign_key_violation then
      update public.clientes set es_ejemplo = false where id = r.id; k := k + 1;
    end;
  end loop;
  for r in select p.id, p.sku, p.empresa_id from public.productos p where p.es_ejemplo and p.empresa_id = any (ids) loop
    if exists (select 1 from public.ventas_detalle d where d.sku = r.sku and d.empresa_id = r.empresa_id)
       or exists (select 1 from public.ventas_ruta_detalle d where d.sku = r.sku and d.empresa_id = r.empresa_id)
       or exists (select 1 from public.despachos_detalle d join public.despachos_encab e on e.id = d.despacho_id where d.sku = r.sku and e.empresa_id = r.empresa_id) then
      update public.productos set es_ejemplo = false where id = r.id; k := k + 1;
    else
      begin
        delete from public.conteo_fisico where sku = r.sku and empresa_id = r.empresa_id;
        delete from public.inventario_mov where sku = r.sku and empresa_id = r.empresa_id;
        delete from public.productos where id = r.id; b := b + 1;
      exception when foreign_key_violation then
        update public.productos set es_ejemplo = false where id = r.id; k := k + 1;
      end;
    end if;
  end loop;
  for r in select id from public.vendedores where es_ejemplo and empresa_id = any (ids) loop
    begin delete from public.vendedores where id = r.id; exception when foreign_key_violation then update public.vendedores set es_ejemplo = false where id = r.id; end;
  end loop;
  for r in select id from public.rutas where es_ejemplo and empresa_id = any (ids) loop
    begin delete from public.rutas where id = r.id; exception when foreign_key_violation then update public.rutas set es_ejemplo = false where id = r.id; end;
  end loop;
  for r in select id from public.proveedores where es_ejemplo and empresa_id = any (ids) loop
    begin delete from public.proveedores where id = r.id; exception when foreign_key_violation then update public.proveedores set es_ejemplo = false where id = r.id; end;
  end loop;
  borrados := b; conservados := k;
  return next;
end;
$function$;
grant execute on function public.demo_borrar_ejemplos() to authenticated;
