-- Ajustes de Inventario: aprobar/rechazar como transaccion atomica.
--
-- Antes, aprobar una divergencia hacia 3 escrituras secuenciales desde el
-- cliente (insert inventario_mov, update divergencias_inventario, insert
-- audit_ajustes_inventario). Si la segunda o tercera fallaba (red, RLS, lo
-- que sea) despues de que la primera ya se hizo, quedaba un movimiento de
-- inventario fantasma sin divergencia aprobada ni rastro de auditoria --
-- exactamente el hueco de integridad que este modulo existe para cerrar.
-- Se mueve la logica a funciones de Postgres: las escrituras de una sola
-- llamada a funcion son atomicas (si algo falla adentro, se revierte todo).
--
-- Nota: esta migracion solo crea las funciones, no cambia el codigo de la
-- app todavia -- se deja lista para conectar en un paso aparte, sin riesgo
-- de romper el boton de aprobar/rechazar que hoy funciona.

create or replace function public.aprobar_divergencia_inventario(
  p_divergencia_id uuid,
  p_cantidad_real numeric,
  p_motivo_ajuste text,
  p_usuario_nombre text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_ajuste numeric;
  v_fue_corregida boolean;
  v_detalle text;
begin
  if not public.jwt_puede_aprobar_inventario() then
    raise exception 'No tienes permiso para aprobar ajustes de inventario';
  end if;

  select * into d from public.divergencias_inventario
  where id = p_divergencia_id and empresa_id = any (public.jwt_empresa_ids())
  for update;

  if not found then
    raise exception 'Divergencia no encontrada';
  end if;
  if d.estado <> 'pendiente' then
    raise exception 'Esta divergencia ya fue resuelta';
  end if;

  v_ajuste := p_cantidad_real - d.cantidad_sistema;
  v_fue_corregida := p_cantidad_real <> d.cantidad_fisica;

  if v_ajuste <> 0 then
    insert into public.inventario_mov (empresa_id, sku, cantidad, fecha, tipo_movimiento, referencia)
    values (
      d.empresa_id, d.sku, abs(v_ajuste), current_date,
      case when v_ajuste > 0 then 'entrada' else 'salida' end,
      'Ajuste por conteo del ' || d.fecha || ', aprobado por ' || p_usuario_nombre ||
        case when v_fue_corregida then ' (cantidad corregida)' else '' end
    );
  end if;

  update public.divergencias_inventario set
    estado = 'aprobado',
    revisado_por = (select id from public.usuarios where auth_user_id = auth.uid()),
    revisado_en = now(),
    cantidad_corregida = p_cantidad_real,
    motivo_ajuste = p_motivo_ajuste
  where id = p_divergencia_id;

  if v_fue_corregida then
    v_detalle := d.registrado_por || ' conto ' || d.cantidad_fisica || ', se corrigio a ' || p_cantidad_real ||
      '. Motivo: ' || coalesce(p_motivo_ajuste, '') || '. Ajuste de inventario: ' ||
      case when v_ajuste = 0 then 'ninguno' else (case when v_ajuste > 0 then 'entrada' else 'salida' end || ' de ' || abs(v_ajuste)) end;
  else
    v_detalle := 'Se aprobo tal cual lo contado (' || p_cantidad_real || '). Ajuste de inventario: ' ||
      case when v_ajuste = 0 then 'ninguno' else (case when v_ajuste > 0 then 'entrada' else 'salida' end || ' de ' || abs(v_ajuste)) end ||
      case when p_motivo_ajuste is not null and p_motivo_ajuste <> '' then '. Nota: ' || p_motivo_ajuste else '' end;
  end if;

  insert into public.audit_ajustes_inventario (empresa_id, divergencia_id, accion, usuario, detalle)
  values (d.empresa_id, d.id, 'aprobada', p_usuario_nombre, v_detalle);
end;
$$;

create or replace function public.rechazar_divergencia_inventario(
  p_divergencia_id uuid,
  p_motivo_rechazo text,
  p_usuario_nombre text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if not public.jwt_puede_aprobar_inventario() then
    raise exception 'No tienes permiso para aprobar ajustes de inventario';
  end if;

  select * into d from public.divergencias_inventario
  where id = p_divergencia_id and empresa_id = any (public.jwt_empresa_ids())
  for update;

  if not found then
    raise exception 'Divergencia no encontrada';
  end if;
  if d.estado <> 'pendiente' then
    raise exception 'Esta divergencia ya fue resuelta';
  end if;

  update public.divergencias_inventario set
    estado = 'rechazado',
    revisado_por = (select id from public.usuarios where auth_user_id = auth.uid()),
    revisado_en = now(),
    motivo_rechazo = p_motivo_rechazo
  where id = p_divergencia_id;

  insert into public.audit_ajustes_inventario (empresa_id, divergencia_id, accion, usuario, detalle)
  values (d.empresa_id, d.id, 'rechazada', p_usuario_nombre, coalesce(p_motivo_rechazo, 'Sin motivo especificado'));
end;
$$;

grant execute on function public.aprobar_divergencia_inventario(uuid, numeric, text, text) to authenticated;
grant execute on function public.rechazar_divergencia_inventario(uuid, text, text) to authenticated;
