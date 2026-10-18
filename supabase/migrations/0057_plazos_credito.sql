-- Todo credito pendiente tiene fecha de pago: si no se pone, sale del plazo
-- del cliente (dias_credito, 0 = sin plazo propio) o del plazo general de la
-- empresa (configuracion plazo_credito_dias, 7 por defecto). Sin fecha un
-- credito nunca se vence y no aparece en pendientes ni en la hoja de cobro.
-- Proveedores: plazo propio (dias_credito) o el general (plazo_proveedor_dias,
-- 30 por defecto), para saber cuando se vence lo que se les debe.

insert into public.configuracion (empresa_id, parametro, valor)
select e.id, x.p, x.v from public.empresas e
cross join (values ('plazo_credito_dias', '7'), ('plazo_proveedor_dias', '30')) as x(p, v)
where not exists (select 1 from public.configuracion c where c.empresa_id = e.id and c.parametro = x.p);

alter table public.proveedores add column if not exists dias_credito integer not null default 0;

create or replace function public.plazo_credito_cliente(p_empresa uuid, p_cliente uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(dias_credito, 0) from clientes where id = p_cliente),
    (select nullif(valor, '')::integer from configuracion where empresa_id = p_empresa and parametro = 'plazo_credito_dias' limit 1),
    7)
$$;

create or replace function public.cartera_fecha_pago_defecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fecha_pago is null and coalesce(new.estado, 'pendiente') = 'pendiente' then
    new.fecha_pago := coalesce(new.fecha_fiado, current_date) + plazo_credito_cliente(new.empresa_id, new.cliente_id);
  end if;
  return new;
end $$;

drop trigger if exists cartera_fecha_pago_defecto on public.cartera_fiados;
create trigger cartera_fecha_pago_defecto before insert or update on public.cartera_fiados
for each row execute function public.cartera_fecha_pago_defecto();

-- Los creditos pendientes que hoy no tienen fecha.
update public.cartera_fiados
set fecha_pago = coalesce(fecha_fiado, created_at::date) + public.plazo_credito_cliente(empresa_id, cliente_id)
where estado = 'pendiente' and fecha_pago is null;
