-- Devolucion de un cliente o distribuidor: producto bueno que vuelve a bodega
-- (al lote del dia que se le vendio) y se le descuenta de lo que debe con una
-- nota credito (sin plata: no entra a ninguna cuenta).
alter table public.novedades add column if not exists cliente_id uuid references public.clientes(id);
alter table public.novedades add column if not exists nombre_cliente text;
alter table public.novedades add column if not exists precio numeric;
alter table public.novedades add column if not exists fecha_lote date;

create or replace function public.nota_credito_cartera(p_cartera_id uuid, p_valor numeric, p_fecha date, p_nota text, p_usuario text)
returns numeric language plpgsql security definer set search_path = public as $$
declare f record; v_resta numeric;
begin
  if public.jwt_rol() not in ('admin', 'auxiliar') then raise exception 'No tienes permiso para registrar notas credito'; end if;
  select * into f from public.cartera_fiados where id = p_cartera_id for update;
  if f.id is null or not (f.empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Credito no encontrado'; end if;
  if f.estado <> 'pendiente' then raise exception 'Este credito ya esta pagado'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El valor debe ser mayor a 0'; end if;
  if p_valor > coalesce(f.saldo, 0) + 0.5 then raise exception 'La nota credito ($%) es mayor que lo que debe ($%)', p_valor, f.saldo; end if;

  insert into public.abonos_cartera (empresa_id, cartera_fiado_id, fecha, valor, cuenta_id, nota, registrado_por)
  values (f.empresa_id, f.id, p_fecha, p_valor, null, coalesce(nullif(trim(p_nota), ''), 'Nota credito por devolucion'), p_usuario);

  v_resta := greatest(coalesce(f.saldo, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.cartera_fiados set saldo = 0, estado = 'pagado', fecha_pagado = now() where id = f.id;
    v_resta := 0;
  else
    update public.cartera_fiados set saldo = v_resta where id = f.id;
  end if;
  return v_resta;
end $$;
