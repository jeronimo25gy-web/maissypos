-- Abonos parciales a proveedores (cuentas por pagar) y a creditos de clientes
-- (cartera), con historial. Cada abono es una sola transaccion: registra el
-- abono, baja el saldo y mueve la caja/banco. Cuando el saldo llega a 0 queda
-- pagado igual que antes.

create table if not exists public.abonos_proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  proveedor_id uuid not null references public.proveedores(id),
  fecha date not null,
  valor numeric not null check (valor > 0),
  cuenta_id uuid references public.cuentas(id),
  nota text,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists abonos_proveedores_proveedor_idx on public.abonos_proveedores (proveedor_id, fecha desc);
alter table public.abonos_proveedores enable row level security;
create policy abonos_proveedores_select on public.abonos_proveedores for select
  using (empresa_id = any (public.jwt_empresa_ids()));

create table if not exists public.abonos_cartera (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cartera_fiado_id uuid not null references public.cartera_fiados(id) on delete cascade,
  fecha date not null,
  valor numeric not null check (valor > 0),
  cuenta_id uuid references public.cuentas(id),
  nota text,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists abonos_cartera_fiado_idx on public.abonos_cartera (cartera_fiado_id, fecha desc);
alter table public.abonos_cartera enable row level security;
create policy abonos_cartera_select on public.abonos_cartera for select
  using (empresa_id = any (public.jwt_empresa_ids()));

-- Las escrituras van solo por estas funciones (sin policy de insert directo).

create or replace function public.abonar_proveedor(
  p_proveedor_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa_id uuid; v_nombre text; v_factura_id uuid; v_pendiente numeric; v_abono_id uuid; v_resta numeric;
begin
  if public.jwt_rol() <> 'admin' then raise exception 'Solo un administrador registra pagos a proveedores'; end if;
  select empresa_id, nombre into v_empresa_id, v_nombre from public.proveedores where id = p_proveedor_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Proveedor no encontrado'; end if;
  if p_cuenta_id is null then raise exception 'Selecciona de que cuenta sale el pago'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = v_empresa_id) then raise exception 'Cuenta no valida'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;

  select id, total_pendiente into v_factura_id, v_pendiente from public.facturas_proveedores
  where proveedor_id = p_proveedor_id and empresa_id = v_empresa_id and estado = 'pendiente' limit 1 for update;
  if v_factura_id is null then raise exception 'Este proveedor no tiene saldo pendiente'; end if;
  if p_valor > coalesce(v_pendiente, 0) + 0.5 then
    raise exception 'El abono ($%) es mayor que lo que se debe ($%)', p_valor, v_pendiente;
  end if;

  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por)
  values (v_empresa_id, p_proveedor_id, p_fecha, p_valor, p_cuenta_id, nullif(trim(p_nota), ''), p_usuario)
  returning id into v_abono_id;

  v_resta := greatest(coalesce(v_pendiente, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.facturas_proveedores set total_pendiente = 0, estado = 'pagado', updated_at = now() where id = v_factura_id;
    update public.compras_encab set estado = 'pagada', updated_at = now()
    where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    update public.compras set estado = 'pagada'
    where proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    v_resta := 0;
  else
    update public.facturas_proveedores set total_pendiente = v_resta, updated_at = now() where id = v_factura_id;
  end if;

  insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
  values (v_empresa_id, p_cuenta_id, p_fecha, 'salida', p_valor,
    case when v_resta = 0 then 'Pago a ' else 'Abono a ' end || v_nombre, 'abono_proveedor', v_abono_id);

  return v_resta;
end;
$$;
grant execute on function public.abonar_proveedor(uuid, numeric, uuid, date, text, text) to authenticated;

-- "Marcar pagado" (todo el saldo) = un abono por el total, asi queda en el historial.
create or replace function public.marcar_proveedor_pagado(
  p_proveedor_id uuid, p_cuenta_pago_id uuid, p_total numeric, p_nombre_proveedor text, p_fecha date
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.abonar_proveedor(p_proveedor_id, p_total, p_cuenta_pago_id, p_fecha, 'Pago total', null);
end;
$$;
grant execute on function public.marcar_proveedor_pagado(uuid, uuid, numeric, text, date) to authenticated;

create or replace function public.abonar_cartera(
  p_cartera_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  f record; v_abono_id uuid; v_resta numeric;
begin
  if public.jwt_rol() not in ('admin', 'auxiliar') then raise exception 'No tienes permiso para registrar abonos'; end if;
  select * into f from public.cartera_fiados where id = p_cartera_id for update;
  if f.id is null or not (f.empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Credito no encontrado'; end if;
  if f.estado <> 'pendiente' then raise exception 'Este credito ya esta pagado'; end if;
  if p_cuenta_id is null then raise exception 'Selecciona a que cuenta entra la plata'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = f.empresa_id) then raise exception 'Cuenta no valida'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;
  if p_valor > coalesce(f.saldo, 0) + 0.5 then
    raise exception 'El abono ($%) es mayor que lo que debe ($%)', p_valor, f.saldo;
  end if;

  insert into public.abonos_cartera (empresa_id, cartera_fiado_id, fecha, valor, cuenta_id, nota, registrado_por)
  values (f.empresa_id, f.id, p_fecha, p_valor, p_cuenta_id, nullif(trim(p_nota), ''), p_usuario)
  returning id into v_abono_id;

  v_resta := greatest(coalesce(f.saldo, 0) - p_valor, 0);
  if v_resta <= 0.5 then
    update public.cartera_fiados set saldo = 0, estado = 'pagado', fecha_pagado = now() where id = f.id;
    v_resta := 0;
  else
    update public.cartera_fiados set saldo = v_resta where id = f.id;
  end if;

  insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
  values (f.empresa_id, p_cuenta_id, p_fecha, 'entrada', p_valor,
    case when v_resta = 0 then 'Pago de credito: ' else 'Abono de credito: ' end || coalesce(f.nombre_cliente, ''), 'abono_cartera', v_abono_id);

  return v_resta;
end;
$$;
grant execute on function public.abonar_cartera(uuid, numeric, uuid, date, text, text) to authenticated;
