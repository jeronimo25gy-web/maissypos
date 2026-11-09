-- grupo_pnl es SECURITY DEFINER (salta RLS) y no revisaba quien la llamaba:
-- cualquiera, incluso sin sesion, podia leer ventas y gastos de cualquier
-- empresa con su id. Ahora solo responde a administradores (Gerencia entra con
-- rol admin en el JWT), solo para empresas de su JWT y no a clientes
-- suspendidos. Ademas se le quita la ejecucion a anon.
create or replace function public.grupo_pnl(p_empresa_ids uuid[], p_inicio date, p_fin date)
returns table(empresa_id uuid, ventas numeric, ventas_ruta numeric, ventas_mostrador numeric, gastos numeric)
language sql
stable
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
  where e.id = any(p_empresa_ids)
    and e.id = any(public.jwt_empresa_ids())
    and coalesce(public.jwt_rol(), '') = 'admin'
    and not public.cliente_suspendido();
$function$;

revoke execute on function public.grupo_pnl(uuid[], date, date) from public, anon;
grant execute on function public.grupo_pnl(uuid[], date, date) to authenticated;
