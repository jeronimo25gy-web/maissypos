-- Migración de datos: Caja y bancos (saldo inicial de cada cuenta) y
-- Empleados. Cada fila queda marcada con su lote para poder deshacerla.
alter table public.cuentas add column if not exists migracion_lote uuid;
alter table public.empleados add column if not exists migracion_lote uuid;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.migracion_deshacer(uuid, boolean)'::regprocedure);
  v_def := replace(v_def, '  if p_final then', $txt$  -- Cuentas: solo si no tienen movimientos ni las usa otra tabla.
  for r in select id from public.cuentas where migracion_lote = p_lote loop
    if exists (select 1 from public.movimientos_tesoreria m where m.cuenta_id = r.id) then
      k := k + 1;
    else
      begin
        delete from public.cuentas where id = r.id; b := b + 1;
      exception when foreign_key_violation then k := k + 1;
      end;
    end if;
  end loop;
  -- Empleados: se conservan si ya tienen nómina u otro registro.
  for r in select id from public.empleados where migracion_lote = p_lote loop
    begin
      delete from public.empleados where id = r.id; b := b + 1;
    exception when foreign_key_violation then k := k + 1;
    end;
  end loop;

  if p_final then$txt$);
  execute v_def;
end $$;
