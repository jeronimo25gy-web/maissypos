-- Descuentos de la operación (productos, consumo propio, descuadres, préstamos
-- en ruta o en Gastos) que no se cobraron en su quincena y pasan a otra.
-- clave identifica el descuento original: concepto|fecha|valor.
-- Mientras nomina_pago_id está vacío se puede devolver o volver a pasar.
create table if not exists public.nomina_aplazados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  empleado_id uuid not null references public.empleados(id),
  de_periodo text not null,
  de_quincena smallint not null check (de_quincena in (1, 2)),
  a_periodo text not null,
  a_quincena smallint not null check (a_quincena in (1, 2)),
  concepto text not null,
  fecha date not null,
  valor numeric not null check (valor > 0),
  clave text not null,
  nomina_pago_id uuid references public.nomina_pagos(id) on delete set null,
  registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists nomina_aplazados_de on public.nomina_aplazados (empresa_id, de_periodo, de_quincena);
create index if not exists nomina_aplazados_a on public.nomina_aplazados (empresa_id, a_periodo, a_quincena);

alter table public.nomina_aplazados enable row level security;
create policy admin_select on public.nomina_aplazados for select using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_insert on public.nomina_aplazados for insert with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_update on public.nomina_aplazados for update using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin') with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_delete on public.nomina_aplazados for delete using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin' and nomina_pago_id is null);
create policy solo_lectura_ins on public.nomina_aplazados as restrictive for insert with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_upd on public.nomina_aplazados as restrictive for update using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_del on public.nomina_aplazados as restrictive for delete using (not (select public.cliente_bloqueado()));
create policy suspendido_sin_lectura on public.nomina_aplazados as restrictive for select using (not (select public.cliente_suspendido()));

alter table public.correcciones drop constraint if exists correcciones_tipo_check;
alter table public.correcciones add constraint correcciones_tipo_check check (tipo in ('despacho', 'compra', 'abono_proveedor', 'nomina_pago'));

-- Anula un pago de nómina ya registrado (solo Gerencia): la plata vuelve a la
-- cuenta, se quitan las cuotas de préstamo que aplicó, propinas y sobrantes
-- vuelven a pendientes, las transferencias vuelven a cargadas, los descuentos
-- aplazados que cobró vuelven a quedar por cobrar y se baja el recobro de las
-- incapacidades. El empleado queda pendiente en esa quincena.
create or replace function public.anular_pago_nomina(p_pago_id uuid, p_motivo text, p_usuario text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare pg record; v_hoy date := (now() at time zone 'America/Bogota')::date; v_nombre text; t jsonb;
begin
  if not public.jwt_es_gerencia() then raise exception 'Solo Gerencia puede anular'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba por qué se anula'; end if;
  select * into pg from public.nomina_pagos where id = p_pago_id for update;
  if pg.id is null or not (pg.empresa_id = any (public.jwt_empresa_ids())) then raise exception 'Pago no encontrado'; end if;
  select nombre into v_nombre from public.empleados where id = pg.empleado_id;

  -- Recobro de incapacidades: solo se puede devolver si el pago guardó el detalle.
  if coalesce(pg.incapacidad_recobro, 0) > 0 then
    if jsonb_typeof(pg.detalle -> 'tramos') is distinct from 'array' then
      raise exception 'Este pago tiene incapacidad por cobrar a la EPS o ARL y no se puede anular desde aquí';
    end if;
    for t in select * from jsonb_array_elements(pg.detalle -> 'tramos') loop
      update public.nomina_incapacidades set valor_recobro = greatest(coalesce(valor_recobro, 0) - coalesce((t ->> 'recobro')::numeric, 0), 0)
      where id = (t ->> 'id')::uuid;
    end loop;
  end if;

  -- Cuotas de préstamos: se borran y el préstamo vuelve a quedar activo.
  update public.nomina_prestamos set estado = 'activo'
  where id in (select prestamo_id from public.nomina_prestamos_abonos where nomina_pago_id = pg.id) and estado = 'pagado';
  delete from public.nomina_prestamos_abonos where nomina_pago_id = pg.id;

  update public.nomina_a_favor set estado = 'pendiente', nomina_pago_id = null where nomina_pago_id = pg.id;
  update public.transferencias_ruta set estado = 'cargada', nomina_pago_id = null where nomina_pago_id = pg.id;
  update public.nomina_aplazados set nomina_pago_id = null where nomina_pago_id = pg.id;

  -- La plata vuelve a la cuenta de donde salió.
  if pg.cuenta_id is not null and exists (select 1 from public.movimientos_tesoreria where referencia_tipo = 'nomina' and referencia_id = pg.id) then
    insert into public.movimientos_tesoreria (empresa_id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, referencia_id)
    values (pg.empresa_id, pg.cuenta_id, v_hoy, 'entrada', pg.neto_a_pagar, 'Anulación: nómina de ' || coalesce(v_nombre, 'empleado'), 'nomina', pg.id);
  end if;

  insert into public.correcciones (empresa_id, tipo, referencia_id, motivo, antes, despues, usuario)
  values (pg.empresa_id, 'nomina_pago', pg.id, trim(p_motivo), to_jsonb(pg), '{"anulado": true}'::jsonb, p_usuario);
  delete from public.nomina_pagos where id = pg.id;
end $$;
grant execute on function public.anular_pago_nomina(uuid, text, text) to authenticated;
