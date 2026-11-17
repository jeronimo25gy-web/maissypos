-- Pagos a proveedores: anular (solo Gerencia) y pagar con plata de la otra
-- empresa del grupo.
--
-- 1. Solo Gerencia anula. Las anulaciones hechas desde la app (ventas de
--    mostrador, gastos, incapacidades, cochadas) se bloquean en la base para
--    cualquier otro usuario. Lo que hacen las funciones del sistema por dentro
--    (venta interna) no pasa por esta regla.
-- 2. anular_abono_proveedor: borra un pago mal registrado, devuelve el valor a
--    lo que se le debe al proveedor y la plata a la cuenta de donde salió.
--    Los cruces de liquidación se corrigen desde la liquidación.
-- 3. abonar_proveedor con p_pagado_por: la otra empresa del grupo le pagó al
--    proveedor (Arepas Maissy le pagó a Yeimer por Distri). No sale plata de
--    ninguna cuenta de esta empresa; sube lo que esta empresa le debe a la otra
--    y allá queda el cobro en Cartera.

-- ---------- 1. Solo Gerencia anula ----------
create or replace function public.solo_gerencia_anula() returns trigger
language plpgsql set search_path to 'public' as $$
declare v_antes boolean; v_despues boolean;
begin
  if current_user <> 'authenticated' or public.jwt_es_gerencia() then return new; end if;
  if tg_table_name = 'ventas_encab' then
    v_antes := old.estado = 'anulada'; v_despues := new.estado = 'anulada';
  elsif tg_table_name = 'gastos_admin' then
    v_antes := coalesce(old.anulado, false); v_despues := coalesce(new.anulado, false);
  else
    v_antes := coalesce(old.anulada, false); v_despues := coalesce(new.anulada, false);
  end if;
  if v_despues and not v_antes then raise exception 'Solo Gerencia puede anular'; end if;
  return new;
end $$;

drop trigger if exists solo_gerencia_anula on public.ventas_encab;
create trigger solo_gerencia_anula before update on public.ventas_encab for each row execute function public.solo_gerencia_anula();
drop trigger if exists solo_gerencia_anula on public.gastos_admin;
create trigger solo_gerencia_anula before update on public.gastos_admin for each row execute function public.solo_gerencia_anula();
drop trigger if exists solo_gerencia_anula on public.nomina_incapacidades;
create trigger solo_gerencia_anula before update on public.nomina_incapacidades for each row execute function public.solo_gerencia_anula();
drop trigger if exists solo_gerencia_anula on public.produccion_cochadas;
create trigger solo_gerencia_anula before update on public.produccion_cochadas for each row execute function public.solo_gerencia_anula();

-- ---------- Columnas ----------
alter table public.abonos_proveedores add column if not exists pagado_por_empresa_id uuid references public.empresas(id);
alter table public.abonos_proveedores add column if not exists cartera_fiado_id uuid references public.cartera_fiados(id);
-- Qué es un crédito que no viene de una venta (p. ej. "Pago a Yeimer por cuenta de Distri Maissy").
alter table public.cartera_fiados add column if not exists concepto text;

alter table public.correcciones drop constraint if exists correcciones_tipo_check;
alter table public.correcciones add constraint correcciones_tipo_check check (tipo in ('despacho', 'compra', 'abono_proveedor'));

-- Sube lo que una empresa le debe a un proveedor (abre la cuenta si no hay).
create or replace function public._sumar_deuda_proveedor(p_empresa uuid, p_proveedor uuid, p_valor numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_factura uuid;
begin
  select id into v_factura from public.facturas_proveedores
    where proveedor_id = p_proveedor and empresa_id = p_empresa and estado = 'pendiente' limit 1 for update;
  if v_factura is null then
    select id into v_factura from public.facturas_proveedores
      where proveedor_id = p_proveedor and empresa_id = p_empresa order by updated_at desc limit 1 for update;
  end if;
  if v_factura is null then
    insert into public.facturas_proveedores (empresa_id, proveedor_id, total_pendiente, estado) values (p_empresa, p_proveedor, p_valor, 'pendiente');
  else
    update public.facturas_proveedores set total_pendiente = coalesce(total_pendiente, 0) + p_valor, estado = 'pendiente', updated_at = now() where id = v_factura;
  end if;
end $$;
revoke execute on function public._sumar_deuda_proveedor(uuid, uuid, numeric) from public, anon, authenticated;

-- ---------- 3. Abonar (con pago de la otra empresa) ----------
drop function if exists public.abonar_proveedor(uuid, numeric, uuid, date, text, text, uuid[]);
create or replace function public.abonar_proveedor(p_proveedor_id uuid, p_valor numeric, p_cuenta_id uuid, p_fecha date, p_nota text, p_usuario text,
  p_compra_ids uuid[] default null, p_pagado_por uuid default null)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare
  v_empresa_id uuid; v_nombre text; v_factura_id uuid; v_pendiente numeric; v_abono_id uuid; v_resta numeric;
  v_prov_grupo uuid; v_cli record; v_esta record; v_fiado uuid;
begin
  if public.jwt_rol() <> 'admin' then raise exception 'Solo un administrador registra pagos a proveedores'; end if;
  select empresa_id, nombre into v_empresa_id, v_nombre from public.proveedores where id = p_proveedor_id;
  if v_empresa_id is null or not (v_empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Proveedor no encontrado'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'El abono debe ser mayor a 0'; end if;

  if p_pagado_por is not null then
    -- La otra empresa tiene que estar ligada como proveedor de esta.
    select id into v_prov_grupo from public.proveedores
      where empresa_id = v_empresa_id and empresa_grupo_id = p_pagado_por and empresa_grupo_id <> v_empresa_id limit 1;
    if v_prov_grupo is null then raise exception 'Esa empresa no está ligada como proveedor de esta'; end if;
    if v_prov_grupo = p_proveedor_id then raise exception 'Escoja una cuenta: este proveedor es la misma empresa que pagaría'; end if;
  else
    if p_cuenta_id is null then raise exception 'Selecciona de que cuenta sale el pago'; end if;
    if not exists (select 1 from public.cuentas where id = p_cuenta_id and empresa_id = v_empresa_id) then raise exception 'Cuenta no valida'; end if;
  end if;

  select id, total_pendiente into v_factura_id, v_pendiente from public.facturas_proveedores
  where proveedor_id = p_proveedor_id and empresa_id = v_empresa_id and estado = 'pendiente' limit 1 for update;
  if v_factura_id is null then raise exception 'Este proveedor no tiene saldo pendiente'; end if;
  if p_valor > coalesce(v_pendiente, 0) + 0.5 then
    raise exception 'El abono ($%) es mayor que lo que se debe ($%)', p_valor, v_pendiente;
  end if;

  -- Pagó la otra empresa: allá queda el cobro a esta en Cartera.
  if p_pagado_por is not null then
    select * into v_esta from public.empresas where id = v_empresa_id;
    select * into v_cli from public.clientes where empresa_id = p_pagado_por and empresa_grupo_id = v_empresa_id limit 1;
    if v_cli.id is null then
      insert into public.clientes (empresa_id, nombre, nit, telefono, estado, empresa_grupo_id)
      values (p_pagado_por, v_esta.nombre, v_esta.nit, v_esta.telefono, true, v_empresa_id)
      returning * into v_cli;
    end if;
    insert into public.cartera_fiados (empresa_id, cliente_id, nombre_cliente, valor_original, saldo, fecha_fiado, fecha_pago, estado, concepto)
    values (p_pagado_por, v_cli.id, v_cli.nombre, p_valor, p_valor, p_fecha, p_fecha + coalesce(nullif(v_cli.dias_credito, 0), 7), 'pendiente',
      'Pago a ' || v_nombre || ' por cuenta de ' || v_esta.nombre)
    returning id into v_fiado;
    perform public._sumar_deuda_proveedor(v_empresa_id, v_prov_grupo, p_valor);
  end if;

  insert into public.abonos_proveedores (empresa_id, proveedor_id, fecha, valor, cuenta_id, nota, registrado_por, pagado_por_empresa_id, cartera_fiado_id)
  values (v_empresa_id, p_proveedor_id, p_fecha, p_valor, case when p_pagado_por is null then p_cuenta_id end, nullif(trim(p_nota), ''), p_usuario, p_pagado_por, v_fiado)
  returning id into v_abono_id;

  -- Las compras escogidas quedan pagadas.
  if p_compra_ids is not null and array_length(p_compra_ids, 1) > 0 then
    update public.compras_encab set estado = 'pagada', updated_at = now()
    where id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
    update public.compras set estado = 'pagada'
    where compra_id = any (p_compra_ids) and proveedor_id = p_proveedor_id and estado = 'confirmada' and empresa_id = v_empresa_id;
  end if;

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

  if p_pagado_por is null then
    insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
    values (v_empresa_id, p_cuenta_id, p_fecha, 'salida', p_valor,
      case when v_resta = 0 then 'Pago a ' else 'Abono a ' end || v_nombre, 'abono_proveedor', v_abono_id);
  end if;

  return v_resta;
end $$;
grant execute on function public.abonar_proveedor(uuid, numeric, uuid, date, text, text, uuid[], uuid) to authenticated;

-- ---------- 2. Anular un pago (solo Gerencia) ----------
create or replace function public.anular_abono_proveedor(p_abono_id uuid, p_motivo text, p_usuario text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a record; v_prov_grupo uuid; v_factura uuid; f record; v_hoy date := (now() at time zone 'America/Bogota')::date; v_nombre text;
begin
  if not public.jwt_es_gerencia() then raise exception 'Solo Gerencia puede anular'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba por qué se anula'; end if;
  select * into a from public.abonos_proveedores where id = p_abono_id for update;
  if a.id is null or not (a.empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Pago no encontrado'; end if;
  if a.despacho_id is not null then raise exception 'Es un cruce con una liquidación: se corrige en la liquidación de esa ruta'; end if;
  select nombre into v_nombre from public.proveedores where id = a.proveedor_id;

  -- Lo que se le debe al proveedor vuelve a subir.
  perform public._sumar_deuda_proveedor(a.empresa_id, a.proveedor_id, a.valor);

  -- La plata vuelve a la cuenta de donde salió.
  if a.cuenta_id is not null and exists (select 1 from public.movimientos_tesoreria where referencia_tipo = 'abono_proveedor' and referencia_id = a.id) then
    insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
    values (a.empresa_id, a.cuenta_id, v_hoy, 'entrada', a.valor, 'Anulación: pago a ' || coalesce(v_nombre, 'proveedor'), 'abono_proveedor', a.id);
  end if;

  -- Si lo pagó la otra empresa: baja lo que se le debe a ella y se anula su cobro.
  if a.pagado_por_empresa_id is not null then
    if a.cartera_fiado_id is not null then
      select * into f from public.cartera_fiados where id = a.cartera_fiado_id for update;
      if f.id is not null and f.estado <> 'anulado' then
        if coalesce(f.saldo, 0) < coalesce(f.valor_original, 0) - 0.5 then
          raise exception 'El cobro en la otra empresa ya tiene abonos: arréglelo primero en su Cartera';
        end if;
        update public.cartera_fiados set estado = 'anulado', saldo = 0 where id = f.id;
      end if;
    end if;
    select id into v_prov_grupo from public.proveedores where empresa_id = a.empresa_id and empresa_grupo_id = a.pagado_por_empresa_id limit 1;
    if v_prov_grupo is not null then
      select id into v_factura from public.facturas_proveedores where proveedor_id = v_prov_grupo and empresa_id = a.empresa_id and estado = 'pendiente' limit 1 for update;
      if v_factura is not null then
        update public.facturas_proveedores set total_pendiente = greatest(coalesce(total_pendiente, 0) - a.valor, 0),
          estado = case when coalesce(total_pendiente, 0) - a.valor <= 0.5 then 'pagado' else 'pendiente' end, updated_at = now() where id = v_factura;
      end if;
    end if;
  end if;

  insert into public.correcciones (empresa_id, tipo, referencia_id, motivo, antes, despues, usuario)
  values (a.empresa_id, 'abono_proveedor', a.id, trim(p_motivo), to_jsonb(a), '{"anulado": true}'::jsonb, p_usuario);
  delete from public.abonos_proveedores where id = a.id;
end $$;
grant execute on function public.anular_abono_proveedor(uuid, text, text) to authenticated;
