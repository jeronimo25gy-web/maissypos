-- Abono de Cartera por transferencia que todavía no se ve en el banco: baja la
-- deuda del cliente pero la plata no entra a la cuenta; queda en Cartera ›
-- Transferencias. "Llegó" la entra al banco (y le pone la cuenta al abono);
-- "No llegó" vuelve a dejar la deuda en Cartera.
alter table public.transferencias_ruta drop constraint if exists transferencias_ruta_origen_check;
alter table public.transferencias_ruta add constraint transferencias_ruta_origen_check check (origen = any (array['manual', 'foto', 'mostrador', 'domicilio', 'cartera']));
alter table public.transferencias_ruta add column if not exists abono_cartera_id uuid references public.abonos_cartera(id) on delete set null;

create or replace function public.abonar_cartera_por_verificar(p_cartera_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare f record; v_abono_id uuid; v_resta numeric;
begin
  if public.jwt_rol() not in ('admin', 'auxiliar') then raise exception 'No tienes permiso para registrar abonos'; end if;
  select * into f from public.cartera_fiados where id = p_cartera_id for update;
  if f.id is null or not (f.empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Credito no encontrado'; end if;
  if f.estado <> 'pendiente' then raise exception 'Este credito ya esta pagado'; end if;
  if p_cuenta_id is not null and not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = f.empresa_id) then raise exception 'Cuenta no valida'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;
  if p_valor > coalesce(f.saldo, 0) + 0.5 then raise exception 'El abono ($%) es mayor que lo que debe ($%)', p_valor, f.saldo; end if;

  insert into public.abonos_cartera (empresa_id, cartera_fiado_id, fecha, valor, cuenta_id, nota, registrado_por)
  values (f.empresa_id, f.id, p_fecha, p_valor, null, coalesce(nullif(trim(p_nota), '') || ' · ', '') || 'Transferencia por verificar', p_usuario)
  returning id into v_abono_id;

  v_resta := greatest(coalesce(f.saldo, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.cartera_fiados set saldo = 0, estado = 'pagado', fecha_pagado = now() where id = f.id;
    v_resta := 0;
  else
    update public.cartera_fiados set saldo = v_resta where id = f.id;
  end if;

  insert into public.transferencias_ruta (empresa_id, fecha, valor, referencia, estado, fecha_limite, origen, cuenta_id, abono_cartera_id, registrado_por)
  values (f.empresa_id, p_fecha, p_valor, 'Abono crédito: ' || coalesce(f.nombre_cliente, ''), 'por_verificar', p_fecha + 3, 'cartera', p_cuenta_id, v_abono_id, p_usuario);

  return v_resta;
end $$;
grant execute on function public.abonar_cartera_por_verificar(uuid, numeric, uuid, date, text, text) to authenticated;
