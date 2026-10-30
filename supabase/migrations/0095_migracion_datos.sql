-- Migracion de datos de un cliente nuevo (Excel u otro sistema). Cada carga es
-- un lote: lo que entra queda marcado con el lote y se puede deshacer completo.
-- Lo que el cliente ya uso (vendio, abono, visito) no se borra: se conserva.
-- Solo la llave del servidor toca estas tablas y funciones; la consola entra
-- por /api/plataforma/migracion, que exige el rol plataforma.
create table if not exists public.migracion_lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  paso text not null check (paso in ('proveedores', 'productos', 'clientes', 'inventario', 'cartera', 'por_pagar')),
  archivo text,
  fecha_corte date not null,
  filas int not null default 0,
  fuera int not null default 0,
  total numeric not null default 0,
  creados jsonb not null default '{}'::jsonb,
  creado_por text,
  created_at timestamptz not null default now(),
  deshecho_at timestamptz,
  conservados int not null default 0
);
create index if not exists migracion_lotes_empresa on public.migracion_lotes (empresa_id, created_at desc);
alter table public.migracion_lotes enable row level security;
revoke all on public.migracion_lotes from anon, authenticated;

alter table public.proveedores add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.categorias_producto add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.productos add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.rutas add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.vendedores add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.clientes add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.rutero add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.conteo_fisico add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.cartera_fiados add column if not exists migracion_lote uuid references public.migracion_lotes(id);
alter table public.facturas_proveedores add column if not exists migracion_lote uuid references public.migracion_lotes(id);

create or replace function public.migracion_sku_usado(p_empresa uuid, p_sku text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.ventas_detalle d where d.sku = p_sku and d.empresa_id = p_empresa)
      or exists (select 1 from public.ventas_ruta_detalle d where d.sku = p_sku and d.empresa_id = p_empresa)
      or exists (select 1 from public.despachos_detalle d join public.despachos_encab e on e.id = d.despacho_id where d.sku = p_sku and e.empresa_id = p_empresa)
      or exists (select 1 from public.compras d where d.sku = p_sku and d.empresa_id = p_empresa)
      or exists (select 1 from public.inventario_mov d where d.sku = p_sku and d.empresa_id = p_empresa)
$function$;

create or replace function public.migracion_deshacer(p_lote uuid, p_final boolean default true)
 returns table (borrados int, conservados int)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  l public.migracion_lotes%rowtype;
  r record;
  b int := 0;
  k int := 0;
begin
  select * into l from public.migracion_lotes where id = p_lote for update;
  if not found then raise exception 'Lote no encontrado'; end if;
  if l.deshecho_at is not null then raise exception 'Este lote ya se deshizo'; end if;

  for r in select id, saldo, valor_original from public.cartera_fiados where migracion_lote = p_lote loop
    if r.saldo = r.valor_original and not exists (select 1 from public.abonos_cartera a where a.cartera_fiado_id = r.id) then
      begin
        delete from public.cartera_fiados where id = r.id; b := b + 1;
      exception when foreign_key_violation then k := k + 1;
      end;
    else
      k := k + 1;
    end if;
  end loop;

  for r in select id, proveedor_id from public.facturas_proveedores where migracion_lote = p_lote loop
    if exists (select 1 from public.abonos_proveedores a where a.proveedor_id = r.proveedor_id and a.empresa_id = l.empresa_id and a.created_at > l.created_at)
       or exists (select 1 from public.compras_encab c where c.proveedor_id = r.proveedor_id and c.empresa_id = l.empresa_id and c.created_at > l.created_at) then
      k := k + 1;
    else
      delete from public.facturas_proveedores where id = r.id; b := b + 1;
    end if;
  end loop;

  for r in select id, sku from public.conteo_fisico where migracion_lote = p_lote loop
    if public.migracion_sku_usado(l.empresa_id, r.sku) then
      k := k + 1;
    else
      delete from public.conteo_fisico where id = r.id; b := b + 1;
    end if;
  end loop;

  -- Clientes: rutero, visitas y precios caen en cascada; si ya lo visitaron, se conserva.
  for r in select id from public.clientes where migracion_lote = p_lote loop
    if exists (select 1 from public.visitas_ruta v where v.cliente_id = r.id)
       or exists (select 1 from public.clientes_precios p where p.cliente_id = r.id) then
      k := k + 1;
    else
      begin
        delete from public.clientes where id = r.id; b := b + 1;
      exception when foreign_key_violation then k := k + 1;
      end;
    end if;
  end loop;
  for r in select id from public.vendedores where migracion_lote = p_lote loop
    begin delete from public.vendedores where id = r.id; exception when foreign_key_violation then null; end;
  end loop;
  for r in select id from public.rutas where migracion_lote = p_lote loop
    begin delete from public.rutas where id = r.id; exception when foreign_key_violation then null; end;
  end loop;

  for r in select id, sku from public.productos where migracion_lote = p_lote loop
    if public.migracion_sku_usado(l.empresa_id, r.sku) then
      k := k + 1;
    else
      begin
        delete from public.productos where id = r.id; b := b + 1;
      exception when foreign_key_violation then k := k + 1;
      end;
    end if;
  end loop;
  delete from public.categorias_producto c where c.migracion_lote = p_lote
    and not exists (select 1 from public.productos p where p.empresa_id = c.empresa_id and p.categoria = c.nombre);

  for r in select id from public.proveedores where migracion_lote = p_lote loop
    begin
      delete from public.proveedores where id = r.id; b := b + 1;
    exception when foreign_key_violation then k := k + 1;
    end;
  end loop;

  -- p_final = false: una carga que fallo a mitad de camino; el lote desaparece.
  if p_final then
    update public.migracion_lotes set deshecho_at = now(), conservados = k where id = p_lote;
  else
    delete from public.migracion_lotes where id = p_lote;
  end if;
  borrados := b; conservados := k;
  return next;
end;
$function$;

revoke all on function public.migracion_sku_usado(uuid, text) from public, anon, authenticated;
revoke all on function public.migracion_deshacer(uuid, boolean) from public, anon, authenticated;
grant execute on function public.migracion_sku_usado(uuid, text) to service_role;
grant execute on function public.migracion_deshacer(uuid, boolean) to service_role;
