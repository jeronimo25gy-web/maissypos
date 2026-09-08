-- grupo_pnl solo sumaba liquidaciones.efectivo_esperado (ventas por ruta)
-- como "ventas", dejando fuera las ventas de mostrador (ventas_encab). Esto
-- subestimaba los ingresos de cualquier empresa que tambien venda por
-- mostrador (ej. Distri Maissy SAS). Se agrega ventas_ruta y
-- ventas_mostrador desglosados, mas total_ventas como la suma de ambos --
-- mismo criterio que Financiero > P&L (app/(app)/financiero/page.js).
--
-- Esta migracion documenta y actualiza la funcion que ya existe en
-- produccion (creada fuera de este repo, sin migracion previa) -- ver
-- tambien el hallazgo de custom_access_token_hook, que tiene el mismo
-- problema de no estar documentado.

create or replace function public.grupo_pnl(p_empresa_ids uuid[], p_inicio date, p_fin date)
returns table(empresa_id uuid, ventas numeric, ventas_ruta numeric, ventas_mostrador numeric, gastos numeric)
language sql
security definer
set search_path to 'public'
as $function$
  select
    e.id as empresa_id,
    coalesce(liq.ventas, 0) + coalesce(vm.ventas, 0) as ventas,
    coalesce(liq.ventas, 0) as ventas_ruta,
    coalesce(vm.ventas, 0) as ventas_mostrador,
    coalesce(gr.gastos, 0) + coalesce(ga.gastos, 0) as gastos
  from empresas e
  left join (
    select empresa_id, sum(efectivo_esperado) as ventas
    from liquidaciones
    where fecha >= p_inicio and fecha <= p_fin
    group by empresa_id
  ) liq on liq.empresa_id = e.id
  left join (
    select empresa_id, sum(total) as ventas
    from ventas_encab
    where estado = 'confirmada' and fecha >= p_inicio and fecha <= p_fin
    group by empresa_id
  ) vm on vm.empresa_id = e.id
  left join (
    select empresa_id, sum(valor) as gastos
    from liquidaciones_gastos
    where fecha >= p_inicio and fecha <= p_fin
    group by empresa_id
  ) gr on gr.empresa_id = e.id
  left join (
    select empresa_id, sum(valor) as gastos
    from gastos_admin
    where fecha >= p_inicio and fecha <= p_fin
    group by empresa_id
  ) ga on ga.empresa_id = e.id
  where e.id = any(p_empresa_ids);
$function$;
